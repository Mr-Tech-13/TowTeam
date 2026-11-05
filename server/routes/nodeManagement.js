import express from 'express';
import rateLimit from 'express-rate-limit';
import { createDatabaseBackup, backupFilename } from '../services/maintenance.js';
import { writeAudit } from '../services/audit.js';
import { checkForUpdates, installUpdate, restartForUpdate } from '../services/updates.js';
import {
  authenticateManagerToken,
  beginManagementJob,
  enrollManager,
  existingManagementJob,
  finishManagementJob,
  nodeConfiguration,
  verifyManagementJob
} from '../services/nodeManagement.js';
import packageInfo from '../../package.json' with { type: 'json' };

const { version } = packageInfo;

export const router = express.Router();
router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));
router.use(express.json({ limit: '64kb' }));

router.post('/enroll', (req, res) => {
  try { res.status(201).json(enrollManager(req.body || {})); }
  catch (error) { res.status(401).json({ error: error.message }); }
});

router.use((req, res, next) => {
  const match = String(req.get('authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{32,256})$/);
  const credential = authenticateManagerToken(match?.[1]);
  if (!credential) return res.status(401).json({ error: 'Valid node-management credential required.' });
  req.managementCredential = credential;
  next();
});

router.get('/status', async (_req, res) => {
  const node = nodeConfiguration();
  const update = await checkForUpdates({ fetch: false }).catch(() => ({ enabled: false, updateAvailable: false }));
  res.json({
    nodeId: node.nodeId,
    nodeName: node.nodeName,
    version,
    releaseChannel: node.releaseChannel,
    pinnedVersion: node.pinnedVersion,
    databaseHealthy: true,
    uptimeSeconds: Math.floor(process.uptime()),
    update
  });
});

router.post('/jobs', async (req, res) => {
  const job = req.body;
  try {
    verifyManagementJob(job, req.managementCredential);
    const existing = existingManagementJob(job.jobId);
    if (existing) return res.json(existing);
    beginManagementJob(job, req.managementCredential.id);
    let result;
    if (job.action === 'status') result = { node: nodeConfiguration(), version, uptimeSeconds: Math.floor(process.uptime()) };
    else if (job.action === 'check-update') result = await checkForUpdates();
    else if (job.action === 'backup') result = { filename: backupFilename(await createDatabaseBackup('managed')) };
    else if (job.action === 'install-update') {
      const updateStatus = await checkForUpdates();
      const preUpdateBackup = updateStatus.canUpdate ? backupFilename(await createDatabaseBackup('pre-update')) : null;
      result = { ...await installUpdate(), preUpdateBackup };
    } else if (job.action === 'restart') result = { restartRequired: true };
    const completed = finishManagementJob(job.jobId, 'completed', result);
    writeAudit(null, `management.${job.action}`, { entityType: 'node', entityId: nodeConfiguration().nodeId, details: { jobId: job.jobId, credentialId: req.managementCredential.id, result } });
    if (result?.restartRequired) res.once('finish', restartForUpdate);
    res.json(completed);
  } catch (error) {
    if (job?.jobId && existingManagementJob(job.jobId)) finishManagementJob(job.jobId, 'failed', { error: error.message });
    res.status(409).json({ error: error.message || 'Management job failed.' });
  }
});
