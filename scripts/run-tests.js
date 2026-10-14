import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'server/tests');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'towteam-tests-'));
const resolved = path.resolve(temporary);
if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('towteam-tests-')) {
  throw new Error('Refusing to clean an unexpected test directory.');
}
try {
  const files = fs.readdirSync(directory).filter(name => name.endsWith('.test.js')).sort().map(name => path.join(directory, name));
  const result = spawnSync(process.execPath, [
    '--import', pathToFileURL(path.join(directory, 'setup.js')).href, '--test', '--test-concurrency=1', ...process.argv.slice(2), ...files
  ], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', NAS_BACKUP_ENABLED: 'false', NAS_PDF_PATH: '', TOWTEAM_TEST_ROOT: temporary, DATABASE_URL: path.join(temporary, 'runner.sqlite') }
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
