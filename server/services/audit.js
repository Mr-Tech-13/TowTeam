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

export function listAuditLogsPage(page = 1, pageSize = 10, { excludeAction = '' } = {}) {
  const sizes = [5, 10, 25, 50, 100];
  const size = sizes.includes(Number(pageSize)) ? Number(pageSize) : 10;
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const where = excludeAction ? 'WHERE action != @excludeAction' : '';
  const total = db.prepare(`SELECT COUNT(*) AS count FROM auditLogs ${where}`).get({ excludeAction }).count;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(requestedPage, totalPages);
  const logs = db.prepare(`SELECT * FROM auditLogs ${where} ORDER BY createdAt DESC LIMIT @limit OFFSET @offset`)
    .all({ excludeAction, limit: size, offset: (currentPage - 1) * size });
  return { logs, page: currentPage, pageSize: size, total, totalPages };
}
