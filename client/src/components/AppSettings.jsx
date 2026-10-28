import { useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Megaphone, RotateCcw, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api.js';

export function AppSettings({ settings, onChange, onAnnouncementCreated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [announcement, setAnnouncement] = useState({ title: '', message: '', imageUrl: '', kind: 'change' });
  const [announcementStatus, setAnnouncementStatus] = useState('');
  const [previewAnnouncement, setPreviewAnnouncement] = useState(null);
  const input = useRef(null);
  const hasFavicon = settings?.faviconUrl && !settings.faviconUrl.endsWith('=default');
  useEffect(() => {
    api.listAnnouncements().then(setAnnouncements).catch((err) => setError(err.message));
  }, []);

  async function sendAnnouncement(event) {
    event.preventDefault();
    setBusy(true); setError(''); setAnnouncementStatus('');
    try {
      const created = await api.createAnnouncement(announcement);
      setAnnouncements((current) => [{ ...created, userCount: null }, ...current]);
      setAnnouncement({ title: '', message: '', imageUrl: '', kind: 'change' });
      setAnnouncementStatus('Global message sent. Each user will see it until they acknowledge it.');
      onAnnouncementCreated?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function previewGlobalMessage() {
    const title = announcement.title.trim();
    const message = announcement.message.trim();
    const imageUrl = announcement.imageUrl.trim();
    setError('');
    if (!title || !message) {
      setError('Enter a title and message before previewing.');
      return;
    }
    if (imageUrl) {
      try {
        const parsed = new URL(imageUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      } catch {
        setError('Image URL must be a valid HTTP or HTTPS URL.');
        return;
      }
    }
    setPreviewAnnouncement({ ...announcement, title, message, imageUrl });
  }

  async function removeAnnouncement(item) {
    if (!window.confirm(`Delete global message "${item.title}"? Users who have not acknowledged it will no longer see it.`)) return;
    setBusy(true); setError(''); setAnnouncementStatus('');
    try {
      await api.deleteAnnouncement(item.id);
      setAnnouncements((current) => current.filter((announcementItem) => announcementItem.id !== item.id));
      setAnnouncementStatus('Global message deleted.');
      onAnnouncementCreated?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
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
    setExporting(true); setError(''); setExportProgress({ label: 'Preparing active tow papers...', percent: null });
    try {
      const { blob, filename } = await api.downloadTowPapers(undefined, 'active', progress => {
        setExportProgress({ label: 'Downloading active tow papers...', percent: progress.percent });
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setExportProgress({ label: 'Active tow paper download ready.', percent: 100 });
    } catch (err) { setError(err.message); setExportProgress(null); }
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
      <div className="favicon-setting announcement-settings">
        <h3>Global Message</h3>
        <p className="muted">Send a one-time message that every user must acknowledge.</p>
        <form className="announcement-form" onSubmit={sendAnnouncement}>
          <label>
            <span>Type</span>
            <select value={announcement.kind} onChange={(event) => setAnnouncement({ ...announcement, kind: event.target.value })}>
              <option value="change">Change</option>
              <option value="message">Message</option>
              <option value="alert">Alert</option>
            </select>
          </label>
          <label>
            <span>Title</span>
            <input maxLength="120" required value={announcement.title} onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })} />
          </label>
          <label className="full">
            <span>Message</span>
            <textarea maxLength="4000" required rows="5" value={announcement.message} onChange={(event) => setAnnouncement({ ...announcement, message: event.target.value })} />
          </label>
          <label className="full">
            <span>Image URL (optional)</span>
            <input inputMode="url" maxLength="2048" placeholder="https://example.com/update.png" type="url" value={announcement.imageUrl} onChange={(event) => setAnnouncement({ ...announcement, imageUrl: event.target.value })} />
          </label>
          <div className="announcement-actions">
            <button className="btn blue" disabled={busy} onClick={previewGlobalMessage} type="button">Preview Message</button>
            <button className="btn green" disabled={busy} type="submit"><Megaphone size={18} />Send Global Message</button>
          </div>
        </form>
        {announcementStatus && <p className="notice">{announcementStatus}</p>}
        {announcements.length > 0 && <div className="announcement-history">
          <h4>Recent Messages</h4>
          {announcements.map((item) => <article key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span className={`announcement-kind kind-${item.kind}`}>{item.kind}</span>
              <button aria-label={`Delete ${item.title}`} className="icon-btn announcement-delete" disabled={busy} onClick={() => void removeAnnouncement(item)} title="Delete message" type="button"><Trash2 size={17} /></button>
            </div>
            <p>{item.message}</p>
            {item.imageUrl && <a href={item.imageUrl} rel="noreferrer" target="_blank">View attached image</a>}
            <span className="muted">{item.acknowledgementCount || 0}{item.userCount === null ? '' : ` of ${item.userCount}`} acknowledged</span>
          </article>)}
        </div>}
      </div>
      <div className="favicon-setting">
        <h3>Active Tow Papers</h3>
        <button className="btn blue" type="button" disabled={exporting} onClick={() => void exportActivePapers()}>
          <Download size={18} />{exporting ? 'Preparing papers...' : 'Export Active Tow Papers'}
        </button>
        {exportProgress && <div className="export-progress" role="status">
          <span>{exportProgress.label}{exportProgress.percent !== null ? ` ${exportProgress.percent}%` : ''}</span>
          <progress max="100" {...(exportProgress.percent !== null ? { value: exportProgress.percent } : {})} />
        </div>}
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
      {previewAnnouncement && <div className="modal-backdrop announcement-backdrop">
        <section aria-describedby="preview-announcement-message" aria-labelledby="preview-announcement-title" aria-modal="true" className={`modal announcement-modal kind-${previewAnnouncement.kind}`} role="dialog">
          <span className="announcement-kind">{previewAnnouncement.kind}</span>
          <h2 id="preview-announcement-title">{previewAnnouncement.title}</h2>
          <p id="preview-announcement-message">{previewAnnouncement.message}</p>
          {previewAnnouncement.imageUrl && <img alt="" className="announcement-image" src={previewAnnouncement.imageUrl} />}
          <p className="muted">Preview only. This message has not been sent.</p>
          <button className="btn blue wide" onClick={() => setPreviewAnnouncement(null)} type="button">Close Preview</button>
        </section>
      </div>}
    </section>
  );
}
