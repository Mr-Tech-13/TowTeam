export default function expandLanguages(db) {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'userPreferences'").get();
  if (!table || table.sql.includes("'ar-EG'")) return;

  db.exec(`
    ALTER TABLE userPreferences RENAME TO userPreferences_legacy;
    CREATE TABLE userPreferences (
      userId INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'dark', 'light', 'contrast')),
      language TEXT NOT NULL DEFAULT 'default' CHECK (language IN ('default', 'en', 'es', 'pl', 'ar-EG')),
      updatedAt TEXT NOT NULL
    );
    INSERT INTO userPreferences (userId, theme, language, updatedAt)
      SELECT userId, theme, language, updatedAt FROM userPreferences_legacy;
    DROP TABLE userPreferences_legacy;
  `);
}
