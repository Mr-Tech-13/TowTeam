import express from 'express';
import { requireAutofillManager } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import {
  createEnrollment,
  listManagementJobs,
  nodeConfiguration,
  revokeManagementCredential,
  updateNodeConfiguration
} from '../services/nodeManagement.js';

export const router = express.Router();
router.use(requireAutofillManager);
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

router.get('/', (_req, res) => res.json({ ...nodeConfiguration(), jobs: listManagementJobs() }));

router.put('/', (req, res) => {
  try {
    const before = nodeConfiguration();
    const after = updateNodeConfiguration(req.body || {});
    writeAudit(req.user, 'management.settings_update', { entityType: 'node', entityId: after.nodeId, details: { before, after } });
    res.json({ ...after, jobs: listManagementJobs() });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/enrollment', (req, res) => {
  try {
    const enrollment = createEnrollment(req.user.id);
    writeAudit(req.user, 'management.enrollment_create', { entityType: 'node', entityId: nodeConfiguration().nodeId, details: { enrollmentId: enrollment.id, expiresAt: enrollment.expiresAt } });
    res.status(201).json(enrollment);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.delete('/credentials/:id', (req, res) => {
  if (!revokeManagementCredential(req.params.id)) return res.status(404).json({ error: 'Management credential not found.' });
  writeAudit(req.user, 'management.credential_revoke', { entityType: 'managementCredential', entityId: req.params.id });
  res.status(204).end();
});
