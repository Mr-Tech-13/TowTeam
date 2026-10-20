import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db, dbPath, nowIso } from "../db/database.js";

const backupDir = path.join(path.dirname(dbPath), "backups");
export const portableCategories = ["tows", "airlines", "settings", "users", "issues", "audit"];

const categoryTables = {
  tows: ["tows", "towPaperDrafts"],
  airlines: ["airlines"],
  settings: ["app_settings"],
  users: ["users"],
  issues: ["issueReports"],
  audit: ["auditLogs"]
};

const tableKeys = {
  tows: ["id"], towPaperDrafts: ["towId"], airlines: ["code"], app_settings: ["key"],
  users: ["username"], issueReports: ["id"], auditLogs: ["id"]
};

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
  if (!Buffer.isBuffer(buffer)) throw new TypeError("Restore data must be a binary buffer.");
  if (buffer.length < 1024) throw new Error("Upload a valid SQLite backup file.");
  const restoreBytes = Buffer.from(buffer);
  fs.mkdirSync(backupDir, { recursive: true });
  const uploadPath = path.join(os.tmpdir(), `towteam-restore-${timestampSlug()}.sqlite`);
  fs.writeFileSync(uploadPath, restoreBytes);
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

function selectedCategories(categories) {
  if (!Array.isArray(categories)) throw new Error("Select at least one data category.");
  const selected = [...new Set(categories.map(String))];
  if (!selected.length || selected.some((category) => !portableCategories.includes(category))) {
    throw new Error("Select valid data categories.");
  }
  return selected;
}

function tableColumns(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

export function createPortableExport(categories) {
  const selected = selectedCategories(categories);
  const data = {};
  for (const category of selected) {
    data[category] = {};
    for (const table of categoryTables[category]) {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      if (table === "users") {
        data[category][table] = rows.map(({ isLocalAdmin: _local, ...row }) => ({ ...row, isLocalAdmin: 0 }));
      } else if (table === "towPaperDrafts") {
        data[category][table] = rows.map(({ updatedBy: _user, ...row }) => ({ ...row, updatedBy: null }));
      } else if (table === "issueReports" || table === "auditLogs") {
        data[category][table] = rows.map(({ userId: _user, ...row }) => ({ ...row, userId: null }));
      } else {
        data[category][table] = rows;
      }
    }
  }
  return {
    format: "towteam-portable-export",
    version: 1,
    exportedAt: nowIso(),
    categories: selected,
    data
  };
}

function validatePortablePackage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Upload a valid TowTeam export file.");
  if (value.format !== "towteam-portable-export" || value.version !== 1) throw new Error("Unsupported TowTeam export format.");
  const categories = selectedCategories(value.categories);
  if (!value.data || typeof value.data !== "object" || Array.isArray(value.data)) throw new Error("Export data is missing.");
  for (const category of categories) {
    if (!value.data[category] || typeof value.data[category] !== "object" || Array.isArray(value.data[category])) {
      throw new Error(`Export category is missing: ${category}`);
    }
    for (const table of categoryTables[category]) {
      if (!Array.isArray(value.data[category][table])) throw new Error(`Export table is missing: ${table}`);
      if (value.data[category][table].length > 1_000_000) throw new Error(`Export table is too large: ${table}`);
    }
  }
  return categories;
}

function importRows(table, rows, mode) {
  const allowed = new Set(tableColumns(db, table));
  const keys = tableKeys[table];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const source of rows) {
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error(`Invalid row in ${table}.`);
    const row = Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key)));
    if (table === "users") {
      delete row.id;
      row.isLocalAdmin = 0;
    }
    if (table === "towPaperDrafts") row.updatedBy = null;
    if (table === "issueReports" || table === "auditLogs") row.userId = null;
    for (const [key, value] of Object.entries(row)) if (value === undefined) delete row[key];
    if (!keys.every((key) => row[key] !== undefined && row[key] !== null)) throw new Error(`Missing record key in ${table}.`);
    const where = keys.map((key) => `${key} = @key_${key}${table === "users" && key === "username" ? " COLLATE NOCASE" : ""}`).join(" AND ");
    const keyParams = Object.fromEntries(keys.map((key) => [`key_${key}`, row[key]]));
    const exists = db.prepare(`SELECT 1 FROM ${table} WHERE ${where}`).get(keyParams);
    if (exists && mode === "add") { skipped += 1; continue; }
    const columns = Object.keys(row);
    if (exists) {
      const updates = columns.filter((column) => !keys.includes(column));
      if (table === "users") {
        const existing = db.prepare("SELECT isLocalAdmin FROM users WHERE username = ? COLLATE NOCASE").get(row.username);
        if (existing?.isLocalAdmin) {
          for (const protectedField of ["passwordHash", "role", "autofill", "isLocalAdmin", "isSuperAdmin"]) {
            const index = updates.indexOf(protectedField);
            if (index !== -1) updates.splice(index, 1);
          }
        }
      }
      if (updates.length) db.prepare(`UPDATE ${table} SET ${updates.map((column) => `${column} = @${column}`).join(", ")} WHERE ${where}`).run({ ...row, ...keyParams });
      updated += 1;
    } else {
      db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => `@${column}`).join(", ")})`).run(row);
      inserted += 1;
    }
  }
  return { inserted, updated, skipped };
}

export async function importPortableExport(buffer, requestedCategories, mode = "merge") {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("Import data must be a binary buffer.");
  if (!buffer.length || buffer.length > 200 * 1024 * 1024) throw new Error("Upload a valid TowTeam export file under 200 MB.");
  if (!["add", "merge", "replace"].includes(mode)) throw new Error("Invalid import mode.");
  let payload;
  try { payload = JSON.parse(buffer.toString("utf8")); }
  catch { throw new Error("Upload a valid TowTeam JSON export file."); }
  const available = validatePortablePackage(payload);
  const selected = selectedCategories(requestedCategories);
  if (selected.some((category) => !available.includes(category))) throw new Error("A selected category is not present in this export.");
  const preImportBackup = backupFilename(await createDatabaseBackup("pre-import"));
  const result = db.transaction(() => {
    if (mode === "replace") {
      for (const category of selected) {
        if (category === "users") {
          db.prepare("DELETE FROM users WHERE isLocalAdmin = 0").run();
        } else {
          const tables = [...categoryTables[category]].reverse();
          for (const table of tables) db.prepare(`DELETE FROM ${table}`).run();
        }
      }
    }
    const counts = {};
    for (const category of selected) {
      counts[category] = {};
      for (const table of categoryTables[category]) {
        counts[category][table] = importRows(table, payload.data[category][table], mode === "replace" ? "merge" : mode);
      }
    }
    return counts;
  })();
  return { imported: true, mode, categories: selected, counts: result, preImportBackup };
}
