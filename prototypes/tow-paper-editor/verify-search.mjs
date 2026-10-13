import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { setTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({channel:'msedge',headless:true});
const context = await browser.newContext({viewport:{width:1440,height:1050}});
const base = 'http://127.0.0.1:8080';
const prefix = `NQOL${Date.now()}`;
const ids = [];
try {
  assert.equal((await context.request.post(base+'/api/auth/login',{data:{username:'preview',password:'local-preview-only'}})).status(),200);
  for (let index=0;index<12;index+=1) {
    const response = await context.request.post(base+'/api/tows',{data:{airline:'MX',tailNumber:`${prefix}${index===0?'TARGET':index}`,driver:'Quality Test Driver',gate:'Gate 1',towSpot:'NL614',status:'completed',towCompletedAt:new Date(Date.UTC(2026,9,13,12,index)).toISOString(),towPaperCompletedAt:new Date(Date.UTC(2026,9,13,12,index+1)).toISOString()}});
    assert.equal(response.status(),201); ids.push((await response.json()).id);
  }
  const active = await context.request.post(base+'/api/tows',{data:{airline:'MX',tailNumber:`${prefix}ACTIVE`,driver:'Quality Test Driver',gate:'Gate 1',towSpot:'NL614'}});
  assert.equal(active.status(),201); ids.push((await active.json()).id);
  const page = await context.newPage();
  const errors = []; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  const activeSearch = page.getByRole('searchbox',{name:'Search active tows',exact:true});
  await activeSearch.waitFor(); await activeSearch.fill(prefix);
  await page.waitForFunction(()=>globalThis.document.querySelectorAll('.tow-card').length===1);
  await page.getByRole('tab',{name:'History',exact:true}).click();
  const historySearch = page.getByRole('searchbox',{name:'Search tow history',exact:true});
  const initialSearch = page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/tows' && url.searchParams.get('search')===prefix && url.searchParams.get('status')==='completed';});
  await historySearch.fill(prefix);
  await initialSearch;
  await page.waitForFunction(()=>globalThis.document.querySelectorAll('.tow-card').length===10);
  assert.equal(await page.getByText('Bulk Aircraft Type',{exact:true}).count(),0);
  await page.getByRole('combobox',{name:'Per page',exact:true}).selectOption('5');
  await page.waitForFunction(()=>globalThis.document.querySelectorAll('.tow-card').length===5);
  await page.getByRole('button',{name:'Next history page',exact:true}).click();
  await page.getByText(/Page 2 of 3/).waitFor();
  await page.getByRole('button',{name:'Next history page',exact:true}).click();
  await page.getByText(/Page 3 of 3/).waitFor();
  const searches = [];
  const capture = request => {
    const url = new URL(request.url());
    if (url.pathname==='/api/tows' && url.searchParams.get('status')==='completed') searches.push(url.searchParams.get('search'));
  };
  page.on('request',capture);
  await historySearch.fill('');
  await historySearch.pressSequentially(`${prefix}TARGET`,{delay:60});
  await page.getByText(/1 tow · Page 1 of 1/).waitFor();
  assert.deepEqual(searches,[`${prefix}TARGET`]); page.off('request',capture);
  assert.equal(await page.locator('.tow-card').count(),1);
  const exported = await context.request.get(base+await page.getByRole('link',{name:'CSV',exact:true}).getAttribute('href'));
  const csv = await exported.text(); assert.ok(csv.includes(`${prefix}TARGET`)); assert.ok(!csv.includes(`${prefix}11`));
  await page.locator('.tow-card').click();
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByRole('tab',{name:'History',exact:true}).click();
  assert.equal(await historySearch.inputValue(),`${prefix}TARGET`);
  let startSlow, finishSlow;
  const slowStarted = new Promise(resolve=>{startSlow=resolve;});
  const slowFinished = new Promise(resolve=>{finishSlow=resolve;});
  await page.route('**/api/tows?**',async route=>{
    const url = new URL(route.request().url());
    if (url.searchParams.get('search') !== `${prefix}SLOW`) return route.continue();
    const response = await route.fetch(); startSlow();
    await new Promise(resolve=>setTimeout(resolve,1200));
    await route.fulfill({response}); finishSlow();
  });
  await historySearch.fill(`${prefix}SLOW`); await slowStarted;
  await historySearch.fill(`${prefix}TARGET`);
  await page.getByText(/1 tow · Page 1 of 1/).waitFor();
  await slowFinished; await page.waitForTimeout(100);
  assert.equal(await page.locator('.tow-card').count(),1);
  assert.ok((await page.locator('.tow-card').textContent()).includes(`${prefix}TARGET`));
  await page.unroute('**/api/tows?**');
  await page.getByText(/1 tow · Page 1 of 1/).waitFor();
  await page.getByRole('tab',{name:'Active',exact:true}).click();
  assert.equal(await activeSearch.inputValue(),prefix);
  await page.getByRole('tab',{name:'History',exact:true}).click();
  assert.equal(await historySearch.inputValue(),`${prefix}TARGET`);
  await historySearch.fill(prefix);
  await page.getByText(/12 tows · Page 1 of 3/).waitFor();
  await historySearch.fill('');
  await page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/tows' && url.searchParams.get('status')==='completed' && url.searchParams.get('search')==='';});
  assert.equal(await historySearch.inputValue(),'');
  await page.getByRole('tab',{name:'Active',exact:true}).click();
  await page.getByRole('tab',{name:'History',exact:true}).click();
  assert.equal(await historySearch.inputValue(),'');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'tmp/pdf-review/history-search-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('Matching search bars, debounce, all-page history matching, controlled return state, clearing, export filtering, stale-response protection, and mobile layout passed.');
} finally {
  for (const id of ids) {
    await context.request.delete(`${base}/api/tows/${id}`,{data:{reason:'Search regression test cleanup'}});
    await context.request.delete(`${base}/api/tows/${id}/permanent`);
  }
  await browser.close();
}
