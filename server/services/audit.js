import { db } from "../db/database.js";

export function writeAudit(user, action, { entityType = "", entityId = "", details = {} } = {}) {
  db.prepare(
    `INSERT INTO auditLogs (userId, username, action, entityType, entityId, details)
     VALUES (@userId, @username, @action, @entityType, @entityId, @details)`
  ).run({
    userId: user?.id || null,
    username: user?.username || "",
    action,
    entityType,
    entityId: String(entityId || ""),
    details: JSON.stringify(details)
  });
}

export function listAuditLogs(limit = 200) {
  return db.prepare("SELECT * FROM auditLogs ORDER BY createdAt DESC LIMIT ?").all(Math.min(Number(limit) || 200, 500));
}
