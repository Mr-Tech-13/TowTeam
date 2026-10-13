import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({channel:'msedge',headless:true});
const context = await browser.newContext({viewport:{width:1440,height:1050}});
const base = 'http://127.0.0.1:8080';
const prefix = `NPDF${Date.now()}`;
const ids = [];
try {
  assert.equal((await context.request.post(base+'/api/auth/login',{data:{username:'preview',password:'local-preview-only'}})).status(),200);
  for (let index=0;index<7;index+=1) {
    const response = await context.request.post(base+'/api/tows',{data:{airline:'MX',tailNumber:`${prefix}${index}`,gate:'Gate 1',towSpot:'NL614',status:'completed',towCompletedAt:new Date(Date.UTC(2026,9,13,12,index)).toISOString()}});
    assert.equal(response.status(),201); ids.push((await response.json()).id);
  }
  const page = await context.newPage(); const errors = [];
  const exports = [];
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/tows/paper-export') exports.push(request.postDataJSON().ids);});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base); await page.getByRole('tab',{name:'History',exact:true}).click();
  const searched = page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/tows' && url.searchParams.get('search')===`${prefix}6`;});
  await page.getByRole('searchbox',{name:'Search tow history',exact:true}).fill(`${prefix}6`); await searched;
  await page.getByText(/1 tow · Page 1 of 1/).waitFor();
  assert.equal(await page.getByRole('checkbox').count(),0);
  const pdfPromise = page.waitForEvent('download');
  await page.getByRole('button',{name:'Download PDF',exact:true}).click();
  const pdf = await pdfPromise; assert.ok(pdf.suggestedFilename().endsWith('.pdf'));
  await pdf.saveAs('tmp/pdf-review/history-selected.pdf');
  assert.ok((await fs.readFile('tmp/pdf-review/history-selected.pdf')).subarray(0,5).toString()==='%PDF-');
  assert.deepEqual(exports[0],[ids[6]]);
  await page.getByRole('searchbox',{name:'Search tow history',exact:true}).fill(prefix);
  await page.getByRole('combobox',{name:'Per page',exact:true}).selectOption('5');
  await page.getByText(/7 tows · Page 1 of 2/).waitFor();
  const firstPageZip = page.waitForEvent('download');
  await page.getByRole('button',{name:'Download ZIP',exact:true}).click();
  await (await firstPageZip).saveAs('tmp/pdf-review/history-visible-page-1.zip');
  assert.deepEqual(exports[1],[ids[6],ids[5],ids[4],ids[3],ids[2]]);
  await page.getByRole('button',{name:'Next history page',exact:true}).click();
  await page.getByText(/Page 2 of 2/).waitFor();
  const zipPromise = page.waitForEvent('download');
  await page.getByRole('button',{name:'Download ZIP',exact:true}).click();
  const zip = await zipPromise; assert.equal(zip.suggestedFilename(),'tow-papers.zip');
  await zip.saveAs('tmp/pdf-review/history-selected.zip');
  assert.equal((await fs.readFile('tmp/pdf-review/history-selected.zip')).subarray(0,2).toString(),'PK');
  assert.deepEqual(exports[2],[ids[1],ids[0]]);
  for(const viewport of [{width:1440,height:1050},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.screenshot({path:`tmp/pdf-review/history-download-${viewport.width}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth),true);
  }
  await page.getByRole('searchbox',{name:'Search tow history',exact:true}).fill(`${prefix}NONE`);
  await page.getByText('No completed tows match that search.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Download PDF',exact:true}).isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('Checkbox-free exports match exactly the displayed History page; single PDF, multi-PDF ZIP, search, pagination, empty results, and mobile layout passed.');
} finally {
  for(const id of ids) {
    await context.request.delete(`${base}/api/tows/${id}`,{data:{reason:'History export browser test cleanup'}});
    await context.request.delete(`${base}/api/tows/${id}/permanent`);
  }
  await browser.close();
}
