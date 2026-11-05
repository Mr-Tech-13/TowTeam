import crypto from 'node:crypto';
import { db, nowIso } from '../db/database.js';

const enrollmentLifetimeMs = 20 * 60 * 1000;
const signatureWindowMs = 5 * 60 * 1000;
const allowedChannels = new Set(['stable', 'preview', 'pinned']);
const allowedActions = new Set(['status', 'check-update', 'install-update', 'restart', 'backup']);

function setting(key, fallback = '') {
  return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value ?? fallback;
}

function setSetting(key, value) {
  db.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function timingSafeHexEqual(left, right) {
  const a = Buffer.from(String(left), 'hex');
  const b = Buffer.from(String(right), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function ensureNodeIdentity() {
  const current = db.prepare('SELECT nodeId FROM nodeIdentity WHERE singleton = 1').get();
  if (current) return current.nodeId;
  const timestamp = nowIso();
  const nodeId = crypto.randomUUID();
  db.prepare('INSERT INTO nodeIdentity (singleton, nodeId, createdAt, updatedAt) VALUES (1, ?, ?, ?)').run(nodeId, timestamp, timestamp);
  return nodeId;
}

export function nodeConfiguration() {
  return {
    nodeId: ensureNodeIdentity(),
    nodeName: setting('nodeName', 'TowTeam'),
    remoteManagementEnabled: setting('remoteManagementEnabled') === 'true',
    releaseChannel: setting('releaseChannel', 'stable'),
    pinnedVersion: setting('pinnedVersion'),
    credentials: db.prepare(`SELECT id, label, createdAt, lastUsedAt, revokedAt
      FROM managementCredentials ORDER BY createdAt DESC`).all()
  };
}

export function updateNodeConfiguration(input = {}) {
  if (input.nodeName !== undefined) {
    const name = typeof input.nodeName === 'string' ? input.nodeName.trim() : '';
    if (!name || name.length > 80) throw new Error('Node name must be between 1 and 80 characters.');
    setSetting('nodeName', name);
  }
  if (input.remoteManagementEnabled !== undefined) {
    if (typeof input.remoteManagementEnabled !== 'boolean') throw new Error('Remote management must be true or false.');
    setSetting('remoteManagementEnabled', input.remoteManagementEnabled);
  }
  if (input.releaseChannel !== undefined) {
    if (!allowedChannels.has(input.releaseChannel)) throw new Error('Release channel must be stable, preview, or pinned.');
    setSetting('releaseChannel', input.releaseChannel);
  }
  if (input.pinnedVersion !== undefined) {
    const version = typeof input.pinnedVersion === 'string' ? input.pinnedVersion.trim() : '';
    if (version && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Pinned version must be a semantic version.');
    setSetting('pinnedVersion', version);
  }
  return nodeConfiguration();
}

export function createEnrollment(userId) {
  if (setting('remoteManagementEnabled') !== 'true') throw new Error('Enable remote management before creating an enrollment key.');
  const id = crypto.randomUUID();
  const key = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + enrollmentLifetimeMs).toISOString();
  db.prepare('DELETE FROM managementEnrollments WHERE usedAt IS NOT NULL OR expiresAt <= ?').run(nowIso());
  db.prepare(`INSERT INTO managementEnrollments (id, keyHash, expiresAt, createdBy, createdAt)
    VALUES (?, ?, ?, ?, ?)`).run(id, digest(key), expiresAt, userId, nowIso());
  return { id, key, expiresAt };
}

export function enrollManager({ enrollmentKey, label }) {
  if (setting('remoteManagementEnabled') !== 'true') throw new Error('Remote management is disabled.');
  const keyHash = digest(enrollmentKey || '');
  const enrollment = db.prepare(`SELECT * FROM managementEnrollments
    WHERE keyHash = ? AND usedAt IS NULL AND expiresAt > ?`).get(keyHash, nowIso());
  if (!enrollment) throw new Error('Enrollment key is invalid or expired.');
  const credentialId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const credentialLabel = typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : 'TowTeam Manager';
  const transaction = db.transaction(() => {
    db.prepare('UPDATE managementEnrollments SET usedAt = ? WHERE id = ?').run(nowIso(), enrollment.id);
    db.prepare(`INSERT INTO managementCredentials (id, label, tokenHash, createdAt)
      VALUES (?, ?, ?, ?)`).run(credentialId, credentialLabel, digest(token), nowIso());
  });
  transaction();
  return { credentialId, token, nodeId: ensureNodeIdentity(), nodeName: setting('nodeName', 'TowTeam') };
}

export function authenticateManagerToken(token) {
  if (setting('remoteManagementEnabled') !== 'true' || typeof token !== 'string' || token.length < 32) return null;
  const tokenHash = digest(token);
  const credential = db.prepare(`SELECT * FROM managementCredentials
    WHERE tokenHash = ? AND revokedAt IS NULL`).get(tokenHash);
  if (!credential) return null;
  db.prepare('UPDATE managementCredentials SET lastUsedAt = ? WHERE id = ?').run(nowIso(), credential.id);
  return { ...credential, tokenHash };
}

export function revokeManagementCredential(id) {
  const result = db.prepare('UPDATE managementCredentials SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL').run(nowIso(), id);
  return result.changes > 0;
}

export function canonicalJob(job) {
  return JSON.stringify({
    jobId: job.jobId,
    action: job.action,
    payload: job.payload || {},
    timestamp: job.timestamp
  });
}

export function verifyManagementJob(job, credential) {
  if (!job || typeof job !== 'object') throw new Error('Signed job is required.');
  if (!/^[0-9a-f-]{36}$/i.test(job.jobId || '')) throw new Error('Job ID must be a UUID.');
  if (!allowedActions.has(job.action)) throw new Error('Unsupported management action.');
  const timestamp = Date.parse(job.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > signatureWindowMs) throw new Error('Management job has expired.');
  if (!/^[0-9a-f]{64}$/i.test(job.signature || '')) throw new Error('Invalid management signature.');
  const expected = crypto.createHmac('sha256', credential.tokenHash).update(canonicalJob(job)).digest('hex');
  if (!timingSafeHexEqual(expected, job.signature)) throw new Error('Invalid management signature.');
  return true;
}

export function existingManagementJob(externalJobId) {
  const row = db.prepare('SELECT * FROM managementJobs WHERE externalJobId = ?').get(externalJobId);
  if (!row) return null;
  return { ...row, payload: JSON.parse(row.payload || '{}'), result: JSON.parse(row.result || '{}') };
}

export function beginManagementJob(job, credentialId) {
  db.prepare(`INSERT INTO managementJobs
    (externalJobId, credentialId, action, payload, status, requestedAt)
    VALUES (?, ?, ?, ?, 'running', ?)`).run(job.jobId, credentialId, job.action, JSON.stringify(job.payload || {}), nowIso());
}

export function finishManagementJob(jobId, status, result) {
  db.prepare(`UPDATE managementJobs SET status = ?, result = ?, completedAt = ?
    WHERE externalJobId = ?`).run(status, JSON.stringify(result || {}), nowIso(), jobId);
  return existingManagementJob(jobId);
}

export function listManagementJobs(limit = 50) {
  return db.prepare(`SELECT jobs.*, credentials.label AS credentialLabel
    FROM managementJobs jobs LEFT JOIN managementCredentials credentials ON credentials.id = jobs.credentialId
    ORDER BY jobs.id DESC LIMIT ?`).all(Math.min(Number(limit) || 50, 200)).map((row) => ({
      ...row,
      payload: JSON.parse(row.payload || '{}'),
      result: JSON.parse(row.result || '{}')
    }));
}
