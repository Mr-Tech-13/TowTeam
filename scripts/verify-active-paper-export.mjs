import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const base = process.env.TOWTEAM_TEST_URL || 'http://127.0.0.1:43181';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const ids = [];
try {
  assert.equal((await context.request.post(`${base}/api/auth/login`, { data: { username: 'preview', password: 'local-preview-only' } })).status(), 200);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Users', exact: true }).click();
  await page.getByRole('button', { name: /^settings$/i }).click();
  const button = page.getByRole('button', { name: 'Export Active Tow Papers', exact: true });
  await button.click();
  await page.getByRole('alert').getByText('There are no active tow papers to export.', { exact: true }).waitFor();
  for (const status of ['planned', 'tow_started']) {
    const response = await context.request.post(`${base}/api/tows`, { data: { airline: 'MX', tailNumber: `UI-${status}`, gate: 'Gate 1', towSpot: 'NL614', status } });
    assert.equal(response.status(), 201);
    ids.push((await response.json()).id);
    const download = page.waitForEvent('download');
    await button.click();
    const file = await download;
    assert.ok(file.suggestedFilename().endsWith(ids.length === 1 ? '.pdf' : '.zip'));
    assert.equal(await file.failure(), null);
    await button.waitFor();
    await page.waitForFunction(() => !globalThis.document.querySelector('section button.btn:has(svg.lucide-download)')?.disabled);
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
    const bounds = await button.boundingBox();
    assert.ok(bounds && bounds.width > 0 && bounds.x + bounds.width <= width);
    await page.screenshot({ path: `tmp/pdf-review/active-export-settings-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('Settings active-paper export: empty state, single PDF, ZIP, desktop/mobile layout, and no browser errors passed.');
} finally {
  for (const id of ids) {
    await context.request.delete(`${base}/api/tows/${id}`, { data: { reason: 'Active export browser test cleanup' } });
    await context.request.delete(`${base}/api/tows/${id}/permanent`);
  }
  await browser.close();
}
