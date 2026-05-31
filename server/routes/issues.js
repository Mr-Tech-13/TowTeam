import express from "express";
import { db } from "../db/database.js";

export const router = express.Router();

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
});

router.get("/", (req, res) => {
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin role required." });
    return;
  }
  res.json(db.prepare("SELECT * FROM issueReports ORDER BY createdAt DESC LIMIT 200").all());
});
