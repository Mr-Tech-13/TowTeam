import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { router as settingsRouter } from '../routes/settings.js';
import { router as towsRouter } from '../routes/tows.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { createSession, createUser } from '../services/users.js';

test('bulk import is a persistent admin-only setting enforced for all users', async () => {
  const original = getSettings();
  const suffix = Date.now();
  const admin = createUser({ username: `settings-admin-${suffix}`, password: 'test-only', role: 'admin' });
  const member = createUser({ username: `settings-member-${suffix}`, password: 'test-only' });
  const tokens = [createSession(admin.id).token, createSession(member.id).token];
  const app = express();
  app.use(express.json());
  app.use(requireAuth);
  app.use('/api/settings', settingsRouter);
  app.use('/api/tows', towsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token, method = 'GET', body) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `towteam_session=${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let towId;
  try {
    assert.equal((await request('/api/settings')).status, 401);
    assert.equal((await request('/api/settings', tokens[1])).status, 200);
    assert.equal((await request('/api/settings', tokens[1], 'PUT', { bulkImportEnabled: false })).status, 403);
    assert.equal((await request('/api/settings', tokens[0], 'PUT', { bulkImportEnabled: 'false' })).status, 400);
    assert.equal((await request('/api/settings', tokens[0], 'PUT', { bulkImportEnabled: false })).status, 200);
    assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'bulkImportEnabled'").get().value, 'false');
    assert.deepEqual(await (await request('/api/settings', tokens[1])).json(), { bulkImportEnabled: false });
    for (const token of tokens) {
      assert.equal((await request('/api/tows/parse', token, 'POST', { text: '' })).status, 403);
      assert.equal((await request('/api/tows/bulk', token, 'POST', { tows: [] })).status, 403);
    }
    const manual = await request('/api/tows', tokens[1], 'POST', { airline: 'MX', gate: 'Gate 1', towSpot: 'NL614' });
    assert.equal(manual.status, 201);
    towId = (await manual.json()).id;
    assert.equal((await request('/api/settings', tokens[0], 'PUT', { bulkImportEnabled: true })).status, 200);
    assert.equal((await request('/api/tows/parse', tokens[1], 'POST', { text: '' })).status, 200);
    assert.equal((await request('/api/tows/bulk', tokens[1], 'POST', { tows: [] })).status, 201);
    assert.ok(db.prepare("SELECT id FROM auditLogs WHERE action = 'settings.update'").get());
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    updateSettings(original);
    if (towId) db.prepare('DELETE FROM tows WHERE id = ?').run(towId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(admin.id, member.id);
  }
});
