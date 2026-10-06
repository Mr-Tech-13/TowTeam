CREATE TABLE IF NOT EXISTS airlines (
  code TEXT PRIMARY KEY COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#60a5fa'
);

INSERT OR IGNORE INTO airlines (code, name, color) VALUES
  ('MX', 'Breeze Airways', '#38bdf8'),
  ('EK', 'Emirates', '#ef4444');

INSERT OR IGNORE INTO airlines (code)
SELECT DISTINCT UPPER(TRIM(airline)) FROM tows
WHERE TRIM(airline) != '';
