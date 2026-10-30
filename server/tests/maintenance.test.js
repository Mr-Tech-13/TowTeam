import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import "../db/migrate.js";
import { db } from "../db/database.js";
import { cleanupDatabaseBackups, createPortableExport, importPortableExport, prepareDatabaseRestore } from "../services/maintenance.js";

test("database restore rejects non-buffer input", async () => {
  await assert.rejects(() => prepareDatabaseRestore("not binary"), TypeError);
  await assert.rejects(() => prepareDatabaseRestore([1, 2, 3]), TypeError);
});

test("database restore rejects undersized buffers", async () => {
  await assert.rejects(() => prepareDatabaseRestore(Buffer.alloc(128)), /valid SQLite backup/);
});

test("automatic backup retention keeps a minimum and ignores manual recovery backups", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "towteam-backup-retention-"));
  const now = Date.now();
  const oldTime = new Date(now - 45 * 24 * 60 * 60 * 1000);
  try {
    for (let index = 0; index < 8; index += 1) {
      const file = path.join(directory, `towteam-pre-update-${index}.sqlite`);
      fs.writeFileSync(file, "backup");
      const timestamp = new Date(oldTime.getTime() + index * 1000);
      fs.utimesSync(file, timestamp, timestamp);
    }
    const manual = path.join(directory, "towteam-pre-restore-keep.sqlite");
    fs.writeFileSync(manual, "backup");
    fs.utimesSync(manual, oldTime, oldTime);

    assert.deepEqual(cleanupDatabaseBackups({ label: "pre-update", directory, now, retentionDays: 30, minimum: 5 }), { deleted: 3 });
    assert.equal(fs.readdirSync(directory).filter((name) => name.startsWith("towteam-pre-update-")).length, 5);
    assert.equal(fs.existsSync(manual), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("selective tow transfer supports add, merge, and replacement without exporting users", async () => {
  const first = db.prepare("INSERT INTO tows (airline, inboundFlightNumber, tailNumber) VALUES ('AS', ?, 'N100AS')").run(`PORTABLE-${Date.now()}`).lastInsertRowid;
  db.prepare("INSERT INTO towPaperDrafts (towId, state) VALUES (?, ?)").run(first, JSON.stringify({ text: { Airline: "AS" }, answers: {}, risk: {} }));
  const payload = createPortableExport(["tows"]);
  assert.deepEqual(payload.categories, ["tows"]);
  assert.equal(payload.data.users, undefined);
  assert.equal(payload.data.tows.towPaperDrafts.length >= 1, true);
  const exported = payload.data.tows.tows.find((tow) => tow.id === first);
  exported.tailNumber = "N200AS";
  const second = db.prepare("INSERT INTO tows (airline, inboundFlightNumber, tailNumber) VALUES ('AS', ?, 'N300AS')").run(`PRESERVE-${Date.now()}`).lastInsertRowid;

  try {
    await importPortableExport(Buffer.from(JSON.stringify(payload)), ["tows"], "add");
    assert.equal(db.prepare("SELECT tailNumber FROM tows WHERE id = ?").get(first).tailNumber, "N100AS");
    await importPortableExport(Buffer.from(JSON.stringify(payload)), ["tows"], "merge");
    assert.equal(db.prepare("SELECT tailNumber FROM tows WHERE id = ?").get(first).tailNumber, "N200AS");
    assert.ok(db.prepare("SELECT 1 FROM tows WHERE id = ?").get(second));
    await importPortableExport(Buffer.from(JSON.stringify(payload)), ["tows"], "replace");
    assert.equal(db.prepare("SELECT 1 FROM tows WHERE id = ?").get(second), undefined);
    assert.equal(db.prepare("SELECT state FROM towPaperDrafts WHERE towId = ?").get(first).state.includes('Airline'), true);
  } finally {
    db.prepare("DELETE FROM tows WHERE id IN (?, ?)").run(first, second);
  }
});
