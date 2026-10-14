import express from 'express';
import { requireAutofillManager } from '../middleware/auth.js';
import { paperBackupStatus, retryPaperBackups, clearPaperBackupQueue } from '../services/paperBackups.js';
import { writeAudit } from '../services/audit.js';

export const router = express.Router();
router.use(requireAutofillManager);
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/', (_req, res) => res.json(paperBackupStatus()));
router.post('/clear', (req, res) => {
  const result = clearPaperBackupQueue();
  writeAudit(req.user, 'paper.backup_clear', { entityType: 'settings', details: result });
  res.json(result);
});
router.post('/retry', (req, res) => {
  if (req.body?.replace !== undefined && typeof req.body.replace !== 'boolean') return res.status(400).json({ error: 'Replace must be true or false.' });
  try {
    const result = retryPaperBackups(req.body?.replace === true);
    writeAudit(req.user, 'paper.backup_retry', { entityType: 'settings', details: { replace: req.body?.replace === true } });
    res.json(result);
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});
