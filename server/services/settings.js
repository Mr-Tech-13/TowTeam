import { db } from '../db/database.js';

export function getSettings() {
  return { bulkImportEnabled: db.prepare('SELECT value FROM app_settings WHERE key = ?').get('bulkImportEnabled')?.value === 'true' };
}

export function updateSettings(input) {
  if (typeof input?.bulkImportEnabled !== 'boolean') throw new Error('Bulk import setting must be true or false.');
  db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(String(input.bulkImportEnabled), 'bulkImportEnabled');
  return getSettings();
}

export function requireBulkImport(_req, res, next) {
  if (!getSettings().bulkImportEnabled) return res.status(403).json({ error: 'Bulk import has been disabled by an administrator.' });
  next();
}
