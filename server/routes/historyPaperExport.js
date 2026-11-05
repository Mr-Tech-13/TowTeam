import express from 'express';
import { PDFDocument } from 'pdf-lib';
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
  if (scope === 'active' && !req.user.canManageSettings) return res.status(403).json({ error: 'Super Admin access required.' });
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
  let cancelled = false;
  res.once('close', () => {
    if (!res.writableFinished) cancelled = true;
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
    // Prepare and merge every paper before sending headers, so failures never produce a partial PDF.
    const merged = await PDFDocument.create();
    let bytes = 0;
    for (const { tow, state } of papers) {
      if (cancelled) return;
      const pdf = await generateTowPermitPdf(tow, { state });
      if (cancelled) return;
      bytes += pdf.length;
      if (bytes > 200 * 1024 * 1024) throw new Error('Download exceeds 200 MB. Select fewer tows.');
      const source = await PDFDocument.load(pdf);
      const pages = await merged.copyPages(source, source.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }
    const output = Buffer.from(await merged.save());
    writeAudit(req.user, 'tow.paper_export', { entityType: 'tow', details: { ids, scope, format: 'pdf', merged: true } });
    res.type('pdf').attachment(archiveFilename).send(output);
  } catch (error) {
    if (cancelled || res.destroyed) return;
    if (res.headersSent) { res.destroy(error); return; }
    res.status(500).json({ error: error.message.startsWith('Download exceeds') ? error.message : 'Unable to generate tow papers. Check the private PDF template assets and Python dependencies.' });
  } finally { /* No generated export files are retained on disk. */ }
});
