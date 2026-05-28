export default function up(db) {
  const columns = db.prepare("PRAGMA table_info(tows)").all().map((column) => column.name);

  if (!columns.includes("towPaperCompletedAt")) {
    db.exec("ALTER TABLE tows ADD COLUMN towPaperCompletedAt TEXT");
  }
}
