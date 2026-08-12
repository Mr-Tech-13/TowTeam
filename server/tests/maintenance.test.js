import assert from "node:assert/strict";
import test from "node:test";
import { prepareDatabaseRestore } from "../services/maintenance.js";

test("database restore rejects non-buffer input", async () => {
  await assert.rejects(() => prepareDatabaseRestore("not binary"), TypeError);
  await assert.rejects(() => prepareDatabaseRestore([1, 2, 3]), TypeError);
});

test("database restore rejects undersized buffers", async () => {
  await assert.rejects(() => prepareDatabaseRestore(Buffer.alloc(128)), /valid SQLite backup/);
});
