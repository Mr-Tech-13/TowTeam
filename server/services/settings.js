import { db } from '../db/database.js';
import { faviconUrl } from './favicon.js';

const defaults = {
  bulkImportEnabled: true,
  nodeName: 'TowTeam',
  stationSubtitle: '',
  accentColor: '#22c55e',
  logoUrl: '',
  defaultTheme: 'dark',
  defaultLanguage: 'en'
};

function value(key, fallback = '') {
  return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value ?? fallback;
}

function setValue(key, next) {
  db.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(next));
}

export function getSettings() {
  return {
    bulkImportEnabled: value('bulkImportEnabled', String(defaults.bulkImportEnabled)) === 'true',
    nodeName: value('nodeName', defaults.nodeName),
    stationSubtitle: value('stationSubtitle', defaults.stationSubtitle),
    accentColor: value('accentColor', defaults.accentColor),
    logoUrl: value('logoUrl', defaults.logoUrl),
    defaultTheme: value('defaultTheme', defaults.defaultTheme),
    defaultLanguage: value('defaultLanguage', defaults.defaultLanguage),
    faviconUrl: faviconUrl()
  };
}

export function updateSettings(input) {
  if (!input || typeof input !== 'object') throw new Error('Settings are required.');
  if (input.bulkImportEnabled !== undefined) {
    if (typeof input.bulkImportEnabled !== 'boolean') throw new Error('Bulk import setting must be true or false.');
    setValue('bulkImportEnabled', input.bulkImportEnabled);
  }
  if (input.nodeName !== undefined) {
    const nodeName = typeof input.nodeName === 'string' ? input.nodeName.trim() : '';
    if (!nodeName || nodeName.length > 80) throw new Error('Node name must be between 1 and 80 characters.');
    setValue('nodeName', nodeName);
  }
  if (input.stationSubtitle !== undefined) {
    const subtitle = typeof input.stationSubtitle === 'string' ? input.stationSubtitle.trim() : '';
    if (subtitle.length > 120) throw new Error('Station subtitle must be 120 characters or fewer.');
    setValue('stationSubtitle', subtitle);
  }
  if (input.accentColor !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(input.accentColor)) throw new Error('Accent color must be a six-digit hex color.');
    setValue('accentColor', input.accentColor.toLowerCase());
  }
  if (input.logoUrl !== undefined) {
    const logoUrl = typeof input.logoUrl === 'string' ? input.logoUrl.trim() : '';
    if (logoUrl.length > 2048) throw new Error('Logo URL must be 2048 characters or fewer.');
    if (logoUrl) {
      let parsed;
      try { parsed = new URL(logoUrl); } catch { throw new Error('Logo URL must be a valid HTTP or HTTPS URL.'); }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Logo URL must be a valid HTTP or HTTPS URL.');
    }
    setValue('logoUrl', logoUrl);
  }
  if (input.defaultTheme !== undefined) {
    if (!['dark', 'light', 'contrast', 'system'].includes(input.defaultTheme)) throw new Error('Invalid default theme.');
    setValue('defaultTheme', input.defaultTheme);
  }
  if (input.defaultLanguage !== undefined) {
    if (!['en', 'es'].includes(input.defaultLanguage)) throw new Error('Invalid default language.');
    setValue('defaultLanguage', input.defaultLanguage);
  }
  return getSettings();
}

export function requireBulkImport(_req, res, next) {
  if (!getSettings().bulkImportEnabled) return res.status(403).json({ error: 'Bulk import has been disabled by an administrator.' });
  next();
}
