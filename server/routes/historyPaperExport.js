import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipArchive } from 'archiver';
import { maxPaperExportTows, paperArchiveFilename } from '../../shared/paperExport.js';
import { getTow, listTows } from '../services/tows.js';
import { getTowPaperDraft } from '../services/towPaperDrafts.js';
import { generateTowPermitPdf, towPermitFilename } from '../services/towPermit.js';
import { writeAudit } from '../services/audit.js';

export const router = express.Router();
router.post('/', async (req, res) => {
  const scope = req.body?.scope || 'history';
  const archiveFilename = paperArchiveFilename(scope);
  if (!['history', 'active'].includes(scope)) return res.status(400).json({ error: 'Invalid paper export scope.' });
  if (scope === 'active' && req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required.' });
  const activeTows = scope === 'active' ? listTows({ status: 'active' }) : null;
  if (activeTows && !activeTows.length) return res.status(400).json({ error: 'There are no active tow papers to export.' });
  if (activeTows && activeTows.length > maxPaperExportTows) return res.status(400).json({ error: `Active paper export is limited to ${maxPaperExportTows} tows.` });
  const ids = activeTows ? activeTows.map(tow => tow.id) : req.body?.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > maxPaperExportTows || ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: `Select between 1 and ${maxPaperExportTows} distinct tows.` });
  }
  const tows = activeTows || ids.map(getTow);
  if (tows.some(tow => !tow || tow.deletedAt)) return res.status(404).json({ error: 'A selected tow no longer exists. Refresh History and select again.' });
  if (scope === 'history' && tows.some(tow => tow.status !== 'completed')) return res.status(400).json({ error: 'Only completed tows can be downloaded from History.' });
  const papers = tows.map(tow => ({ tow, state: getTowPaperDraft(tow.id).state }));
  let temporary, archive, cancelled = false;
  res.once('close', () => {
    if (!res.writableFinished) { cancelled = true; archive?.abort(); }
  });
  try {
    res.set('Cache-Control', 'private, no-store');
    if (papers.length === 1) {
      const { tow, state } = papers[0];
      const pdf = await generateTowPermitPdf(tow, { state });
      if (cancelled) return;
      writeAudit(req.user, 'tow.paper_export', { entityType: 'tow', entityId: tow.id, details: { ids, scope, format: 'pdf' } });
      return res.type('pdf').attachment(towPermitFilename(tow)).send(pdf);
    }
    // Prepare every paper before sending headers, so failures never produce a partial ZIP.
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'towteam-paper-export-'));
    let bytes = 0;
    for (const { tow, state } of papers) {
      if (cancelled) return;
      const pdf = await generateTowPermitPdf(tow, { state });
      if (cancelled) return;
      bytes += pdf.length;
      if (bytes > 200 * 1024 * 1024) throw new Error('Download exceeds 200 MB. Select fewer tows.');
      await fs.writeFile(path.join(temporary, `${tow.id}.pdf`), pdf, { mode: 0o600 });
    }
    archive = new ZipArchive({ store: true });
    const names = new Set();
    for (const { tow } of papers) {
      const base = towPermitFilename(tow);
      let name = base;
      let collision = 0;
      while (names.has(name)) {
        name = `${base.slice(0, -4)}-tow-${tow.id}${collision ? `-${collision}` : ''}.pdf`;
        collision += 1;
      }
      names.add(name);
      archive.file(path.join(temporary, `${tow.id}.pdf`), { name });
    }
    writeAudit(req.user, 'tow.paper_export', { entityType: 'tow', details: { ids, scope, format: 'zip' } });
    res.type('zip').attachment(archiveFilename);
    const sending = pipeline(archive, res);
    await Promise.all([sending, archive.finalize()]);
  } catch (error) {
    if (cancelled || res.destroyed) return;
    if (res.headersSent) { res.destroy(error); return; }
    res.status(500).json({ error: error.message.startsWith('Download exceeds') ? error.message : 'Unable to generate tow papers. Check the private PDF template assets and Python dependencies.' });
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
});
