CREATE TABLE globalAnnouncements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('change', 'message', 'alert')) DEFAULT 'message',
  createdBy INTEGER REFERENCES users(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE announcementAcknowledgements (
  announcementId INTEGER NOT NULL REFERENCES globalAnnouncements(id) ON DELETE CASCADE,
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledgedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (announcementId, userId)
);

CREATE INDEX idx_announcement_acknowledgements_user
  ON announcementAcknowledgements(userId, announcementId);
