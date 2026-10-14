import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { router } from '../routes/tows.js';
import { createTow, deleteTow } from '../services/tows.js';
import { createUser, createSession } from '../services/users.js';
import { getTowPaperDraft, saveTowPaperDraft } from '../services/towPaperDrafts.js';
import { preparePaperEditorAssets } from '../services/paperEditorAssets.js';
import { paperArchiveFilename } from '../../shared/paperExport.js';

test('archive names use the export date in New York and distinguish active from History', () => {
  const date = new Date('2026-10-14T01:00:00Z');
  assert.equal(paperArchiveFilename('history', date), 'towpermits-2026-10-13.zip');
  assert.equal(paperArchiveFilename('active', date), 'activetowpermits-2026-10-13.zip');
});

test('History downloads one saved PDF or a ZIP with uniquely named saved papers', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'tow-export-test-'));
  const previous = process.env.TOW_PAPER_ASSETS_PATH;
  const python = process.env.PDF_PYTHON_BIN || 'python3';
  process.env.TOW_PAPER_ASSETS_PATH = path.join(dir,'assets');
  const user = createUser({username:`export-user-${Date.now()}`,password:'test-only'});
  const admin = createUser({username:`export-admin-${Date.now()}`,password:'test-only',role:'admin'});
  const tows = [createTow({airline:'MX',tailNumber:'SAME',gate:'Gate 1',towSpot:'NL614',status:'completed'}),
    createTow({airline:'MX',tailNumber:'SAME',gate:'Gate 1',towSpot:'NL614',status:'completed'}),
    createTow({airline:'MX',tailNumber:'ACTIVE',status:'planned'})];
  const headers = {Cookie:`towteam_session=${createSession(user.id).token}`,'Content-Type':'application/json'};
  const app = express(); app.use(express.json()); app.use(requireAuth); app.use('/api/tows',router);
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/tows/paper-export`;
  const request = ids=>fetch(base,{method:'POST',headers,body:JSON.stringify({ids})});
  const adminHeaders = { ...headers, Cookie: `towteam_session=${createSession(admin.id).token}` };
  const activeRequest = ()=>fetch(base,{method:'POST',headers:adminHeaders,body:JSON.stringify({scope:'active'})});
  try {
    const templatePath = path.join(dir,'TowPermit.pdf');
    execFileSync(python,[fileURLToPath(new URL('./fixtures/towPaperTemplate.py',import.meta.url)),templatePath]);
    await preparePaperEditorAssets({templatePath,assetsPath:process.env.TOW_PAPER_ASSETS_PATH,pythonBin:python});
    for (const [index,tow] of tows.slice(0,2).entries()) {
      const state = getTowPaperDraft(tow.id).state;
      state.text['Aircraft Reg'] = `SAVED${index}`; state.answers[0]='no'; state.risk['Tow from']='amber';
      saveTowPaperDraft(tow.id,{state,revision:0},user.id);
    }
    assert.equal((await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[tows[0].id]})})).status,401);
    for (const ids of [[],[tows[0].id,tows[0].id],['1'],[-1],Array.from({length:101},(_,i)=>i+1)]) assert.equal((await request(ids)).status,400);
    assert.equal((await request([999999999])).status,404);
    assert.equal((await request([tows[2].id])).status,400);
    assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify({scope:'active'})})).status,403);
    assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify({scope:'unknown',ids:[tows[0].id]})})).status,400);
    const activeState = getTowPaperDraft(tows[2].id).state;
    activeState.text['Aircraft Reg'] = 'ACTIVE-SAVED';
    saveTowPaperDraft(tows[2].id,{state:activeState,revision:0},admin.id);
    const activeSingle = await activeRequest(); assert.equal(activeSingle.status,200);
    assert.match(activeSingle.headers.get('content-type'),/^application\/pdf/);
    const activePdf = path.join(dir,'active.pdf'); await fs.writeFile(activePdf,Buffer.from(await activeSingle.arrayBuffer()));
    assert.match(execFileSync(python,['-c',"import sys; from pypdf import PdfReader; print(' '.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))",activePdf],{encoding:'utf8'}),/ACTIVE-SAVED/);
    const progress = createTow({airline:'MX',tailNumber:'IN-PROGRESS',status:'tow_started'});
    const deleted = createTow({airline:'MX',tailNumber:'DELETED',status:'planned'});
    db.prepare("UPDATE tows SET deletedAt = '2026-10-13' WHERE id = ?").run(deleted.id);
    tows.push(progress,deleted);
    const activeMultiple = await activeRequest(); assert.equal(activeMultiple.status,200);
    assert.match(activeMultiple.headers.get('content-disposition'),/activetowpermits-\d{4}-\d{2}-\d{2}\.zip/);
    const activeZip = path.join(dir,'active.zip'); await fs.writeFile(activeZip,Buffer.from(await activeMultiple.arrayBuffer()));
    const activeContents = JSON.parse(execFileSync(python,['-c',"import sys,json,io,zipfile; from pypdf import PdfReader; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([{'name':n,'text':' '.join(p.extract_text() for p in PdfReader(io.BytesIO(z.read(n))).pages)} for n in z.namelist()]))",activeZip],{encoding:'utf8'}));
    assert.equal(activeContents.length,2);
    assert.ok(activeContents.some(item=>item.text.includes('ACTIVE-SAVED')));
    assert.ok(activeContents.some(item=>item.text.includes('IN-PROGRESS')));
    assert.ok(activeContents.every(item=>!item.text.includes('DELETED') && !item.text.includes('SAVED0')));
    db.prepare("UPDATE tows SET deletedAt = '2026-10-13' WHERE id IN (?, ?)").run(tows[2].id,progress.id);
    const emptyActive = await activeRequest(); assert.equal(emptyActive.status,400);
    assert.match((await emptyActive.json()).error,/no active tow papers/i);
    for (let index = 0; index < 101; index += 1) tows.push(createTow({airline:'MX',status:'planned'}));
    const oversizedActive = await activeRequest(); assert.equal(oversizedActive.status,400);
    assert.match((await oversizedActive.json()).error,/limited to 100 tows/);
    const single = await request([tows[0].id]); assert.equal(single.status,200);
    assert.match(single.headers.get('content-type'),/^application\/pdf/); assert.equal(single.headers.get('cache-control'),'private, no-store');
    const pdf = path.join(dir,'single.pdf'); await fs.writeFile(pdf,Buffer.from(await single.arrayBuffer()));
    const text = execFileSync(python,['-c',"import sys; from pypdf import PdfReader; print(' '.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))",pdf],{encoding:'utf8'});
    assert.match(text,/SAVED0/);
    const multiple = await request(tows.slice(0,2).map(tow=>tow.id)); assert.equal(multiple.status,200);
    assert.match(multiple.headers.get('content-type'),/^application\/zip/);
    assert.match(multiple.headers.get('content-disposition'),/filename="towpermits-\d{4}-\d{2}-\d{2}\.zip"/);
    const zip = path.join(dir,'multiple.zip'); await fs.writeFile(zip,Buffer.from(await multiple.arrayBuffer()));
    const contents = JSON.parse(execFileSync(python,['-c',"import sys,json,io,zipfile; from pypdf import PdfReader; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([{'name':n,'text':' '.join(p.extract_text() for p in PdfReader(io.BytesIO(z.read(n))).pages)} for n in z.namelist()]))",zip],{encoding:'utf8'}));
    assert.equal(contents.length,2); assert.equal(new Set(contents.map(item=>item.name)).size,2);
    assert.ok(contents.every(item=>!/[\\/]/.test(item.name) && item.name.endsWith('.pdf')));
    assert.ok(contents.every(item=>/^\d{4}-\d{2}-\d{2}-SAME-\d{4}(?:-\d+)?\.pdf$/.test(item.name)));
    assert.ok(contents.some(item=>item.text.includes('SAVED0'))); assert.ok(contents.some(item=>item.text.includes('SAVED1')));
    process.env.TOW_PAPER_ASSETS_PATH = path.join(dir,'missing');
    const failed = await request(tows.slice(0,2).map(tow=>tow.id)); assert.equal(failed.status,500);
    assert.match(failed.headers.get('content-type'),/^application\/json/);
    db.prepare("UPDATE tows SET deletedAt = '2026-10-13' WHERE id = ?").run(tows[0].id);
    assert.equal((await request([tows[0].id])).status,404);
    assert.ok(db.prepare("SELECT id FROM auditLogs WHERE action = 'tow.paper_export'").get());
  } finally {
    server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
    for (const tow of tows) deleteTow(tow.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(admin.id);
    if(previous===undefined) delete process.env.TOW_PAPER_ASSETS_PATH; else process.env.TOW_PAPER_ASSETS_PATH=previous;
    await fs.rm(dir,{recursive:true,force:true});
  }
});
