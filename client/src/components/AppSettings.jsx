import { useState } from 'react';
import { api } from '../lib/api.js';

export function AppSettings({ settings, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function toggle(enabled) {
    setBusy(true);
    setError('');
    try { onChange(await api.updateSettings({ bulkImportEnabled: enabled })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <section>
      <h3>Settings</h3>
      {error && <div className="notice error" role="alert">{error}</div>}
      <label className="check-row">
        <input type="checkbox" checked={Boolean(settings?.bulkImportEnabled)} disabled={busy || !settings} onChange={(event) => void toggle(event.target.checked)} />
        Enable Bulk Import
      </label>
    </section>
  );
}
