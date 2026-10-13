import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pngjs from 'pngjs';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { router } from '../routes/settings.js';
import { serveFavicon, resetFavicon } from '../services/favicon.js';
import { createUser, createSession } from '../services/users.js';

test('favicon uploads are admin-only, validated, persistent, publicly readable, and resettable', async () => {
  const admin = createUser({username:`icon-admin-${Date.now()}`,password:'test-only',role:'admin'});
  const user = createUser({username:`icon-user-${Date.now()}`,password:'test-only'});
  const adminHeaders = { Cookie:`towteam_session=${createSession(admin.id).token}`, 'Content-Type':'image/png' };
  const userHeaders = { Cookie:`towteam_session=${createSession(user.id).token}`, 'Content-Type':'image/png' };
  const image = new pngjs.PNG({width:32,height:32}); image.data.fill(255);
  const png = pngjs.PNG.sync.write(image);
  const app = express(); app.use(requireAuth); app.get('/favicon.png',serveFavicon); app.use('/api/settings',router);
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base+'/api/settings/favicon',{method:'PUT',headers:{'Content-Type':'image/png'},body:png})).status,401);
    assert.equal((await fetch(base+'/api/settings/favicon',{method:'PUT',headers:userHeaders,body:png})).status,403);
    for (const body of [Buffer.from('<svg onload="alert(1)"/>'),png.subarray(0,33),Buffer.alloc(0)]) {
      assert.equal((await fetch(base+'/api/settings/favicon',{method:'PUT',headers:adminHeaders,body})).status,400);
    }
    const largeDimensions = Buffer.from(png); largeDimensions.writeUInt32BE(513,16);
    assert.equal((await fetch(base+'/api/settings/favicon',{method:'PUT',headers:adminHeaders,body:largeDimensions})).status,400);
    assert.equal((await fetch(base+'/api/settings/favicon',{method:'PUT',headers:adminHeaders,body:Buffer.alloc(256*1024+1)})).status,413);
    const uploaded = await fetch(base+'/api/settings/favicon',{method:'PUT',headers:adminHeaders,body:png});
    assert.equal(uploaded.status,200); const settings = await uploaded.json();
    assert.match(settings.faviconUrl,/^\/favicon.png\?v=[a-f0-9]{16}$/);
    const served = await fetch(base+settings.faviconUrl);
    assert.equal(served.status,200); assert.match(served.headers.get('content-type'),/^image\/png/);
    assert.equal(served.headers.get('cache-control'),'no-store');
    const decoded = pngjs.PNG.sync.read(Buffer.from(await served.arrayBuffer())); assert.equal(decoded.width,32);
    const persisted = await (await fetch(base+'/api/settings',{headers:userHeaders})).json();
    assert.equal(persisted.faviconUrl,settings.faviconUrl);
    assert.equal((await fetch(base+'/api/settings/favicon',{method:'DELETE',headers:userHeaders})).status,403);
    const reset = await fetch(base+'/api/settings/favicon',{method:'DELETE',headers:adminHeaders});
    assert.equal(reset.status,200); assert.equal((await reset.json()).faviconUrl,'/favicon.png?v=default');
    const blank = pngjs.PNG.sync.read(Buffer.from(await (await fetch(base+'/favicon.png')).arrayBuffer()));
    assert.ok(blank.data.every(value=>value===0));
  } finally {
    server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
    resetFavicon(); db.prepare('DELETE FROM users WHERE id IN (?,?)').run(admin.id,user.id);
  }
});
