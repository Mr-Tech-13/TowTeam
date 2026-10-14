import { useEffect, useState } from 'react';
import { RefreshCw, Upload, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';

export function PaperBackupSettings() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
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
      <h3>Folder Backups</h3>
      {(error || loadError) && <div className="notice error" role="alert">{error || loadError}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      {status && <div className="backup-folder"><span>Folder</span><code>{status.directory || 'Not configured'}</code></div>}
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
