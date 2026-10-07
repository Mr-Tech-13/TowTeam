import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { router as towRoutes } from '../routes/tows.js';
import { router as userRoutes } from '../routes/users.js';
import { createTow } from '../services/tows.js';
import { createUser, updateUser, createSession, getUserForToken } from '../services/users.js';
import { autofillChecklist } from '../services/towPaperAutofill.js';

test('checklist autofill keeps legacy defaults, A220 exceptions, and manual answers', () => {
  const a220 = autofillChecklist({airline:'MX',aircraftType:'A220-300'});
  assert.equal(Object.keys(a220.answers).length,25);
  assert.equal(a220.answers[5],'no'); assert.equal(a220.text.undefined_11,'N/A');
  assert.equal(a220.answers[23],'no'); assert.equal(a220.text.undefined_44,'N/A - No bypass pin');
  assert.equal(a220.answers[14],'no'); assert.equal(a220.text.undefined_26,'In Pushback');
  assert.equal(a220.answers[0],'yes');
  assert.deepEqual(a220.risk,{'Tow from':'green','Tow to':'green','Final agreed status':'green'});
  const ek = autofillChecklist({airline:'EK',aircraftType:'777-300ER'});
  assert.equal(ek.answers[5],'yes'); assert.equal(ek.answers[23],'no'); assert.equal(ek.text.undefined_44,'Bypass pin left in');
  const other = autofillChecklist({airline:'AA',aircraftType:'A320'});
  assert.equal(other.answers[5],'yes'); assert.equal(other.answers[23],'yes');
  assert.equal(autofillChecklist({airline:'MX'}).text.undefined_11,'N/A');
  const manual = {text:{undefined_44:'Manual exception'},answers:{0:'no',23:'no'},risk:{'Tow from':'red','Tow to':'','Final agreed status':'amber'}};
  const filled = autofillChecklist({airline:'MX',aircraftType:'A220'},manual);
  assert.equal(filled.answers[0],'no'); assert.equal(filled.text.undefined_44,'Manual exception');
  assert.deepEqual(filled.risk,{'Tow from':'red','Tow to':'green','Final agreed status':'amber'});
  assert.deepEqual(manual.risk,{'Tow from':'red','Tow to':'','Final agreed status':'amber'});
  assert.deepEqual(manual.answers,{0:'no',23:'no'});
});

test('autofill permission is admin-managed, default-off, and enforced after revocation', async () => {
  const suffix = Date.now();
  const admin = createUser({username:`auto-owner-${suffix}`,password:'test',role:'admin'});
  db.prepare('UPDATE users SET isLocalAdmin = 1 WHERE id = ?').run(admin.id);
  const member = createUser({username:`auto-member-${suffix}`,password:'test'});
  const adminToken = createSession(admin.id).token; const token = createSession(member.id).token;
  const tow = createTow({airline:'MX',aircraftType:'A220',gate:'Gate 1',towSpot:'NL614'});
  const app = express(); app.use(express.json()); app.use(requireAuth); app.use('/api/tows',towRoutes); app.use('/api/users',userRoutes);
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const req=(path,session,method='POST',body={revision:0})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:`towteam_session=${session}`},body:JSON.stringify(body)});
  const url=`/api/tows/${tow.id}/paper-draft/autofill`;
  try {
    assert.equal(member.autofill,false); assert.equal(admin.autofill,false);
    assert.equal((await req(url,token)).status,403); assert.equal((await req(url,adminToken)).status,403);
    assert.equal((await req(`/api/users/${member.id}`,token,'PUT',{autofill:true})).status,403);
    assert.equal((await req(`/api/users/${member.id}`,adminToken,'PUT',{autofill:'true'})).status,400);
    assert.equal((await req(`/api/users/${member.id}`,adminToken,'PUT',{autofill:true})).status,200);
    assert.equal(getUserForToken(token).autofill,true);
    const saved=await req(url,token); assert.equal(saved.status,200);
    const draft=await saved.json(); assert.equal(draft.state.text.undefined_11,'N/A'); assert.equal(draft.revision,1);
    assert.deepEqual(draft.state.risk,{'Tow from':'green','Tow to':'green','Final agreed status':'green'});
    assert.equal((await req(url,token)).status,409);
    updateUser(member.id,{role:'user'}); assert.equal(getUserForToken(token).autofill,true);
    updateUser(member.id,{autofill:false}); assert.equal((await req(url,token,'POST',{revision:1})).status,403);
    assert.ok(db.prepare("SELECT id FROM auditLogs WHERE action='tow.paper_autofill' AND entityId=?").get(String(tow.id)));
  } finally {
    server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
    db.prepare('DELETE FROM tows WHERE id=?').run(tow.id);
    db.prepare('DELETE FROM users WHERE id IN (?,?)').run(admin.id,member.id);
  }
});
