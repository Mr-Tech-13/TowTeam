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
import Database from 'better-sqlite3';
import addAirlineAircraftTypes from '../../migrations/010_airline_aircraft_types.js';

test('aircraft type migration seeds existing records without changing tows', () => {
  const database = new Database(':memory:');
  try {
    database.exec("CREATE TABLE airlines (code TEXT PRIMARY KEY); CREATE TABLE tows (airline TEXT, aircraftType TEXT); INSERT INTO airlines VALUES ('MX'), ('EK'); INSERT INTO tows VALUES ('mx', ' a220 '), ('MX', 'A220'), ('MX', ''), ('EK', NULL)");
    addAirlineAircraftTypes(database);
    assert.deepEqual(JSON.parse(database.prepare("SELECT aircraftTypes FROM airlines WHERE code = 'MX'").get().aircraftTypes), ['A220']);
    assert.deepEqual(JSON.parse(database.prepare("SELECT aircraftTypes FROM airlines WHERE code = 'EK'").get().aircraftTypes), []);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM tows').get().count, 4);
  } finally { database.close(); }
});

test('aircraft types normalize, persist, clear, and reject invalid lists', () => {
  for (const aircraftTypes of ['A320', null, [4], [''], ['A'.repeat(41)], Array(101).fill('A320')]) {
    assert.throws(() => createAirline({ code: 'T9', aircraftTypes }), /Aircraft types/);
  }
  const airline = createAirline({ code: 'T9', aircraftTypes: [' a320 ', 'A320', 'b777'] });
  try {
    assert.deepEqual(airline.aircraftTypes, ['A320', 'B777']);
    assert.deepEqual(listAirlines().find((item) => item.code === 'T9').aircraftTypes, ['A320', 'B777']);
    assert.deepEqual(updateAirline('T9', { color: '#123456' }).aircraftTypes, ['A320', 'B777']);
    assert.deepEqual(updateAirline('T9', { aircraftTypes: [] }).aircraftTypes, []);
  } finally { deleteAirline('T9'); }
});

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
    const updated = await request('/api/airlines/Q9', adminSession.token, 'PUT', { name: 'Test airline', color: '#ffffff', aircraftTypes: ['A220', 'A320'] });
    assert.equal(updated.status, 200);
    const updatedAirline = await updated.json();
    assert.equal(updatedAirline.color, '#ffffff');
    assert.deepEqual(updatedAirline.aircraftTypes, ['A220', 'A320']);
    const airlineList = await (await request('/api/airlines', memberSession.token)).json();
    assert.deepEqual(airlineList.find((item) => item.code === 'Q9').aircraftTypes, ['A220', 'A320']);
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
