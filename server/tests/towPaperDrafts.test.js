import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { router as towRoutes } from '../routes/tows.js';
import { router as editorRoutes } from '../routes/paperEditor.js';
import { createTow } from '../services/tows.js';
import { createUser, createSession } from '../services/users.js';

test('paper drafts are shared, authenticated, validated, and revision protected', async () => {
  const suffix = Date.now();
  const users = ['one', 'two'].map((name) => createUser({ username: `paper-${name}-${suffix}`, password: 'test-only' }));
  const tokens = users.map((user) => createSession(user.id).token);
  const tow = createTow({ airline: 'MX', tailNumber: 'NTEST', gate: 'Gate 1', towSpot: 'NL614' });
  const otherTow = createTow({ airline: 'EK', tailNumber: 'OTHER', gate: 'Gate 2', towSpot: 'NL615' });
  const app = express(); app.use(express.json()); app.use(requireAuth);
  app.use('/api/tows', towRoutes); app.use('/api/paper-editor', editorRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token, body) => fetch(`${base}${path}`, {
    method: body ? 'PUT' : 'GET', headers: {'Content-Type':'application/json', ...(token ? {Cookie:`towteam_session=${token}`} : {})},
    body: body ? JSON.stringify(body) : undefined
  });
  const url = `/api/tows/${tow.id}/paper-draft`;
  const state = {text:{Airline:'MX'},answers:{0:'yes'},risk:{'Final agreed status':'green'}};
  try {
    for (const path of [url, '/api/paper-editor/', '/api/paper-editor/assets/template.js', '/api/paper-editor/assets/page-1.png']) {
      assert.equal((await request(path)).status, 401);
    }
    assert.equal((await request('/api/paper-editor/', tokens[0])).status, 200);
    assert.equal((await request('/api/paper-editor/extract_template.py', tokens[0])).status, 404);
    const initial = await (await request(url, tokens[0])).json();
    assert.equal(initial.state.text['Aircraft Reg'],'NTEST');
    assert.equal(initial.state.text['Tow from'],'Gate 1');
    assert.deepEqual(initial.state.answers,{}); assert.deepEqual(initial.state.risk,{});
    assert.equal(initial.revision,0); assert.equal(initial.updatedAt,null);
    assert.equal((await request(url, tokens[0], {state,revision:0})).status, 200);
    const shared = await (await request(url, tokens[1])).json();
    assert.equal(shared.state.text.Airline,state.text.Airline);
    assert.deepEqual(shared.state.answers,state.answers); assert.deepEqual(shared.state.risk,state.risk); assert.equal(shared.revision, 1);
    assert.equal((await (await request(`/api/tows/${otherTow.id}/paper-draft`, tokens[1])).json()).state.text['Aircraft Reg'], 'OTHER');
    assert.equal((await request(url, tokens[1], {state,revision:0})).status, 409);
    assert.equal((await request(url, tokens[1], {state:{...state,answers:{25:'yes'}},revision:1})).status, 400);
    assert.equal((await request(url, tokens[1], {state:{...state,risk:{'Final agreed status':'purple'}},revision:1})).status, 400);
    assert.equal((await request(url, tokens[1], {state:{...state,text:{Airline:'X'.repeat(151)}},revision:1})).status, 400);
    assert.equal((await request(url, tokens[1], {state:{...state,text:{...state.text,'Aircraft Reg':'MANUAL','Tow from':''},answers:{0:'no'}},revision:1})).status, 200);
    const edited = await (await request(url, tokens[0])).json();
    assert.equal(edited.revision, 2); assert.equal(edited.state.text['Aircraft Reg'],'MANUAL'); assert.equal(edited.state.text['Tow from'],'');
    db.prepare("UPDATE tows SET deletedAt = '2026-10-06' WHERE id = ?").run(tow.id);
    assert.equal((await request(url, tokens[0])).status, 404);
    assert.equal((await request(url, tokens[0], {state,revision:2})).status, 404);
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    db.prepare('DELETE FROM tows WHERE id = ?').run(tow.id);
    db.prepare('DELETE FROM tows WHERE id = ?').run(otherTow.id);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(users[0].id, users[1].id);
  }
});
