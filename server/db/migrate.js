import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../migrations");

db.exec("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");

const applied = new Set(db.prepare("SELECT name FROM migrations").all().map((row) => row.name));
const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  if (applied.has(file)) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  const run = db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO migrations (name) VALUES (?)").run(file);
  });
  run();
  console.log(`Applied migration ${file}`);
}
