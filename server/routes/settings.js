import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { writeAudit } from '../services/audit.js';
import { faviconLimit, saveFavicon, resetFavicon } from '../services/favicon.js';
import { router as paperBackupRoutes } from './paperBackups.js';

export const router = express.Router();
router.use('/paper-backups', paperBackupRoutes);
router.get('/', (_req, res) => res.json(getSettings()));
router.put('/favicon', requireAdmin, express.raw({ type: ['image/png', 'application/octet-stream'], limit: faviconLimit }), (req, res) => {
  try {
    saveFavicon(req.body);
    writeAudit(req.user, 'settings.favicon_upload', { entityType: 'settings' });
    res.json(getSettings());
  } catch (error) { res.status(400).json({ error: error.message }); }
});
router.delete('/favicon', requireAdmin, (req, res) => {
  resetFavicon();
  writeAudit(req.user, 'settings.favicon_reset', { entityType: 'settings' });
  res.json(getSettings());
});
router.use((error, _req, res, next) => {
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Upload a PNG file up to 256 KB.' });
  next(error);
});
router.put('/', requireAdmin, (req, res) => {
  try {
    const before = getSettings();
    const after = updateSettings(req.body);
    writeAudit(req.user, 'settings.update', { entityType: 'settings', details: { before, after } });
    res.json(after);
  } catch (error) { res.status(400).json({ error: error.message }); }
});
