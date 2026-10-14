import { useEffect, useState } from 'react';
import { RefreshCw, Upload, PlugZap } from 'lucide-react';
import { api } from '../lib/api.js';

export function PaperBackupSettings() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let mounted = true;
    let loading = false;
    async function poll() {
      if (loading) return;
      loading = true;
      try { const result = await api.paperBackupStatus(); if (mounted) { setStatus(result); setError(''); } }
      catch (err) { if (mounted) setError(err.message); }
      finally { loading = false; }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);
  async function act(action) {
    if (action === 'replace' && !window.confirm('Replace NAS copies of all completed tow papers with their latest saved versions?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'test') { await api.testPaperBackupConnection(); setMessage('Connection verified.'); }
      else { await api.retryPaperBackups(action === 'replace'); setMessage(action === 'replace' ? 'Replacement uploads queued.' : 'Pending transfers scheduled.'); }
      setStatus(await api.paperBackupStatus());
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="favicon-setting paper-backup-setting">
      <h3>NAS Paper Backups</h3>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      <div className="backup-summary">
        <span>{!status ? 'Loading...' : !status.enabled ? 'Disabled' : !status.configured ? 'Not configured' : status.running ? 'Transferring...' : 'Enabled'}</span>
        {status && <span>{status.uploaded} / {status.total} uploaded · {status.pending} pending{status.failed ? ` · ${status.failed} failed` : ''}</span>}
      </div>
      <progress max="100" value={status?.progress || 0} aria-label="NAS paper backup progress" />
      <div className="backup-controls">
        <button type="button" className="btn ghost" disabled={busy || !status?.enabled || !status?.configured} onClick={() => void act('test')}><PlugZap size={18} />Test Connection</button>
        <button type="button" className="btn blue" disabled={busy || !status?.enabled} onClick={() => void act('retry')}><RefreshCw size={18} />Transfer Pending</button>
        <button type="button" className="btn ghost" disabled={busy || !status?.enabled} onClick={() => void act('replace')}><Upload size={18} />Replace All Completed</button>
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
