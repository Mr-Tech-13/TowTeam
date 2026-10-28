import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { router as announcementRouter } from '../routes/announcements.js';
import { createSession, createUser } from '../services/users.js';

test('global messages require settings access and are acknowledged once per user', async () => {
  const suffix = Date.now();
  const superAdmin = createUser({ username: `announcement-super-${suffix}`, password: 'test-only', role: 'super_admin' });
  const regularAdmin = createUser({ username: `announcement-admin-${suffix}`, password: 'test-only', role: 'admin' });
  const firstUser = createUser({ username: `announcement-user-a-${suffix}`, password: 'test-only' });
  const secondUser = createUser({ username: `announcement-user-b-${suffix}`, password: 'test-only' });
  const tokens = [superAdmin, regularAdmin, firstUser, secondUser].map((user) => createSession(user.id).token);
  const app = express();
  app.use(express.json());
  app.use(requireAuth);
  app.use('/api/announcements', announcementRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/announcements`;
  const request = (path, token, method = 'GET', body) => fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: `towteam_session=${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let announcementId;
  try {
    assert.equal((await request('', tokens[1], 'POST', { title: 'No', message: 'Not allowed', kind: 'alert' })).status, 403);
    assert.equal((await request('', tokens[2], 'POST', { title: '', message: '', kind: 'unknown' })).status, 403);
    assert.equal((await request('', tokens[0], 'POST', { title: 'Bad image', message: 'No scripts.', kind: 'alert', imageUrl: 'javascript:alert(1)' })).status, 400);
    const createdResponse = await request('', tokens[0], 'POST', { title: 'Ramp change', message: 'Use the new staging lane.', kind: 'change', imageUrl: 'https://example.com/ramp-change.png' });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    announcementId = created.id;
    assert.equal(created.imageUrl, 'https://example.com/ramp-change.png');

    const firstPending = await (await request('/pending', tokens[2])).json();
    const secondPending = await (await request('/pending', tokens[3])).json();
    assert.equal(firstPending.some((item) => item.id === announcementId), true);
    assert.equal(secondPending.some((item) => item.id === announcementId), true);

    assert.equal((await request(`/${announcementId}/acknowledge`, tokens[2], 'POST', {})).status, 200);
    assert.equal((await request(`/${announcementId}/acknowledge`, tokens[2], 'POST', {})).status, 200);
    assert.equal((await (await request('/pending', tokens[2])).json()).some((item) => item.id === announcementId), false);
    assert.equal((await (await request('/pending', tokens[3])).json()).some((item) => item.id === announcementId), true);

    const listed = await (await request('', tokens[0])).json();
    assert.equal(listed.find((item) => item.id === announcementId).acknowledgementCount, 1);
    assert.ok(db.prepare("SELECT id FROM auditLogs WHERE action = 'announcement.create' AND entityId = ?").get(String(announcementId)));
    assert.equal((await request(`/${announcementId}`, tokens[1], 'DELETE')).status, 403);
    assert.equal((await request(`/${announcementId}`, tokens[0], 'DELETE')).status, 204);
    assert.equal((await (await request('/pending', tokens[3])).json()).some((item) => item.id === announcementId), false);
    assert.ok(db.prepare("SELECT id FROM auditLogs WHERE action = 'announcement.delete' AND entityId = ?").get(String(announcementId)));
    announcementId = null;
  } finally {
    if (announcementId) db.prepare('DELETE FROM globalAnnouncements WHERE id = ?').run(announcementId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?, ?, ?)').run(superAdmin.id, regularAdmin.id, firstUser.id, secondUser.id);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
