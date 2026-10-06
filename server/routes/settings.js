import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { writeAudit } from '../services/audit.js';

export const router = express.Router();
router.get('/', (_req, res) => res.json(getSettings()));
router.put('/', requireAdmin, (req, res) => {
  try {
    const before = getSettings();
    const after = updateSettings(req.body);
    writeAudit(req.user, 'settings.update', { entityType: 'settings', details: { before, after } });
    res.json(after);
  } catch (error) { res.status(400).json({ error: error.message }); }
});
