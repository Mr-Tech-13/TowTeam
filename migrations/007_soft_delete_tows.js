export default function addSoftDeleteTowFields(db) {
  const columns = db.prepare("PRAGMA table_info(tows)").all().map((column) => column.name);
  const additions = [
    ["deletedAt", "TEXT"],
    ["deletedBy", "TEXT"],
    ["deleteReason", "TEXT"]
  ];

  for (const [name, type] of additions) {
    if (!columns.includes(name)) {
      db.exec(`ALTER TABLE tows ADD COLUMN ${name} ${type}`);
    }
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_tows_deleted ON tows(deletedAt)");
}
