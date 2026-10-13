import { useRef, useState } from 'react';
import { Download, Image as ImageIcon, RotateCcw, Upload } from 'lucide-react';
import { api } from '../lib/api.js';

export function AppSettings({ settings, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const input = useRef(null);
  const hasFavicon = settings?.faviconUrl && !settings.faviconUrl.endsWith('=default');
  async function upload(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      if (file.size > 256 * 1024) throw new Error('Upload a PNG file up to 256 KB.');
      onChange(await api.uploadFavicon(file));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true); setError('');
    try { onChange(await api.resetFavicon()); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function toggle(enabled) {
    setBusy(true);
    setError('');
    try { onChange(await api.updateSettings({ bulkImportEnabled: enabled })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function exportActivePapers() {
    setExporting(true); setError('');
    try {
      const { blob, filename } = await api.downloadTowPapers(undefined, 'active');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { setError(err.message); }
    finally { setExporting(false); }
  }
  return (
    <section>
      <h3>Settings</h3>
      {error && <div className="notice error" role="alert">{error}</div>}
      <label className="check-row">
        <input type="checkbox" checked={Boolean(settings?.bulkImportEnabled)} disabled={busy || !settings} onChange={(event) => void toggle(event.target.checked)} />
        Enable Bulk Import
      </label>
      <div className="favicon-setting">
        <h3>Active Tow Papers</h3>
        <button className="btn blue" type="button" disabled={exporting} onClick={() => void exportActivePapers()}>
          <Download size={18} />{exporting ? 'Preparing papers...' : 'Export Active Tow Papers'}
        </button>
      </div>
      <div className="favicon-setting">
        <h3>Favicon</h3>
        <div className="favicon-controls">
          <div className="favicon-preview">
            {hasFavicon ? <img src={settings.faviconUrl} alt="Current favicon" /> : <ImageIcon size={24} aria-label="No custom favicon" />}
          </div>
          <input ref={input} type="file" accept="image/png,.png" aria-label="Upload favicon" hidden onChange={upload} />
          <button className="btn blue" type="button" disabled={busy || !settings} onClick={() => input.current.click()}><Upload size={18} />Upload PNG</button>
          <button className="icon-btn" type="button" title="Reset favicon" aria-label="Reset favicon" disabled={busy || !hasFavicon} onClick={() => void reset()}><RotateCcw size={18} /></button>
        </div>
      </div>
    </section>
  );
}
