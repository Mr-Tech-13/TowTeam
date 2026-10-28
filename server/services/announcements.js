import { db, nowIso } from '../db/database.js';

const announcementKinds = new Set(['change', 'message', 'alert']);

function validateAnnouncement(input = {}) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const kind = typeof input.kind === 'string' ? input.kind : 'message';
  const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';
  if (!title || title.length > 120) throw new Error('Title is required and must be 120 characters or fewer.');
  if (!message || message.length > 4000) throw new Error('Message is required and must be 4000 characters or fewer.');
  if (!announcementKinds.has(kind)) throw new Error('Announcement type must be change, message, or alert.');
  if (imageUrl.length > 2048) throw new Error('Image URL must be 2048 characters or fewer.');
  if (imageUrl) {
    let parsed;
    try { parsed = new URL(imageUrl); }
    catch { throw new Error('Image URL must be a valid HTTP or HTTPS URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Image URL must be a valid HTTP or HTTPS URL.');
  }
  return { title, message, kind, imageUrl };
}

export function createAnnouncement(input, userId) {
  const announcement = validateAnnouncement(input);
  const result = db.prepare(`
    INSERT INTO globalAnnouncements (title, message, kind, imageUrl, createdBy, createdAt)
    VALUES (@title, @message, @kind, @imageUrl, @createdBy, @createdAt)
  `).run({ ...announcement, createdBy: userId, createdAt: nowIso() });
  return getAnnouncement(result.lastInsertRowid);
}

export function getAnnouncement(id) {
  return db.prepare(`
    SELECT announcements.*, users.username AS createdByUsername,
      (SELECT COUNT(*) FROM announcementAcknowledgements acknowledgements
       WHERE acknowledgements.announcementId = announcements.id) AS acknowledgementCount
    FROM globalAnnouncements announcements
    LEFT JOIN users ON users.id = announcements.createdBy
    WHERE announcements.id = ?
  `).get(id);
}

export function listAnnouncements() {
  return db.prepare(`
    SELECT announcements.*, users.username AS createdByUsername,
      (SELECT COUNT(*) FROM announcementAcknowledgements acknowledgements
       WHERE acknowledgements.announcementId = announcements.id) AS acknowledgementCount,
      (SELECT COUNT(*) FROM users) AS userCount
    FROM globalAnnouncements announcements
    LEFT JOIN users ON users.id = announcements.createdBy
    ORDER BY announcements.id DESC
    LIMIT 50
  `).all();
}

export function listPendingAnnouncements(userId) {
  return db.prepare(`
    SELECT announcements.*, users.username AS createdByUsername
    FROM globalAnnouncements announcements
    LEFT JOIN users ON users.id = announcements.createdBy
    LEFT JOIN announcementAcknowledgements acknowledgements
      ON acknowledgements.announcementId = announcements.id AND acknowledgements.userId = ?
    WHERE acknowledgements.announcementId IS NULL
    ORDER BY announcements.id ASC
  `).all(userId);
}

export function acknowledgeAnnouncement(id, userId) {
  const announcement = db.prepare('SELECT id FROM globalAnnouncements WHERE id = ?').get(id);
  if (!announcement) return null;
  db.prepare(`
    INSERT INTO announcementAcknowledgements (announcementId, userId, acknowledgedAt)
    VALUES (?, ?, ?)
    ON CONFLICT (announcementId, userId) DO NOTHING
  `).run(id, userId, nowIso());
  return { acknowledged: true };
}

export function deleteAnnouncement(id) {
  const announcement = getAnnouncement(id);
  if (!announcement) return null;
  db.prepare('DELETE FROM globalAnnouncements WHERE id = ?').run(id);
  return announcement;
}
