import express from "express";
import { listAuditLogs, listAuditLogsPage } from "../services/audit.js";
import { requireSuperAdmin } from "../middleware/auth.js";

export const router = express.Router();

router.get("/", requireSuperAdmin, (req, res) => {
  if (req.query.paginated === 'true') {
    const result = listAuditLogsPage(req.query.page, req.query.pageSize, { excludeAction: req.user.canManageAutofill ? '' : 'tow.paper_autofill' });
    result.logs = sanitizeLogs(result.logs, req.user.canManageAutofill);
    return res.json(result);
  }
  const logs = listAuditLogs(req.query.limit);
  res.json(sanitizeLogs(logs.filter((row) => req.user.canManageAutofill || row.action !== 'tow.paper_autofill'), req.user.canManageAutofill));
});

function sanitizeLogs(logs, canManageAutofill) {
  if (canManageAutofill) return logs;
  return logs.map((row) => {
    const details = JSON.parse(row.details);
    delete details.autofill; delete details.canManageAutofill;
    return { ...row, details: JSON.stringify(details) };
  });
}
