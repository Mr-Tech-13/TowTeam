import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { router as users } from '../routes/users.js';
import { router as maintenance } from '../routes/maintenance.js';
import { router as audit } from '../routes/audit.js';
import { createUser, createSession, getUserForToken } from '../services/users.js';

test('only the local administrator can manage autofill, regardless of username',async()=>{
  const owner=createUser({username:`local-owner-${Date.now()}`,password:'test-only',role:'admin'});
  db.prepare('UPDATE users SET isLocalAdmin = 1 WHERE id = ?').run(owner.id);
  const admin=createUser({username:'ADMIN',password:'test-only',role:'admin'});
  const member=createUser({username:`regular-member-${Date.now()}`,password:'test-only',autofill:true});
  const ownerToken=createSession(owner.id).token;const adminToken=createSession(admin.id).token;
  const app=express();app.use(express.json());app.use(requireAuth);app.use('/api/users',users);app.use('/api/maintenance',maintenance);app.use('/api/audit',audit);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const req=(url,token,method='GET',body)=>fetch(base+url,{method,headers:{Cookie:`towteam_session=${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  try{
    assert.equal(getUserForToken(ownerToken).canManageAutofill,true);assert.equal(getUserForToken(adminToken).canManageAutofill,false);
    const visible=await(await req('/api/users',ownerToken)).json();assert.equal(visible.find(user=>user.id===member.id).autofill,true);
    const hidden=await(await req('/api/users',adminToken)).json();assert.ok(hidden.every(user=>!Object.hasOwn(user,'autofill')&&!Object.hasOwn(user,'canManageAutofill')));
    assert.equal((await req(`/api/users/${member.id}`,adminToken,'PUT',{autofill:false})).status,403);
    assert.equal((await req('/api/users',adminToken,'POST',{username:'new-user',password:'test',autofill:true})).status,403);
    assert.equal((await req(`/api/users/${admin.id}`,adminToken,'PUT',{username:'ordinary-renamed'})).status,200);
    assert.equal(getUserForToken(adminToken).canManageAutofill,false);
    assert.equal((await req(`/api/users/${admin.id}`,adminToken,'PUT',{username:'ADMIN'})).status,200);
    assert.equal((await req(`/api/users/${owner.id}/password`,adminToken,'PUT',{password:'takeover'})).status,403);
    assert.equal((await req(`/api/users/${owner.id}`,adminToken,'PUT',{role:'user'})).status,403);
    assert.equal((await req(`/api/users/${owner.id}`,adminToken,'DELETE')).status,403);
    assert.equal((await req(`/api/users/${owner.id}`,adminToken,'PUT',{username:'takeover'})).status,403);
    assert.equal((await req(`/api/users/${owner.id}`,ownerToken,'PUT',{username:'renamed-owner'})).status,200);
    assert.equal(getUserForToken(ownerToken).canManageAutofill,true);
    assert.equal((await req(`/api/users/${owner.id}`,ownerToken,'PUT',{role:'user'})).status,400);
    assert.equal((await req('/api/maintenance/backup.sqlite',adminToken)).status,403);
    assert.equal((await req('/api/maintenance/restore.sqlite',adminToken,'POST',{})).status,403);
    const allowed=await req(`/api/users/${member.id}`,adminToken,'PUT',{role:'user'});assert.equal(allowed.status,200);assert.equal(Object.hasOwn(await allowed.json(),'autofill'),false);
    assert.equal((await req(`/api/users/${member.id}`,ownerToken,'PUT',{autofill:false})).status,200);
    const logs=await(await req('/api/audit',adminToken)).json();assert.ok(logs.every(log=>!Object.hasOwn(JSON.parse(log.details),'autofill')));
    for(const key of ['canManageAutofill','isLocalAdmin','isLocalAdministrator']){
      assert.equal((await req(`/api/users/${admin.id}`,adminToken,'PUT',{[key]:true})).status,403);
      assert.equal((await req(`/api/users/${admin.id}`,ownerToken,'PUT',{[key]:true})).status,403);
    }
    assert.equal(getUserForToken(adminToken).canManageAutofill,false);
    assert.throws(()=>db.prepare('UPDATE users SET isLocalAdmin = 1 WHERE id = ?').run(admin.id),/UNIQUE/);
    assert.throws(()=>createUser({username:'admin',password:'duplicate'}),/already exists/);
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    db.prepare('DELETE FROM users WHERE id IN (?,?,?)').run(owner.id,admin.id,member.id);
  }
});
