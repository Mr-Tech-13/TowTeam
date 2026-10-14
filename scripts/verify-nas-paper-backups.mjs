import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { setTimeout } from 'node:timers/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const base = 'http://127.0.0.1:43182';
const nas = path.resolve('tmp/pdf-review/nas-test');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
let id;
async function waitUploaded(previousChecksum) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await context.request.get(`${base}/api/settings/paper-backups`);
    assert.equal(response.status(), 200);
    const status = await response.json();
    const job = status.jobs.find(job => job.towId === id);
    if (job?.status === 'uploaded' && job.checksum !== previousChecksum) return job;
    await setTimeout(500);
  }
  throw new Error('NAS test upload did not finish.');
}
try {
  assert.equal((await context.request.post(`${base}/api/auth/login`, { data: { username: 'preview', password: 'local-preview-only' } })).status(), 200);
  const created = await context.request.post(`${base}/api/tows`, { data: { airline: 'MX', tailNumber: 'NAS-UI', status: 'completed' } });
  assert.equal(created.status(), 201); id = (await created.json()).id;
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Users', exact: true }).click();
  await page.getByRole('button', { name: /^settings$/i }).click();
  await page.getByRole('button', { name: 'Test Connection', exact: true }).click();
  await page.getByText('Connection verified.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Transfer Pending', exact: true }).click();
  const first = await waitUploaded();
  const original = await fs.readFile(path.join(nas, `tow-${id}.pdf`));
  const draft = await (await context.request.get(`${base}/api/tows/${id}/paper-draft`)).json();
  draft.state.text['Aircraft Reg'] = 'NAS-UI-EDIT';
  assert.equal((await context.request.put(`${base}/api/tows/${id}/paper-draft`, { data: { state: draft.state, revision: draft.revision } })).status(), 200);
  await waitUploaded(first.checksum);
  assert.notDeepEqual(await fs.readFile(path.join(nas, `tow-${id}.pdf`)), original);
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Replace All Completed', exact: true }).click();
  await page.getByText('Replacement uploads queued.', { exact: true }).waitFor();
  await page.waitForFunction(() => globalThis.document.querySelector('progress[aria-label="NAS paper backup progress"]')?.value === 100);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
    await page.screenshot({ path: `tmp/pdf-review/nas-backup-settings-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('NAS settings: connection test, pending transfer, edited-paper replacement, force replace, progress, and desktop/mobile layout passed against a simulated NAS folder.');
} finally {
  if (id) {
    await context.request.delete(`${base}/api/tows/${id}`, { data: { reason: 'NAS UI verification cleanup' } });
    await context.request.delete(`${base}/api/tows/${id}/permanent`);
    await fs.unlink(path.join(nas, `tow-${id}.pdf`)).catch(() => {});
  }
  await browser.close();
}
