import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db, dbPath, nowIso } from "../db/database.js";

const backupDir = path.join(path.dirname(dbPath), "backups");

function timestampSlug() {
  return nowIso().replace(/[:.]/g, "-");
}

function assertTowTeamDatabase(filePath) {
  const candidate = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const tables = new Set(candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    for (const table of ["tows", "users", "auditLogs", "migrations"]) {
      if (!tables.has(table)) throw new Error(`Backup is missing required table: ${table}`);
    }
  } finally {
    candidate.close();
  }
}

export async function createDatabaseBackup(label = "manual") {
  fs.mkdirSync(backupDir, { recursive: true });
  db.pragma("wal_checkpoint(TRUNCATE)");
  const safeLabel = String(label || "manual").replace(/[^a-z0-9-]+/gi, "_");
  const backupPath = path.join(backupDir, `towteam-${safeLabel}-${timestampSlug()}.sqlite`);
  await db.backup(backupPath);
  return backupPath;
}

export function backupFilename(filePath) {
  return path.basename(filePath);
}

export async function prepareDatabaseRestore(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1024) throw new Error("Upload a valid SQLite backup file.");
  fs.mkdirSync(backupDir, { recursive: true });
  const uploadPath = path.join(os.tmpdir(), `towteam-restore-${timestampSlug()}.sqlite`);
  fs.writeFileSync(uploadPath, buffer);
  assertTowTeamDatabase(uploadPath);

  const preRestoreBackupPath = await createDatabaseBackup("pre-restore");
  return {
    restored: true,
    uploadPath,
    preRestoreBackup: backupFilename(preRestoreBackupPath)
  };
}

export function activatePreparedRestore(uploadPath) {
  db.close();
  fs.copyFileSync(uploadPath, dbPath);
}
