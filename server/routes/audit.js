import express from "express";
import { listAuditLogs } from "../services/audit.js";

export const router = express.Router();

router.get("/", (req, res) => {
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin role required." });
    return;
  }
  res.json(listAuditLogs(req.query.limit));
});
