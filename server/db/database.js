import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
export const dbPath = path.resolve(rootDir, process.env.DATABASE_URL || "./data/towteam.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function nowIso() {
  return new Date().toISOString();
}

export function parseJsonList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rowToTow(row) {
  if (!row) return null;
  return {
    ...row,
    needsReview: Boolean(row.needsReview),
    parserWarnings: parseJsonList(row.parserWarnings)
  };
}
