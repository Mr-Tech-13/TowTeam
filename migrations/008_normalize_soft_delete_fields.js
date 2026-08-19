export default function normalizeSoftDeleteFields(db) {
  const columns = new Set(db.prepare("PRAGMA table_info(tows)").all().map((column) => column.name));
  if (columns.has("deletedAt")) db.exec("UPDATE tows SET deletedAt = NULL WHERE TRIM(deletedAt) = ''");
  if (columns.has("deletedBy")) db.exec("UPDATE tows SET deletedBy = NULL WHERE TRIM(deletedBy) = ''");
  if (columns.has("deleteReason")) db.exec("UPDATE tows SET deleteReason = NULL WHERE TRIM(deleteReason) = ''");
}
