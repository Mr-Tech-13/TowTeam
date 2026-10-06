export default function addAirlineAircraftTypes(db) {
  db.exec("ALTER TABLE airlines ADD COLUMN aircraftTypes TEXT NOT NULL DEFAULT '[]'");
  const find = db.prepare("SELECT DISTINCT UPPER(TRIM(aircraftType)) AS type FROM tows WHERE airline = ? COLLATE NOCASE AND TRIM(COALESCE(aircraftType, '')) != '' ORDER BY type");
  const update = db.prepare('UPDATE airlines SET aircraftTypes = ? WHERE code = ?');
  for (const airline of db.prepare('SELECT code FROM airlines').all()) {
    update.run(JSON.stringify(find.all(airline.code).map((row) => row.type)), airline.code);
  }
}
