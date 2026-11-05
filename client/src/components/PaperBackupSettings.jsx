import { useEffect, useState } from 'react';
import { RefreshCw, Upload, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';

export function PaperBackupSettings() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [destination, setDestination] = useState(null);
  const [destinationForm, setDestinationForm] = useState({ enabled: false, type: 'local', path: '', url: '', username: '', password: '' });
  useEffect(() => {
    let mounted = true;
    let loading = false;
    async function poll() {
      if (loading) return;
      loading = true;
      try { const result = await api.paperBackupStatus(); if (mounted) { setStatus(result); setLoadError(''); } }
      catch (err) { if (mounted) setLoadError(err.message); }
      finally { loading = false; }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    api.paperDestinationSettings().then((result) => {
      setDestination(result);
      setDestinationForm({ enabled: result.enabled, type: result.type, path: result.path || '', url: result.url || '', username: result.username || '', password: '' });
    }).catch((err) => setLoadError(err.message));
  }, []);
  async function saveDestination(event) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.updatePaperDestination(destinationForm);
      setDestination(result);
      setDestinationForm((current) => ({ ...current, password: '' }));
      setStatus(await api.paperBackupStatus());
      setMessage('Paper destination saved.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function testDestination() {
    setBusy(true); setError(''); setMessage('');
    try { await api.testPaperDestination(); setMessage('Destination connection and write verification succeeded.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function act(action) {
    if (action === 'replace' && !window.confirm('Replace folder copies of all completed tow papers with their latest saved versions?')) return;
    if (action === 'clear' && !window.confirm('Clear pending paper uploads? Existing destination PDFs will not be deleted.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'clear') { const result = await api.clearPaperBackupQueue(); setMessage(`Cleared ${result.cleared} pending upload${result.cleared === 1 ? '' : 's'}.`); }
      else { await api.retryPaperBackups(action === 'replace'); setMessage(action === 'replace' ? 'Replacement uploads queued.' : 'Pending transfers scheduled.'); }
      setStatus(await api.paperBackupStatus());
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="favicon-setting paper-backup-setting">
      <h3>Tow Paper Destination</h3>
      {(error || loadError) && <div className="notice error" role="alert">{error || loadError}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      {destination?.legacyEnvironment && <p className="muted">Currently using the legacy environment configuration. Saving this form switches the node to panel-managed settings.</p>}
      <form className="paper-destination-form" onSubmit={saveDestination}>
        <label className="check-row"><input checked={destinationForm.enabled} onChange={(event) => setDestinationForm({ ...destinationForm, enabled: event.target.checked })} type="checkbox" />Enable automatic completed-paper delivery</label>
        <label><span>Destination</span><select value={destinationForm.type} onChange={(event) => setDestinationForm({ ...destinationForm, type: event.target.value })}><option value="local">Local folder</option><option value="webdav">WebDAV / HTTP server</option></select></label>
        {destinationForm.type === 'local' ? <label className="full"><span>Server path</span><input placeholder="/app/data/paper-backups" value={destinationForm.path} onChange={(event) => setDestinationForm({ ...destinationForm, path: event.target.value })} /></label> : <>
          <label className="full"><span>WebDAV folder URL</span><input inputMode="url" placeholder="https://storage.example.com/remote.php/dav/files/user/tow-papers/" type="url" value={destinationForm.url} onChange={(event) => setDestinationForm({ ...destinationForm, url: event.target.value })} /></label>
          <label><span>Username</span><input autoComplete="off" value={destinationForm.username} onChange={(event) => setDestinationForm({ ...destinationForm, username: event.target.value })} /></label>
          <label><span>Password {destination?.hasPassword ? '(leave blank to keep current)' : ''}</span><input autoComplete="new-password" type="password" value={destinationForm.password} onChange={(event) => setDestinationForm({ ...destinationForm, password: event.target.value })} /></label>
        </>}
        <div className="backup-controls full"><button className="btn green" disabled={busy} type="submit">Save Destination</button><button className="btn blue" disabled={busy || !destination?.configured || !destination?.enabled} onClick={() => void testDestination()} type="button">Test Connection</button></div>
      </form>
      {status && <div className="backup-folder"><span>{status.type === 'webdav' ? 'Remote URL' : 'Folder'}</span><code>{status.destination || 'Not configured'}</code></div>}
      <div className="backup-summary">
        <span>{!status ? 'Loading...' : !status.enabled ? 'Disabled' : !status.configured ? 'Not configured' : status.running ? 'Transferring...' : 'Enabled'}</span>
        {status && <span>{status.uploaded} / {status.total} uploaded · {status.pending} pending{status.failed ? ` · ${status.failed} failed` : ''}</span>}
      </div>
      <progress max="100" value={status?.progress || 0} aria-label="Folder backup progress" />
      <div className="backup-controls">
        <button type="button" className="btn blue" disabled={busy || !status?.enabled} onClick={() => void act('retry')}><RefreshCw size={18} />Transfer Pending</button>
        <button type="button" className="btn ghost" disabled={busy || !status?.enabled} onClick={() => void act('replace')}><Upload size={18} />Replace All Completed</button>
        <button type="button" className="btn ghost" disabled={busy || !status?.pending} onClick={() => void act('clear')}><Trash2 size={18} />Clear Queue</button>
      </div>
      {status?.jobs.length > 0 && <ul className="backup-jobs">
        {status.jobs.map(job => <li key={job.towId}>
          <div><strong>{job.tailNumber || `Tow ${job.towId}`}</strong><span>{job.filename}</span></div>
          <span>{job.status}</span>
          {job.error && <small>{job.error}</small>}
        </li>)}
      </ul>}
    </div>
  );
}
