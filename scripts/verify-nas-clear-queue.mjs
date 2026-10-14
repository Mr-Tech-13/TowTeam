import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { towPermitFilename } from '../server/services/towPermit.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const base = 'http://127.0.0.1:43183';
const folder = path.resolve('tmp/pdf-review/nas-clear-ui');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
let id, filename;
try {
  await assert.rejects(fs.stat(folder), { code: 'ENOENT' });
  await fs.writeFile(folder, 'Not a directory');
  assert.equal((await context.request.post(`${base}/api/auth/login`, { data: { username: 'preview', password: 'local-preview-only' } })).status(), 200);
  const created = await context.request.post(`${base}/api/tows`, { data: { airline: 'MX', tailNumber: 'CLEAR-UI', status: 'completed' } });
  assert.equal(created.status(), 201); const tow = await created.json(); id = tow.id; filename = towPermitFilename(tow);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Users', exact: true }).click();
  await page.getByRole('button', { name: /^settings$/i }).click();
  await page.getByText(folder, { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Test Connection', exact: true }).count(), 0);
  await page.getByText(/Cannot prepare backup folder/).waitFor();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Clear Queue', exact: true }).click();
  await page.getByText('Cleared 1 pending upload.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Clear Queue', exact: true }).isDisabled(), true);
  await fs.unlink(folder);
  await page.getByRole('button', { name: 'Transfer Pending', exact: true }).click();
  const status = await (await context.request.get(`${base}/api/settings/paper-backups`)).json();
  assert.equal(status.pending, 0); assert.equal(status.jobs.find(job => job.towId === id).status, 'cleared');
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Replace All Completed', exact: true }).click();
  await page.waitForFunction(() => globalThis.document.querySelector('progress')?.value === 100);
  assert.equal(await page.locator('.backup-jobs li').count(), 0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
    await page.screenshot({ path: `tmp/pdf-review/nas-clear-settings-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('Clear Queue, skipped-job persistence, forced requeue, configured folder display, persistent diagnostics, and desktop/mobile layout passed.');
} finally {
  if (id) {
    await context.request.delete(`${base}/api/tows/${id}`, { data: { reason: 'Clear queue UI test cleanup' } });
    await context.request.delete(`${base}/api/tows/${id}/permanent`);
    await fs.unlink(path.join(folder, filename)).catch(() => {});
  }
  await fs.rmdir(folder).catch(() => {});
  await browser.close();
}
