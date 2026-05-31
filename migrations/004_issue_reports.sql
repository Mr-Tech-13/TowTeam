CREATE TABLE IF NOT EXISTS issueReports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  message TEXT NOT NULL,
  page TEXT,
  userAgent TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_issue_reports_status ON issueReports(status);
CREATE INDEX IF NOT EXISTS idx_issue_reports_created ON issueReports(createdAt);
