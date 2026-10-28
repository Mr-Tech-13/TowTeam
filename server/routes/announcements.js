import express from 'express';
import { requireSuperAdmin } from '../middleware/auth.js';
import { acknowledgeAnnouncement, createAnnouncement, deleteAnnouncement, listAnnouncements, listPendingAnnouncements } from '../services/announcements.js';
import { writeAudit } from '../services/audit.js';

export const router = express.Router();

router.get('/pending', (req, res) => res.json(listPendingAnnouncements(req.user.id)));

router.post('/:id/acknowledge', (req, res) => {
  const result = acknowledgeAnnouncement(req.params.id, req.user.id);
  if (!result) return res.status(404).json({ error: 'Announcement not found.' });
  res.json(result);
});

router.get('/', requireSuperAdmin, (_req, res) => res.json(listAnnouncements()));

router.post('/', requireSuperAdmin, (req, res) => {
  try {
    const announcement = createAnnouncement(req.body, req.user.id);
    writeAudit(req.user, 'announcement.create', { entityType: 'announcement', entityId: announcement.id, details: { title: announcement.title, kind: announcement.kind } });
    res.status(201).json(announcement);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', requireSuperAdmin, (req, res) => {
  const announcement = deleteAnnouncement(req.params.id);
  if (!announcement) return res.status(404).json({ error: 'Announcement not found.' });
  writeAudit(req.user, 'announcement.delete', { entityType: 'announcement', entityId: announcement.id, details: { title: announcement.title, kind: announcement.kind } });
  res.status(204).end();
});
