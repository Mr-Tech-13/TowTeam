import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { router as airlinesRouter } from '../routes/airlines.js';
import { router as towsRouter } from '../routes/tows.js';
import { createAirline, deleteAirline, listAirlines, updateAirline } from '../services/airlines.js';
import { createSession, createUser } from '../services/users.js';

test('airline settings validate codes and colors and reject duplicate codes', () => {
  assert.throws(() => createAirline({ code: 'bad code' }), /Airline code/);
  assert.throws(() => createAirline({ code: 'Z9', color: 'red' }), /valid airline color/);
  const airline = createAirline({ code: 'z9', name: 'Test Airline', color: '#12abcd' });
  try {
    assert.equal(airline.code, 'Z9');
    assert.throws(() => createAirline({ code: 'Z9' }), /already exists/);
    assert.equal(updateAirline('Z9', { name: 'Updated', color: '#fedcba' }).color, '#fedcba');
    assert.ok(listAirlines().some((item) => item.code === 'Z9'));
  } finally { deleteAirline('Z9'); }
});

test('airline API limits writes to admins and manual tows do not require flight or ETA', async () => {
  const suffix = Date.now();
  const admin = createUser({ username: `airline-admin-${suffix}`, password: 'test-only', role: 'admin' });
  const member = createUser({ username: `airline-member-${suffix}`, password: 'test-only' });
  const adminSession = createSession(admin.id);
  const memberSession = createSession(member.id);
  const app = express();
  app.use(express.json());
  app.use(requireAuth);
  app.use('/api/airlines', airlinesRouter);
  app.use('/api/tows', towsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, token, method = 'GET', body) => fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `towteam_session=${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let towId;
  try {
    assert.equal((await request('/api/airlines')).status, 401);
    assert.equal((await request('/api/airlines', memberSession.token)).status, 200);
    assert.equal((await request('/api/airlines', memberSession.token, 'POST', { code: 'Q9' })).status, 403);
    assert.equal((await request('/api/airlines/Q9', memberSession.token, 'DELETE')).status, 403);
    const created = await request('/api/airlines', adminSession.token, 'POST', { code: 'Q9', color: '#22c55e' });
    assert.equal(created.status, 201);
    assert.equal((await request('/api/airlines/Q9', memberSession.token, 'PUT', { name: 'Forbidden', color: '#ffffff' })).status, 403);
    const updated = await request('/api/airlines/Q9', adminSession.token, 'PUT', { name: 'Test airline', color: '#ffffff' });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).color, '#ffffff');
    const response = await request('/api/tows', memberSession.token, 'POST', { airline: 'Q9', gate: 'Gate 1', towSpot: 'NL614', tailNumber: 'NTEST' });
    assert.equal(response.status, 201);
    const tow = await response.json();
    towId = tow.id;
    assert.equal(tow.inboundFlightNumber, '');
    assert.equal(tow.eta, '');
    assert.equal((await request('/api/airlines/Q9', adminSession.token, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT airline FROM tows WHERE id = ?').get(towId).airline, 'Q9');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (towId) db.prepare('DELETE FROM tows WHERE id = ?').run(towId);
    deleteAirline('Q9');
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(admin.id, member.id);
  }
});
