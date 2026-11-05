export default function migrate(db) {
  const towColumns = new Set(db.prepare('PRAGMA table_info(tows)').all().map((column) => column.name));
  if (!towColumns.has('headsetOperator')) db.exec("ALTER TABLE tows ADD COLUMN headsetOperator TEXT NOT NULL DEFAULT ''");

  const announcementColumns = new Set(db.prepare('PRAGMA table_info(globalAnnouncements)').all().map((column) => column.name));
  if (!announcementColumns.has('publishAt')) db.exec('ALTER TABLE globalAnnouncements ADD COLUMN publishAt TEXT');
  if (!announcementColumns.has('expiresAt')) db.exec('ALTER TABLE globalAnnouncements ADD COLUMN expiresAt TEXT');
  db.exec('UPDATE globalAnnouncements SET publishAt = createdAt WHERE publishAt IS NULL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS nodeIdentity (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      nodeId TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS managementEnrollments (
      id TEXT PRIMARY KEY,
      keyHash TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdBy INTEGER REFERENCES users(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS managementCredentials (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      lastUsedAt TEXT,
      revokedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS managementJobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      externalJobId TEXT NOT NULL UNIQUE,
      credentialId TEXT REFERENCES managementCredentials(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      result TEXT NOT NULL DEFAULT '{}',
      requestedAt TEXT NOT NULL,
      completedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS userCrewMembers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      crewRole TEXT NOT NULL CHECK (crewRole IN ('driver', 'headset')),
      name TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
      usageCount INTEGER NOT NULL DEFAULT 1,
      lastUsedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS user_crew_member_unique
      ON userCrewMembers(userId, crewRole, name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS user_crew_member_recent
      ON userCrewMembers(userId, crewRole, favorite DESC, lastUsedAt DESC);

    CREATE TABLE IF NOT EXISTS userPreferences (
      userId INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'dark', 'light', 'contrast')),
      language TEXT NOT NULL DEFAULT 'default' CHECK (language IN ('default', 'en', 'es')),
      updatedAt TEXT NOT NULL
    );
  `);

  const defaults = {
    nodeName: 'TowTeam',
    remoteManagementEnabled: 'false',
    releaseChannel: 'stable',
    pinnedVersion: '',
    stationSubtitle: '',
    accentColor: '#22c55e',
    logoUrl: '',
    defaultTheme: 'dark',
    defaultLanguage: 'en',
    paperDestinationConfigured: 'false',
    paperDestinationEnabled: 'false',
    paperDestinationType: 'local',
    paperDestinationPath: '',
    paperDestinationUrl: '',
    paperDestinationUsername: '',
    paperDestinationPassword: ''
  };
  const insert = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) insert.run(key, value);
}
