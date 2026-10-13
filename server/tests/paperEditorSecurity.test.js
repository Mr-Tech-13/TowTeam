import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { router } from '../routes/paperEditor.js';
import { createUser, createSession } from '../services/users.js';

test('paper assets require authentication and only fixed public asset names are served', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tow-paper-security-'));
  const previous = process.env.TOW_PAPER_ASSETS_PATH;
  process.env.TOW_PAPER_ASSETS_PATH = dir;
  const user = createUser({username:`asset-security-${Date.now()}`,password:'test-only'});
  const token = createSession(user.id).token;
  const app = express(); app.use(requireAuth); app.use('/api/paper-editor',router);
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/paper-editor`;
  const headers = {Cookie:`towteam_session=${token}`};
  try {
    for (const name of ['template.js','page-1.png','page-2.png','page-3.png','manifest.json','fields.json']) {
      await fs.writeFile(path.join(dir,name),`private fixture ${name}`);
    }
    for (const name of ['template.js','page-1.png','page-2.png','page-3.png','pdf-lib.min.js']) {
      assert.equal((await fetch(`${base}/assets/${name}`)).status,401);
      const response = await fetch(`${base}/assets/${name}`,{headers});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('cache-control'),'private, no-store');
      if (name !== 'pdf-lib.min.js') assert.equal(await response.text(),`private fixture ${name}`);
    }
    for (const name of ['fields.json','manifest.json','.env','TowPermit.pdf','unknown.png',
      '%2e%2e%2ffields.json','%2e%2e%5c.env','page-1.png%00','%2fetc%2fpasswd']) {
      assert.equal((await fetch(`${base}/assets/${name}`,{headers})).status,404,name);
    }
    for (const file of ['index.html','editor.js','editor.css']) {
      assert.equal((await fetch(`${base}/${file}`,{headers})).status,200);
    }
  } finally {
    server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    if (previous === undefined) delete process.env.TOW_PAPER_ASSETS_PATH;
    else process.env.TOW_PAPER_ASSETS_PATH = previous;
    await fs.rm(dir,{recursive:true,force:true});
  }
});
