CREATE TABLE IF NOT EXISTS auditLogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  action TEXT NOT NULL,
  entityType TEXT,
  entityId TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON auditLogs(createdAt);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON auditLogs(entityType, entityId);
