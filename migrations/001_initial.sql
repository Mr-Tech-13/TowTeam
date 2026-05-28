CREATE TABLE IF NOT EXISTS tows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  airline TEXT NOT NULL DEFAULT 'MX',
  inboundFlightNumber TEXT NOT NULL,
  inboundStation TEXT,
  eta TEXT,
  gate TEXT,
  fromLocation TEXT,
  toLocation TEXT,
  towSpot TEXT,
  tailNumber TEXT,
  driver TEXT,
  leftWingWalker TEXT,
  rightWingWalker TEXT,
  otherTeamMembers TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  needsReview INTEGER NOT NULL DEFAULT 0,
  parserWarnings TEXT NOT NULL DEFAULT '[]',
  setupStartedAt TEXT,
  goaaCalledAt TEXT,
  goaaArrivalAt TEXT,
  pushStartedAt TEXT,
  towStartedAt TEXT,
  towCompletedAt TEXT,
  towPaperCompletedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tows_status ON tows(status);
CREATE INDEX IF NOT EXISTS idx_tows_completed ON tows(towCompletedAt);
CREATE INDEX IF NOT EXISTS idx_tows_tail ON tows(tailNumber);
CREATE INDEX IF NOT EXISTS idx_tows_flight ON tows(inboundFlightNumber);
CREATE INDEX IF NOT EXISTS idx_tows_gate ON tows(gate);
CREATE INDEX IF NOT EXISTS idx_tows_spot ON tows(towSpot);
