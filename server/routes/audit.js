import express from "express";
import { listAuditLogs } from "../services/audit.js";
import { requireSuperAdmin } from "../middleware/auth.js";

export const router = express.Router();

router.get("/", requireSuperAdmin, (req, res) => {
  const logs = listAuditLogs(req.query.limit);
  if (req.user.canManageAutofill) return res.json(logs);
  res.json(logs.filter((row) => row.action !== 'tow.paper_autofill').map((row) => {
    const details = JSON.parse(row.details);
    delete details.autofill; delete details.canManageAutofill;
    return { ...row, details: JSON.stringify(details) };
  }));
});
