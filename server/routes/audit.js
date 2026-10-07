import express from "express";
import { listAuditLogs } from "../services/audit.js";

export const router = express.Router();

router.get("/", (req, res) => {
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin role required." });
    return;
  }
  const logs = listAuditLogs(req.query.limit);
  if (req.user.canManageAutofill) return res.json(logs);
  res.json(logs.filter((row) => row.action !== 'tow.paper_autofill').map((row) => {
    const details = JSON.parse(row.details);
    delete details.autofill; delete details.canManageAutofill;
    return { ...row, details: JSON.stringify(details) };
  }));
});
