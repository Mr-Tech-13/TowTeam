import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { paperDestinationSettings, testPaperDestination, updatePaperDestination } from '../services/paperBackups.js';

test('panel-managed local paper destination saves and verifies without changing legacy defaults first', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'towteam-paper-destination-'));
  const original = Object.fromEntries(db.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'paperDestination%'").all().map((row) => [row.key, row.value]));
  try {
    const configured = updatePaperDestination({ enabled: true, type: 'local', path: directory });
    assert.equal(configured.type, 'local');
    assert.equal(configured.path, path.resolve(directory));
    assert.equal((await testPaperDestination()).ok, true);
    assert.deepEqual(await fs.readdir(directory), []);
    assert.equal(paperDestinationSettings().enabled, true);
  } finally {
    const update = db.prepare('UPDATE app_settings SET value = ? WHERE key = ?');
    for (const [key, value] of Object.entries(original)) update.run(value, key);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
