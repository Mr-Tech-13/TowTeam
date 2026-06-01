import express from "express";
import { writeAudit } from "../services/audit.js";
import { createUser, deleteUser, listUsers, updatePassword, updateUser } from "../services/users.js";
import { requireAdmin } from "../middleware/auth.js";

export const router = express.Router();

router.use(requireAdmin);

router.get("/", (_req, res) => {
  res.json(listUsers());
});

router.post("/", (req, res) => {
  try {
    const user = createUser(req.body);
    writeAudit(req.user, "user.create", { entityType: "user", entityId: user.id, details: { username: user.username, role: user.role } });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/:id", (req, res) => {
  try {
    const user = updateUser(req.params.id, req.body);
    if (!user) res.status(404).json({ error: "User not found." });
    else {
      writeAudit(req.user, "user.update", { entityType: "user", entityId: user.id, details: { username: user.username, role: user.role } });
      res.json(user);
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/:id/password", (req, res) => {
  try {
    const user = updatePassword(req.params.id, req.body.password);
    if (!user) res.status(404).json({ error: "User not found." });
    else {
      writeAudit(req.user, "user.password", { entityType: "user", entityId: user.id, details: { username: user.username } });
      res.json(user);
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/:id", (req, res) => {
  try {
    if (!deleteUser(req.params.id, req.user.id)) res.status(404).json({ error: "User not found." });
    else {
      writeAudit(req.user, "user.delete", { entityType: "user", entityId: req.params.id });
      res.status(204).end();
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
