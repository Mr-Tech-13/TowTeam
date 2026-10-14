CREATE TABLE paperBackups (
  towId INTEGER PRIMARY KEY REFERENCES tows(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL DEFAULT 1,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  nextAttemptAt TEXT,
  cacheName TEXT,
  filename TEXT NOT NULL,
  checksum TEXT,
  uploadedAt TEXT,
  error TEXT,
  updatedAt TEXT NOT NULL
);
