import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import '../db/migrate.js';
import { db } from '../db/database.js';
import {
  authenticateManagerToken,
  beginManagementJob,
  canonicalJob,
  createEnrollment,
  enrollManager,
  ensureNodeIdentity,
  existingManagementJob,
  finishManagementJob,
  nodeConfiguration,
  revokeManagementCredential,
  updateNodeConfiguration,
  verifyManagementJob
} from '../services/nodeManagement.js';
import { createUser } from '../services/users.js';

test('node identity persists and enrollment creates a revocable restricted credential', () => {
  const user = createUser({ username: `node-owner-${Date.now()}`, password: 'test-only', role: 'admin' });
  const original = nodeConfiguration();
  let credentialId;
  try {
    const nodeId = ensureNodeIdentity();
    assert.equal(ensureNodeIdentity(), nodeId);
    updateNodeConfiguration({ nodeName: 'Test Station', remoteManagementEnabled: true, releaseChannel: 'preview' });
    const enrollment = createEnrollment(user.id);
    const enrolled = enrollManager({ enrollmentKey: enrollment.key, label: 'Test Manager' });
    credentialId = enrolled.credentialId;
    assert.equal(enrolled.nodeId, nodeId);
    assert.equal(enrolled.nodeName, 'Test Station');
    assert.ok(authenticateManagerToken(enrolled.token));
    assert.throws(() => enrollManager({ enrollmentKey: enrollment.key }), /invalid or expired/i);

    const job = { jobId: crypto.randomUUID(), action: 'status', payload: {}, timestamp: new Date().toISOString() };
    const credential = authenticateManagerToken(enrolled.token);
    job.signature = crypto.createHmac('sha256', crypto.createHash('sha256').update(enrolled.token).digest('hex')).update(canonicalJob(job)).digest('hex');
    assert.equal(verifyManagementJob(job, credential), true);
    beginManagementJob(job, credential.id);
    assert.equal(finishManagementJob(job.jobId, 'completed', { ok: true }).result.ok, true);
    assert.equal(existingManagementJob(job.jobId).status, 'completed');
    assert.equal(revokeManagementCredential(credential.id), true);
    assert.equal(authenticateManagerToken(enrolled.token), null);
  } finally {
    if (credentialId) db.prepare('DELETE FROM managementJobs WHERE credentialId = ?').run(credentialId);
    db.prepare('DELETE FROM managementEnrollments WHERE createdBy = ?').run(user.id);
    if (credentialId) db.prepare('DELETE FROM managementCredentials WHERE id = ?').run(credentialId);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    updateNodeConfiguration({ nodeName: original.nodeName, remoteManagementEnabled: original.remoteManagementEnabled, releaseChannel: original.releaseChannel, pinnedVersion: original.pinnedVersion });
  }
});

test('signed jobs reject stale and modified payloads', () => {
  const credential = { tokenHash: crypto.randomBytes(32).toString('hex') };
  const job = { jobId: crypto.randomUUID(), action: 'backup', payload: {}, timestamp: new Date().toISOString() };
  job.signature = crypto.createHmac('sha256', credential.tokenHash).update(canonicalJob(job)).digest('hex');
  assert.equal(verifyManagementJob(job, credential), true);
  assert.throws(() => verifyManagementJob({ ...job, action: 'restart' }, credential), /signature/i);
  const stale = { ...job, timestamp: new Date(Date.now() - 10 * 60_000).toISOString() };
  stale.signature = crypto.createHmac('sha256', credential.tokenHash).update(canonicalJob(stale)).digest('hex');
  assert.throws(() => verifyManagementJob(stale, credential), /expired/i);
});
