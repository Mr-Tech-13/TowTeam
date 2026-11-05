import { useEffect, useState } from 'react';
import { KeyRound, ShieldOff } from 'lucide-react';
import { api } from '../lib/api.js';

export function NodeManagementSettings() {
  const [configuration, setConfiguration] = useState(null);
  const [form, setForm] = useState({ nodeName: '', remoteManagementEnabled: false, releaseChannel: 'stable', pinnedVersion: '' });
  const [enrollment, setEnrollment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function load() {
    const result = await api.getNodeManagement();
    setConfiguration(result);
    setForm({ nodeName: result.nodeName, remoteManagementEnabled: result.remoteManagementEnabled, releaseChannel: result.releaseChannel, pinnedVersion: result.pinnedVersion || '' });
  }
  useEffect(() => { void load().catch((err) => setError(err.message)); }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { const result = await api.updateNodeManagement(form); setConfiguration(result); setMessage('Node management settings saved.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function createEnrollment() {
    setBusy(true); setError(''); setMessage('');
    try { setEnrollment(await api.createNodeEnrollment()); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function revoke(credential) {
    if (!window.confirm(`Disconnect ${credential.label}? It will no longer be able to manage this node.`)) return;
    setBusy(true); setError('');
    try { await api.revokeNodeCredential(credential.id); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <article className="admin-row node-management-setting">
    <div>
      <strong>Node Management</strong>
      <span>Identity, release policy, and access for a future TowTeam deployment manager.</span>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      {configuration && <code className="node-id">Node UUID: {configuration.nodeId}</code>}
      <form className="node-management-form" onSubmit={save}>
        <label><span>Node / station name</span><input maxLength="80" required value={form.nodeName} onChange={(event) => setForm({ ...form, nodeName: event.target.value })} /></label>
        <label><span>Release channel</span><select value={form.releaseChannel} onChange={(event) => setForm({ ...form, releaseChannel: event.target.value })}><option value="stable">Stable</option><option value="preview">Preview</option><option value="pinned">Pinned</option></select></label>
        {form.releaseChannel === 'pinned' && <label><span>Pinned version</span><input placeholder="3.1.4" value={form.pinnedVersion} onChange={(event) => setForm({ ...form, pinnedVersion: event.target.value })} /></label>}
        <label className="check-row full"><input checked={form.remoteManagementEnabled} onChange={(event) => setForm({ ...form, remoteManagementEnabled: event.target.checked })} type="checkbox" />Enable remote node management</label>
        <button className="btn green" disabled={busy} type="submit">Save Node Settings</button>
      </form>
      <div className="node-enrollment-actions"><button className="btn blue" disabled={busy || !configuration?.remoteManagementEnabled} onClick={() => void createEnrollment()} type="button"><KeyRound size={18} />Create One-Time Enrollment Key</button></div>
      {enrollment && <div className="enrollment-key"><strong>Copy this key now</strong><code>{enrollment.key}</code><span>Expires {new Date(enrollment.expiresAt).toLocaleString()} and works once.</span></div>}
      {configuration?.credentials?.length > 0 && <div className="management-credentials"><h4>Manager Credentials</h4>{configuration.credentials.map((credential) => <div key={credential.id}><span><strong>{credential.label}</strong><small>{credential.revokedAt ? `Revoked ${new Date(credential.revokedAt).toLocaleString()}` : credential.lastUsedAt ? `Last used ${new Date(credential.lastUsedAt).toLocaleString()}` : 'Never used'}</small></span>{!credential.revokedAt && <button aria-label={`Disconnect ${credential.label}`} className="icon-btn" disabled={busy} onClick={() => void revoke(credential)} title="Disconnect manager" type="button"><ShieldOff size={18} /></button>}</div>)}</div>}
      {configuration?.jobs?.length > 0 && <details className="management-jobs"><summary>Recent management jobs</summary>{configuration.jobs.slice(0, 20).map((job) => <div key={job.id}><strong>{job.action}</strong><span>{job.status} · {new Date(job.requestedAt).toLocaleString()}</span></div>)}</details>}
    </div>
  </article>;
}
