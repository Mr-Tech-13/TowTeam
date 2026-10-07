/* Connected papers share draft answers; standalone drafts stay in this browser. */
const storageKey = 'towteam-paper-prototype-v1';
const template = window.TOW_TEMPLATE;
const textFields = template.fields.filter((field) => field.type === '/Tx' && field.name !== 'RED');
const checks = template.fields.filter((field) => field.type === '/Btn');
const groups = [ ['TTWS', 0, 4], ['Preparation', 4, 14], ['During Tow', 14, 19], ['Completion', 19, 25] ];
const risks = ['Tow from', 'Tow to', 'Final agreed status'];
const towId = new URLSearchParams(location.search).get('tow');
const connected = location.pathname.startsWith('/api/paper-editor');
let revision = 0;
let ready = !connected;
let dirty = false;
let busy = false;
let editVersion = 0;
let saveTimer;
let saving;
let conflict = false;
let canAutofill = false;
let state = { text: {}, answers: {}, risk: {} };
let page = 0;
try {
  const saved = connected ? null : JSON.parse(localStorage.getItem(storageKey));
  if (saved?.text && saved?.answers && saved?.risk) state = saved;
} catch { /* An unavailable or invalid local draft starts blank. */ }
const $ = (id) => document.getElementById(id);
const message = (text) => {
  $('message').textContent = text;
  const failed = conflict || /not saved:|permission required|unable|failed/i.test(text);
  $('drawer-status').textContent = failed ? 'Save failed' : busy ? 'Saving...' : dirty ? 'Unsaved' : ready ? 'Saved' : 'Loading...';
  $('drawer-status').dataset.error = String(failed);
};
$('drawer-toggle').addEventListener('click', () => {
  const open = document.querySelector('main').classList.toggle('drawer-open');
  $('drawer-toggle').setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !window.matchMedia('(max-width: 750px)').matches || !document.querySelector('main').classList.contains('drawer-open')) return;
  document.querySelector('main').classList.remove('drawer-open');
  $('drawer-toggle').setAttribute('aria-expanded', 'false');
  $('drawer-toggle').focus();
});
function scheduleSave(delay = 600) {
  clearTimeout(saveTimer);
  if (!ready || conflict) return;
  saveTimer = setTimeout(() => void saveDraft(), delay);
}
function changed() { dirty = true; editVersion += 1; message(conflict ? 'Autosave paused: another user updated this paper. Reload the saved draft to continue.' : 'Unsaved changes'); updateSummary(); scheduleSave(); }
async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || 'Unable to load tow paper.'); error.status = response.status; throw error; }
  return body;
}
async function loadShared() {
  clearTimeout(saveTimer);
  if (saving) await saving;
  clearTimeout(saveTimer);
  ready = false;
  document.querySelector('main').inert = true;
  $('save').disabled = true; $('export').disabled = true; $('reset').disabled = true;
  try {
    if (!/^\d+$/.test(towId || '')) throw new Error('Open this editor from a tow using Edit Tow Paper.');
    const tow = await request(`/api/tows/${towId}`);
    const session = await request('/api/auth/me');
    canAutofill = Boolean(session.user?.autofill);
    $('autofill').hidden = !canAutofill;
    $('checklist-title').hidden = canAutofill;
    const draft = await request(`/api/tows/${towId}/paper-draft`);
    state = draft.state || {text:{},answers:{},risk:{}};
    revision = draft.revision;
    dirty = false; ready = true; conflict = false;
    $('draft-scope').textContent = `${tow.tailNumber || tow.airline} / shared tow draft`;
    message(draft.updatedAt ? `Shared draft saved ${new Date(draft.updatedAt).toLocaleString()}` : 'New shared draft / not saved');
    render(); renderRisks();
  } catch (error) { message(error.message); }
  finally {
    document.querySelector('main').inert = !ready;
    $('save').disabled = !ready; $('export').disabled = !ready; $('reset').disabled = !ready;
  }
}
function position(element, rect) {
  const [x1,y1,x2,y2] = rect;
  Object.assign(element.style, { left: `${x1/612*100}%`, top: `${(792-y2)/792*100}%`, width: `${(x2-x1)/612*100}%`, height: `${(y2-y1)/792*100}%` });
}
function render() {
  $('page-image').src = `assets/page-${page+1}.png`;
  $('page-image').alt = `Aircraft Towing Checklist page ${page+1}`;
  $('fields').replaceChildren();
  document.querySelectorAll('[data-page]').forEach((button) => button.classList.toggle('selected', Number(button.dataset.page) === page));
  for (const field of textFields.filter((item) => item.page === page)) {
    const input = document.createElement('input');
    input.className = 'pdf-field';
    input.value = state.text[field.name] || '';
    const commentIndex = textFields.filter((item) => item.page > 0 && item.name !== 'Full Name').indexOf(field);
    const label = field.name === 'Full Name' ? 'TTWS tester full name and time' : field.name.startsWith('undefined') || field.name.startsWith('If ') ? `Checklist item ${commentIndex+1} exception comment` : field.name;
    input.setAttribute('aria-label', label);
    input.title = label;
    input.maxLength = field.rect[2]-field.rect[0] < 80 ? 20 : 150;
    position(input, field.rect);
    input.addEventListener('input', () => { state.text[field.name] = input.value; changed(); });
    $('fields').append(input);
  }
  for (const field of checks.filter((item) => item.page === page)) {
    const index = checks.indexOf(field);
    const row = Math.floor(index/2);
    const answer = index % 2 === 0 ? 'yes' : 'no';
    const button = document.createElement('button');
    button.className = 'pdf-field pdf-check';
    const selected = state.answers[row] === answer;
    button.textContent = selected ? 'X' : '';
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `Checklist item ${row+1}: ${answer}`);
    button.title = `Item ${row+1}: ${answer}`;
    position(button, field.rect);
    button.addEventListener('click', () => { state.answers[row] = selected ? '' : answer; changed(); render(); });
    $('fields').append(button);
  }
  if (page === 0) drawRiskRings();
  updateSummary();
}
const riskRects = {
  'Tow from': { red: [96,628,139,648], amber: [141,628,192,648], green: [192,628,266,650] },
  'Tow to': { red: [324,628,367,648], amber: [369,628,427,648], green: [430,628,504,650] },
  'Final agreed status': { green: [34,146,198,168], amber: [215,146,375,168], red: [392,146,552,168] }
};
function drawRiskRings() {
  for (const key of risks) {
    const color = state.risk[key];
    if (!riskRects[key][color]) continue;
    const ring = document.createElement('span');
    ring.className = 'risk-ring';
    ring.style.borderColor = { red:'#ef4444', amber:'#d97706', green:'#43b521' }[color];
    position(ring, riskRects[key][color]);
    $('fields').append(ring);
  }
}
function renderRisks() {
  $('risk-controls').replaceChildren();
  for (const key of risks) {
    const group = document.createElement('div'); group.className = 'risk-group';
    const label = document.createElement('span'); label.textContent = key; group.append(label);
    const options = document.createElement('div'); options.className = 'risk-options';
    for (const color of ['red','amber','green']) {
      const button = document.createElement('button'); button.dataset.color = color;
      button.textContent = color[0].toUpperCase()+color.slice(1);
      button.classList.toggle('selected',state.risk[key] === color);
      button.setAttribute('aria-pressed', String(state.risk[key] === color));
      button.setAttribute('aria-label', `${key}: ${color}`);
      button.addEventListener('click', () => { state.risk[key] = state.risk[key] === color ? '' : color; changed(); renderRisks(); render(); });
      options.append(button);
    }
    group.append(options); $('risk-controls').append(group);
  }
}
function updateSummary() {
  $('progress').textContent = `${Object.values(state.answers).filter(Boolean).length} / 25 answered`;
  $('checklist-summary').replaceChildren();
  for (const [name,start,end] of groups) {
    const row = document.createElement('div'); row.className = 'summary-row';
    const label = document.createElement('span'); label.textContent = name;
    const count = document.createElement('span'); count.textContent = `${Array.from({length:end-start},(_,i)=>state.answers[i+start]).filter(Boolean).length} / ${end-start}`;
    row.append(label,count); $('checklist-summary').append(row);
  }
}
async function saveDraft() {
  clearTimeout(saveTimer);
  if (!ready || conflict) return false;
  if (saving) {
    if (!await saving) return false;
    return dirty ? saveDraft() : true;
  }
  if (!dirty) return true;
  busy = true; $('save').disabled = true; $('reload').disabled = true;
  saving = (async () => {
    try {
      while (dirty) {
        const version = editVersion;
        const snapshot = JSON.parse(JSON.stringify(state));
        message('Saving draft...');
        if (connected) {
          const result = await request(`/api/tows/${towId}/paper-draft`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:snapshot,revision})});
          revision = result.revision;
        } else localStorage.setItem(storageKey,JSON.stringify(snapshot));
        dirty = version !== editVersion;
      }
      message(connected ? 'Shared draft saved / available to other signed-in users' : 'Draft saved on this browser');
      return true;
    } catch (error) {
      conflict = error.status === 409;
      message(`Draft not saved: ${error.message}`);
      if (connected && !conflict && (!error.status || error.status >= 500)) scheduleSave(5000);
      return false;
    }
  })();
  const result = await saving;
  saving = null; busy = false; $('save').disabled = false; $('reload').disabled = false;
  message($('message').textContent);
  return result;
}
$('save').addEventListener('click', () => void saveDraft());
$('autofill').addEventListener('click', async () => {
  if (!connected || !canAutofill || !ready || !await saveDraft()) return;
  busy = true;
  document.querySelector('main').inert = true;
  $('save').disabled = true; $('reload').disabled = true; $('export').disabled = true;
  try {
    const result = await request(`/api/tows/${towId}/paper-draft/autofill`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision})});
    state = result.state; revision = result.revision; dirty = false;
    render(); renderRisks();
    message('Blank checklist items autofilled and saved');
  } catch (error) {
    conflict = error.status === 409;
    if (error.status === 403) { canAutofill = false; $('autofill').hidden = true; $('checklist-title').hidden = false; }
    message(error.message);
  } finally {
    busy = false; document.querySelector('main').inert = false;
    $('save').disabled = false; $('reload').disabled = false; $('export').disabled = false;
    message($('message').textContent);
  }
});
$('reset').addEventListener('click', () => {
  if (!ready || busy || !confirm('Reset risk assessment, checklist answers, and exception comments? Tow details and member names will be kept.')) return;
  const text = { ...state.text };
  for (const field of textFields) {
    if (field.page > 0 && field.name !== 'Full Name') delete text[field.name];
  }
  delete text.RED;
  state = { text, answers: {}, risk: {} };
  render(); renderRisks(); changed();
});
document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {page=Number(button.dataset.page);render();$('paper-scroll').scrollTop=0;}));
$('zoom').addEventListener('change', () => { const value=$('zoom').value; $('paper').style.width = value==='fit' ? 'min(100%, 816px)' : `${816*Number(value)}px`; });
$('export').addEventListener('click', async () => {
  if (!ready) return;
  if (connected && !await saveDraft()) return;
  $('export').disabled = true;
  try {
    if (connected) {
      const response = await fetch(`/api/tows/${towId}/tow-checklist.pdf`, {credentials:'same-origin'});
      if (!response.ok) { const error = await response.json().catch(()=>({})); throw new Error(error.error || 'Unable to download tow paper.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href=url; link.download=`tow-paper-${towId}.pdf`; link.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      message('Saved tow paper downloaded');
      return;
    }
    const {PDFDocument,StandardFonts,rgb} = window.PDFLib;
    const pdf = await PDFDocument.create();
    const pages = [];
    // Rendered originals avoid damaged embedded fonts in this template.
    for (const original of template.pages) {
      const image = await pdf.embedPng(Uint8Array.from(atob(original),(char)=>char.charCodeAt(0)));
      const sheet = pdf.addPage([612,792]);
      sheet.drawImage(image,{x:0,y:0,width:612,height:792});
      pages.push(sheet);
    }
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    for (const field of textFields) {
      const value = state.text[field.name];
      const [x,,x2,y2] = field.rect;
      if (!value) continue;
      const width = x2-x-4;
      const size = Math.min(10, Math.max(5,width/font.widthOfTextAtSize(value,1)));
      if (font.widthOfTextAtSize(value,size)>width) throw new Error(`Text is too long in ${field.name}. Shorten it before exporting.`);
      pages[field.page].drawText(value,{x:x+2,y:y2-size-1,size,font,color:rgb(0,0,0)});
    }
    checks.forEach((field,index) => {
      const answer=index%2===0?'yes':'no';
      if(state.answers[Math.floor(index/2)]!==answer)return;
      const [x,y,x2,y2]=field.rect;
      pages[field.page].drawText('X',{x:(x+x2)/2-3.5,y:(y+y2)/2-4,size:11,font:bold});
    });
    for(const key of risks) {
      const color=state.risk[key]; const rect=riskRects[key][color]; if(!rect)continue;
      const [x,y,x2,y2]=rect;
      const colors={red:rgb(.9,.1,.1),amber:rgb(.8,.45,0),green:rgb(.2,.7,.1)};
      pages[0].drawEllipse({x:(x+x2)/2,y:(y+y2)/2,xScale:(x2-x)/2,yScale:(y2-y)/2,borderWidth:1.6,borderColor:colors[color]});
    }
    const bytes=await pdf.save();
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const link=document.createElement('a');link.href=url;link.download='tow-paper-prototype.pdf';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    message('PDF exported / local prototype only');
  } catch(error) {message(`Export failed: ${error.message}`);} finally {$('export').disabled=false;}
});
render(); renderRisks();
if (!connected) { $('save').hidden = false; $('export').hidden = false; }
if (connected) {
  $('menu').hidden = false;
  const returnView = new URLSearchParams(location.search).get('return');
  const view = ['confirm','workflow','complete'].includes(returnView) ? returnView : 'confirm';
  $('menu').href = `/?tow=${encodeURIComponent(towId || '')}&view=${view}`;
  $('menu').addEventListener('click', async (event) => {
    event.preventDefault();
    if (!ready || busy && !saving) return;
    if (await saveDraft()) location.assign($('menu').href);
  });
  $('reload').addEventListener('click', () => { if (!dirty || confirm('Discard your unsaved changes and reload the shared draft?')) void loadShared(); });
  void loadShared();
}
window.addEventListener('online', () => { if (dirty && !conflict) void saveDraft(); });
window.addEventListener('beforeunload', (event) => { if (!dirty) return; event.preventDefault(); event.returnValue = ''; });
