import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, dbPath, nowIso } from '../db/database.js';
import { generateTowPermitPdf, towPaperDetails } from './towPermit.js';

const retention = 60 * 60 * 1000;
const cacheDirectory = path.join(path.dirname(dbPath), 'paper-backup-cache');
let running = false;
let timer;
let lastCleanup = 0;

function config() {
  return { enabled: process.env.NAS_BACKUP_ENABLED === 'true', directory: process.env.NAS_PDF_PATH || '' };
}
const checksum = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

export function enqueuePaperBackup(tow, state, force = false) {
  if (!config().enabled) return false;
  if (!tow || tow.deletedAt || tow.status !== 'completed') {
    if (tow) db.prepare("UPDATE paperBackups SET status = 'cancelled', updatedAt = ? WHERE towId = ? AND status != 'uploaded'").run(nowIso(), tow.id);
    return false;
  }
  const sorted = value => Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
  const snapshot = JSON.stringify({ text: sorted(state.text), answers: sorted(state.answers), risk: sorted(state.risk) });
  const fingerprint = checksum(snapshot);
  const current = db.prepare('SELECT fingerprint, status FROM paperBackups WHERE towId = ?').get(tow.id);
  if (!force && current?.fingerprint === fingerprint && current.status !== 'cancelled') return false;
  db.prepare(`INSERT INTO paperBackups (towId, fingerprint, state, filename, updatedAt)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(towId) DO UPDATE SET
    generation = generation + 1, fingerprint = excluded.fingerprint, state = excluded.state,
    status = 'queued', attempts = 0, nextAttemptAt = NULL, cacheName = NULL,
    checksum = NULL, error = NULL, updatedAt = excluded.updatedAt`)
    .run(tow.id, fingerprint, snapshot, `tow-${tow.id}.pdf`, nowIso());
  return true;
}

function reconcile(force = false) {
  let count = 0;
  const rows = db.prepare("SELECT * FROM tows WHERE status = 'completed' AND deletedAt IS NULL").all();
  for (const tow of rows) {
    const row = db.prepare('SELECT state FROM towPaperDrafts WHERE towId = ?').get(tow.id);
    const saved = row ? JSON.parse(row.state) : {};
    const state = { text: { ...towPaperDetails(tow), ...saved.text }, answers: saved.answers || {}, risk: saved.risk || {} };
    if (enqueuePaperBackup(tow, state, force)) count += 1;
  }
  db.prepare(`UPDATE paperBackups SET status = 'cancelled', updatedAt = ?
    WHERE status NOT IN ('uploaded', 'cancelled') AND towId IN
    (SELECT id FROM tows WHERE status != 'completed' OR deletedAt IS NOT NULL)`).run(nowIso());
  return count;
}

function ioCode(error) {
  return ['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'ENOTCONN', 'EIO', 'ESTALE', 'EROFS', 'ENOSPC', 'ETIMEDOUT'].includes(error?.code) ? error.code : 'IO_ERROR';
}

async function destination() {
  const { enabled, directory } = config();
  if (!enabled) throw new Error('NAS backups are disabled in .env.');
  if (!directory || !path.isAbsolute(directory)) throw new Error('Configure NAS_PDF_PATH as an absolute mounted folder path.');
  // Never create the destination: an absent NAS mount must not become a local backup.
  let info;
  try { info = await fs.stat(directory); }
  catch (error) { throw new Error(`Cannot access NAS folder (${ioCode(error)}). Check NAS_PDF_PATH and the Docker NAS mount.`, { cause: error }); }
  if (!info.isDirectory()) throw new Error('NAS destination is not a directory.');
  return directory;
}

export async function testPaperBackupConnection() {
  let temporary;
  let stage = 'checking NAS folder';
  try {
    const directory = await destination();
    temporary = path.join(directory, `.towteam-probe-${crypto.randomUUID()}.tmp`);
    const bytes = crypto.randomBytes(32);
    stage = 'writing a test file';
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    stage = 'reading the test file';
    if (!bytes.equals(await fs.readFile(temporary))) throw new Error('NAS verification failed.');
    stage = 'deleting the test file';
    await fs.unlink(temporary);
    temporary = null;
    return { ok: true };
  } catch (cause) {
    const detail = stage === 'checking NAS folder' ? cause.message : `${stage} (${ioCode(cause)}). Check NAS account permissions.`;
    const error = new Error(`NAS connection test failed: ${detail}`, { cause });
    error.status = 400;
    throw error;
  } finally {
    if (temporary) await fs.unlink(temporary).catch(() => {});
  }
}

function isCurrent(job) {
  return Boolean(db.prepare(`SELECT b.towId FROM paperBackups b JOIN tows t ON t.id = b.towId
    WHERE b.towId = ? AND b.generation = ? AND t.status = 'completed' AND t.deletedAt IS NULL
    AND b.status != 'cancelled'`).get(job.towId, job.generation));
}

async function transfer(job, generatePdf) {
  let temporary;
  try {
    db.prepare("UPDATE paperBackups SET status = 'generating', cacheName = NULL, updatedAt = ? WHERE towId = ? AND generation = ?").run(nowIso(), job.towId, job.generation);
    const pdf = await generatePdf({ id: job.towId }, { state: JSON.parse(job.state) });
    if (!isCurrent(job)) return;
    const hash = checksum(pdf);
    db.prepare(`UPDATE paperBackups SET checksum = ?, status = 'transferring', updatedAt = ?
      WHERE towId = ? AND generation = ?`).run(hash, nowIso(), job.towId, job.generation);
    const directory = await destination();
    temporary = path.join(directory, `.towteam-upload-${crypto.randomUUID()}.tmp`);
    await fs.writeFile(temporary, pdf, { flag: 'wx', mode: 0o600 });
    if (checksum(await fs.readFile(temporary)) !== hash) throw new Error('NAS verification failed.');
    if (!isCurrent(job)) return;
    // Verified temporary files replace only this tow's destination, never the whole archive.
    await fs.rename(temporary, path.join(directory, `tow-${job.towId}.pdf`));
    temporary = null;
    db.prepare(`UPDATE paperBackups SET status = 'uploaded', uploadedAt = ?, error = NULL,
      nextAttemptAt = NULL, updatedAt = ? WHERE towId = ? AND generation = ?`)
      .run(nowIso(), nowIso(), job.towId, job.generation);
  } catch {
    const attempts = job.attempts + 1;
    const retry = new Date(Date.now() + Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.min(attempts - 1, 7))).toISOString();
    db.prepare(`UPDATE paperBackups SET status = 'failed', attempts = ?, nextAttemptAt = ?,
      error = 'Transfer failed. Check NAS access and PDF dependencies; automatic retry is scheduled.', updatedAt = ?
      WHERE towId = ? AND generation = ? AND status != 'cancelled'`).run(attempts, retry, nowIso(), job.towId, job.generation);
  } finally {
    if (temporary) await fs.unlink(temporary).catch(() => {});
  }
}

export async function cleanupPaperBackupCache(now = Date.now()) {
  let files;
  try { files = await fs.readdir(cacheDirectory); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  // Retire files from the old cache implementation; retries now regenerate from SQLite.
  for (const name of files) {
    if (!/^tow-\d+-\d+\.pdf$/.test(name)) continue;
    const file = path.join(cacheDirectory, name);
    const stat = await fs.lstat(file);
    if (!stat.isFile()) continue;
    if (now - stat.mtimeMs < retention) continue;
    await fs.unlink(file);
    db.prepare('UPDATE paperBackups SET cacheName = NULL WHERE cacheName = ?').run(name);
  }
}

export async function runPaperBackupWorker({ generatePdf = generateTowPermitPdf } = {}) {
  if (running) return;
  running = true;
  try {
    if (config().enabled) {
      reconcile();
      const jobs = db.prepare("SELECT * FROM paperBackups WHERE status IN ('queued', 'failed') AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?) ORDER BY updatedAt LIMIT 10").all(nowIso());
      for (const job of jobs) if (isCurrent(job)) await transfer(job, generatePdf);
    }
    if (Date.now() - lastCleanup >= 60_000) {
      await cleanupPaperBackupCache();
      lastCleanup = Date.now();
    }
  } finally { running = false; }
}

export function startPaperBackupWorker() {
  db.prepare("UPDATE paperBackups SET status = 'queued' WHERE status IN ('generating', 'transferring')").run();
  const tick = () => void runPaperBackupWorker().catch(() => {});
  tick();
  timer = setInterval(tick, 10_000);
  timer.unref();
  return () => clearInterval(timer);
}

export function retryPaperBackups(replace = false) {
  if (!config().enabled) { const error = new Error('NAS backups are disabled in .env.'); error.status = 400; throw error; }
  const count = reconcile(replace);
  if (!replace) db.prepare("UPDATE paperBackups SET nextAttemptAt = NULL WHERE status = 'failed'").run();
  void runPaperBackupWorker().catch(() => {});
  return { queued: count };
}

export function paperBackupStatus() {
  const rows = db.prepare(`SELECT b.towId, b.status, b.filename, b.checksum, b.uploadedAt, b.error,
    b.attempts, b.nextAttemptAt, b.updatedAt, t.tailNumber FROM paperBackups b JOIN tows t ON t.id = b.towId
    WHERE t.status = 'completed' AND t.deletedAt IS NULL ORDER BY b.updatedAt DESC`).all();
  const total = rows.length;
  const uploaded = rows.filter(row => row.status === 'uploaded').length;
  return { enabled: config().enabled, configured: Boolean(config().directory), running,
    total, uploaded, pending: total - uploaded, failed: rows.filter(row => row.status === 'failed').length,
    progress: total ? Math.round(uploaded / total * 100) : 0, jobs: rows.slice(0, 50) };
}
