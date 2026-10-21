export default function addMobileIdempotency(db) {
  const columns = new Set(db.prepare("PRAGMA table_info(tows)").all().map((column) => column.name));
  if (!columns.has("clientRequestId")) db.exec("ALTER TABLE tows ADD COLUMN clientRequestId TEXT");
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tows_client_request
    ON tows(clientRequestId) WHERE clientRequestId IS NOT NULL`);
}
