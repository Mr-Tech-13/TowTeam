import express from "express";
import { db } from "../db/database.js";
import { issueRateLimit } from "../middleware/rateLimit.js";
import { writeAudit } from "../services/audit.js";

export const router = express.Router();

router.use(issueRateLimit);

router.post("/", (req, res) => {
  const message = String(req.body.message || "").trim();
  if (!message) {
    res.status(400).json({ error: "Issue description is required." });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Issue description must be 2000 characters or fewer." });
    return;
  }

  const result = db
    .prepare(
      `INSERT INTO issueReports (userId, username, message, page, userAgent)
       VALUES (@userId, @username, @message, @page, @userAgent)`
    )
    .run({
      userId: req.user.id,
      username: req.user.username,
      message,
      page: String(req.body.page || "").slice(0, 500),
      userAgent: String(req.body.userAgent || "").slice(0, 500)
    });

  res.status(201).json({ id: result.lastInsertRowid, status: "open" });
  writeAudit(req.user, "issue.create", { entityType: "issue", entityId: result.lastInsertRowid });
});

router.get("/", (req, res) => {
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin role required." });
    return;
  }
  res.json(db.prepare("SELECT * FROM issueReports ORDER BY createdAt DESC LIMIT 200").all());
});

router.patch("/:id", (req, res) => {
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin role required." });
    return;
  }
  const status = req.body.status === "closed" ? "closed" : "open";
  const result = db.prepare("UPDATE issueReports SET status = ? WHERE id = ?").run(status, req.params.id);
  if (!result.changes) {
    res.status(404).json({ error: "Issue not found." });
    return;
  }
  writeAudit(req.user, "issue.update", { entityType: "issue", entityId: req.params.id, details: { status } });
  res.json(db.prepare("SELECT * FROM issueReports WHERE id = ?").get(req.params.id));
});
