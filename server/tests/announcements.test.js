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
  const announcementIds = [];
  try {
    assert.equal((await request('', tokens[1], 'POST', { title: 'No', message: 'Not allowed', kind: 'alert' })).status, 403);
    assert.equal((await request('', tokens[2], 'POST', { title: '', message: '', kind: 'unknown' })).status, 403);
    assert.equal((await request('', tokens[0], 'POST', { title: 'Bad image', message: 'No scripts.', kind: 'alert', imageUrl: 'javascript:alert(1)' })).status, 400);
    const createdResponse = await request('', tokens[0], 'POST', { title: 'Ramp change', message: 'Use the new staging lane.', kind: 'change', imageUrl: 'https://example.com/ramp-change.png' });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    announcementIds.push(created.id);
    assert.equal(created.imageUrl, 'https://example.com/ramp-change.png');

    const latestResponse = await request('', tokens[0], 'POST', { title: 'Latest change', message: 'Only show this message.', kind: 'change' });
    assert.equal(latestResponse.status, 201);
    const latest = await latestResponse.json();
    announcementIds.push(latest.id);

    const firstPending = await (await request('/pending', tokens[2])).json();
    const secondPending = await (await request('/pending', tokens[3])).json();
    assert.deepEqual(firstPending.map((item) => item.id), [latest.id]);
    assert.deepEqual(secondPending.map((item) => item.id), [latest.id]);

    assert.equal((await request(`/${latest.id}/acknowledge`, tokens[2], 'POST', {})).status, 200);
    assert.equal((await request(`/${latest.id}/acknowledge`, tokens[2], 'POST', {})).status, 200);
    assert.deepEqual(await (await request('/pending', tokens[2])).json(), []);
    assert.equal((await (await request('/pending', tokens[3])).json()).some((item) => item.id === latest.id), true);

    const listed = await (await request('', tokens[0])).json();
    assert.equal(listed.find((item) => item.id === latest.id).acknowledgementCount, 1);
    assert.ok(db.prepare("SELECT id FROM auditLogs WHERE action = 'announcement.create' AND entityId = ?").get(String(latest.id)));
    assert.equal((await request(`/${latest.id}`, tokens[1], 'DELETE')).status, 403);
    assert.equal((await request(`/${latest.id}`, tokens[0], 'DELETE')).status, 204);
    announcementIds.splice(announcementIds.indexOf(latest.id), 1);
    assert.equal((await (await request('/pending', tokens[3])).json()).some((item) => item.id === latest.id), false);
    assert.ok(db.prepare("SELECT id FROM auditLogs WHERE action = 'announcement.delete' AND entityId = ?").get(String(latest.id)));
  } finally {
    for (const announcementId of announcementIds) db.prepare('DELETE FROM globalAnnouncements WHERE id = ?').run(announcementId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?, ?, ?)').run(superAdmin.id, regularAdmin.id, firstUser.id, secondUser.id);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
