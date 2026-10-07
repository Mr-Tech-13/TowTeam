import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve('prototypes/tow-paper-editor/index.html')).href);
  await page.getByLabel('Aircraft Reg', { exact: true }).fill('NTEST');
  await page.getByLabel('Airline', { exact: true }).fill('MX');
  await page.getByRole('button', { name: 'Final agreed status: green', exact: true }).click();
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await page.reload();
  assert.equal(await page.getByLabel('Aircraft Reg', { exact: true }).inputValue(), 'NTEST');
  await page.screenshot({ path: 'tmp/pdf-review/editor-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'TTWS & Preparation', exact: true }).click();
  await page.getByRole('button', { name: 'Checklist item 1: yes', exact: true }).click();
  await page.getByRole('button', { name: 'Checklist item 1: no', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Checklist item 1: yes', exact: true }).getAttribute('aria-pressed'), 'false');
  await page.getByLabel('Checklist item 1 exception comment', { exact: true }).fill('TEST COMMENT');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs('tmp/pdf-review/editor-export.pdf');
  await page.screenshot({ path: 'tmp/pdf-review/editor-checklist.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tmp/pdf-review/editor-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('Draft persistence, exclusive yes/no responses, export, desktop/mobile layout, and browser error checks passed.');
} finally { await browser.close(); }
