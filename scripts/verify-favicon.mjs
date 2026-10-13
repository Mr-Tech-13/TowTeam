import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const { PNG } = require('pngjs');
const browser = await chromium.launch({channel:'msedge',headless:true});
const context = await browser.newContext({viewport:{width:1440,height:1050}});
const base = 'http://127.0.0.1:8080';
let original;
try {
  assert.equal((await context.request.post(base+'/api/auth/login',{data:{username:'preview',password:'local-preview-only'}})).status(),200);
  const settings = await (await context.request.get(base+'/api/settings')).json();
  if (!settings.faviconUrl.endsWith('=default')) original = await (await context.request.get(base+settings.faviconUrl)).body();
  const page = await context.newPage(); const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.getByRole('button',{name:'Users',exact:true}).click();
  await page.getByRole('button',{name:/^settings$/i}).click();
  const image = new PNG({width:32,height:32});
  for (let index=0;index<image.data.length;index+=4) image.data.set([16,185,129,255],index);
  await page.getByLabel('Upload favicon',{exact:true}).setInputFiles({name:'favicon.png',mimeType:'image/png',buffer:PNG.sync.write(image)});
  await page.getByRole('img',{name:'Current favicon',exact:true}).waitFor();
  await page.waitForFunction(()=>{
    const image=globalThis.document.querySelector('.favicon-preview img');
    return image?.complete && image.naturalWidth===32 && globalThis.document.querySelector('link[rel="icon"]').href===image.src;
  });
  for (const viewport of [{width:1440,height:1050},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth),true);
    await page.screenshot({path:`tmp/pdf-review/favicon-settings-${viewport.width}.png`,fullPage:true});
  }
  await page.reload(); await page.getByRole('button',{name:'Users',exact:true}).click();
  await page.getByRole('button',{name:/^settings$/i}).click();
  await page.getByRole('img',{name:'Current favicon',exact:true}).waitFor();
  await page.getByRole('button',{name:'Reset favicon',exact:true}).click();
  await page.waitForFunction(()=>globalThis.document.querySelector('link[rel="icon"]').href.endsWith('v=default'));
  assert.equal(await page.getByRole('img',{name:'Current favicon',exact:true}).count(),0);
  await page.getByLabel('Upload favicon',{exact:true}).setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('<svg onload="alert(1)"/>')});
  await page.getByRole('alert').getByText('Upload a PNG file up to 256 KB.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Favicon upload, preview, browser link refresh, persistence, reset, invalid input, and mobile settings layout passed.');
} finally {
  if (original) await context.request.put(base+'/api/settings/favicon',{headers:{'Content-Type':'image/png'},data:original});
  else await context.request.delete(base+'/api/settings/favicon');
  await browser.close();
}
