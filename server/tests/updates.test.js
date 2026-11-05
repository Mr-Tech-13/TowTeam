import assert from "node:assert/strict";
import test from "node:test";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkForUpdates, installUpdate, mergeEnvironmentTemplate } from "../services/updates.js";

function gitRunner(overrides = {}) {
  const calls = [];
  const values = {
    "fetch --prune": "",
    "branch --show-current": "main",
    "rev-parse --abbrev-ref --symbolic-full-name @{u}": "origin/main",
    "rev-parse HEAD": "local-commit",
    "rev-parse @{u}": "remote-commit",
    "rev-list --left-right --count HEAD...@{u}": "0\t2",
    "status --porcelain --untracked-files=no": "",
    "log -1 --format=%h %s @{u}": "abc1234 Release 3.2.0",
    "show @{u}:package.json": JSON.stringify({ version: "3.2.0" }),
    "pull --ff-only": "Updating local-commit..remote-commit",
    ...overrides
  };
  const run = async (args) => {
    const key = args.join(" ");
    calls.push(key);
    if (!(key in values)) throw new Error(`Unexpected git command: ${key}`);
    return values[key];
  };
  return { calls, run };
}

test("update check reports a clean fast-forward update", async () => {
  const { calls, run } = gitRunner();
  const status = await checkForUpdates({ run, enabled: true });
  assert.equal(status.updateAvailable, true);
  assert.equal(status.canUpdate, true);
  assert.equal(status.behind, 2);
  assert.equal(status.remoteVersion, "3.2.0");
  assert.ok(calls.includes("fetch --prune"));
});

test("update check blocks tracked local changes", async () => {
  const { run } = gitRunner({ "status --porcelain --untracked-files=no": " M package.json" });
  const status = await checkForUpdates({ run, enabled: true });
  assert.equal(status.dirty, true);
  assert.equal(status.canUpdate, false);
  assert.match(status.message, /local changes/i);
});

test("install update only performs a fast-forward pull", async () => {
  const { calls, run } = gitRunner({ "rev-parse HEAD": "remote-commit" });
  const result = await installUpdate({ run, enabled: true, mergeEnvironment: () => ({ changed: false, added: [] }) });
  assert.equal(result.updated, true);
  assert.equal(result.restartRequired, true);
  assert.ok(calls.includes("pull --ff-only"));
});

test("web updates are disabled unless explicitly configured", async () => {
  const status = await checkForUpdates({ enabled: false });
  assert.equal(status.enabled, false);
  assert.equal(status.canUpdate, false);
});

test('environment template merge appends new keys without changing existing values', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'towteam-env-merge-'));
  try {
    fs.writeFileSync(path.join(directory, '.env'), '# Local values\nPORT=9000\nexport ADMIN_PASSWORD=private-value\n');
    fs.writeFileSync(path.join(directory, '.env.example'), 'PORT=8080\nADMIN_PASSWORD=change-me\nNEW_SETTING=enabled\nEMPTY_SETTING=\n');
    const timestamp = new Date('2026-11-05T15:30:00.000Z');
    const result = mergeEnvironmentTemplate({ directory, timestamp });
    assert.deepEqual(result.added, ['NEW_SETTING', 'EMPTY_SETTING']);
    assert.equal(result.backup, '.env.pre-update-2026-11-05T15-30-00-000Z');
    const merged = fs.readFileSync(path.join(directory, '.env'), 'utf8');
    assert.match(merged, /PORT=9000/);
    assert.match(merged, /export ADMIN_PASSWORD=private-value/);
    assert.doesNotMatch(merged, /ADMIN_PASSWORD=change-me/);
    assert.match(merged, /NEW_SETTING=enabled\nEMPTY_SETTING=/);
    assert.equal(fs.readFileSync(path.join(directory, result.backup), 'utf8'), '# Local values\nPORT=9000\nexport ADMIN_PASSWORD=private-value\n');
    assert.deepEqual(mergeEnvironmentTemplate({ directory, timestamp: new Date('2026-11-05T15:31:00.000Z') }), { changed: false, added: [] });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('environment template merge does not create an environment file for system-configured installs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'towteam-env-skip-'));
  try {
    fs.writeFileSync(path.join(directory, '.env.example'), 'NEW_SETTING=enabled\n');
    assert.deepEqual(mergeEnvironmentTemplate({ directory }), { changed: false, added: [], skipped: '.env does not exist' });
    assert.equal(fs.existsSync(path.join(directory, '.env')), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('an environment merge failure does not prevent an installed update from restarting', async () => {
  const { run } = gitRunner({ "rev-parse HEAD": "remote-commit" });
  const result = await installUpdate({
    run,
    enabled: true,
    mergeEnvironment: () => { throw new Error('read-only filesystem'); }
  });
  assert.equal(result.updated, true);
  assert.equal(result.restartRequired, true);
  assert.match(result.environment.error, /read-only filesystem/);
});
