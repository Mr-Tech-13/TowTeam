import express from "express";
import { writeAudit } from "../services/audit.js";
import { createUser, deleteUser, getUserById, listUsers, updatePassword, updateUser } from "../services/users.js";
import { requireAdmin } from "../middleware/auth.js";

export const router = express.Router();

router.use(requireAdmin);

function visibleUser(req, user) {
  if (!user || req.user.canManageAutofill) return user;
  const visible = { ...user }; delete visible.autofill; delete visible.canManageAutofill;
  return visible;
}

router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  if (['isLocalAdmin', 'isLocalAdministrator', 'canManageAutofill'].some((key) => Object.hasOwn(req.body || {}, key))) {
    return res.status(403).json({ error: 'Local administrator identity cannot be changed through the user API.' });
  }
  if (req.user.canManageAutofill) return next();
  const targetId = req.path.split('/')[1];
  const target = targetId ? getUserById(targetId) : null;
  if (Object.hasOwn(req.body || {}, 'autofill') || target?.isLocalAdministrator) {
    return res.status(403).json({ error: 'Only the local administrator can manage Autofill permissions or the local administrator account.' });
  }
  next();
});

router.get("/", (req, res) => {
  res.json(listUsers().map((user) => visibleUser(req, user)));
});

router.post("/", (req, res) => {
  try {
    const user = createUser(req.body);
    writeAudit(req.user, "user.create", { entityType: "user", entityId: user.id, details: { username: user.username, role: user.role, autofill: user.autofill } });
    res.status(201).json(visibleUser(req, user));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/:id", (req, res) => {
  try {
    const user = updateUser(req.params.id, req.body);
    if (!user) res.status(404).json({ error: "User not found." });
    else {
      writeAudit(req.user, "user.update", { entityType: "user", entityId: user.id, details: { username: user.username, role: user.role, autofill: user.autofill } });
      res.json(visibleUser(req, user));
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
      res.json(visibleUser(req, user));
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
