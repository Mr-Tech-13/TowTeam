import assert from "node:assert/strict";
import test from "node:test";
import { checkForUpdates, installUpdate } from "../services/updates.js";

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
  const result = await installUpdate({ run, enabled: true });
  assert.equal(result.updated, true);
  assert.equal(result.restartRequired, true);
  assert.ok(calls.includes("pull --ff-only"));
});

test("web updates are disabled unless explicitly configured", async () => {
  const status = await checkForUpdates({ enabled: false });
  assert.equal(status.enabled, false);
  assert.equal(status.canUpdate, false);
});
