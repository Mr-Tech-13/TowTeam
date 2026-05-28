import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { db } from "./database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../migrations");

db.exec("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");

const applied = new Set(db.prepare("SELECT name FROM migrations").all().map((row) => row.name));
const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql") || file.endsWith(".js")).sort();

for (const file of files) {
  if (applied.has(file)) continue;
  const migration = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  const jsMigration = file.endsWith(".js") ? await import(pathToFileURL(path.join(migrationsDir, file))) : null;
  const run = db.transaction(() => {
    if (file.endsWith(".sql")) {
      db.exec(migration);
    } else {
      jsMigration.default(db);
    }
    db.prepare("INSERT INTO migrations (name) VALUES (?)").run(file);
  });
  run();
  console.log(`Applied migration ${file}`);
}
