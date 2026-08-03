export default function addAircraftType(db) {
  const columns = db.prepare("PRAGMA table_info(tows)").all().map((column) => column.name);
  if (!columns.includes("aircraftType")) {
    db.exec("ALTER TABLE tows ADD COLUMN aircraftType TEXT");
  }
}
