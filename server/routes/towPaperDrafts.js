import express from 'express';
import { getTow } from '../services/tows.js';
import { getTowPaperDraft, saveTowPaperDraft } from '../services/towPaperDrafts.js';
import { writeAudit } from '../services/audit.js';
import { autofillChecklist } from '../services/towPaperAutofill.js';

export const router = express.Router({ mergeParams: true });
router.use((req, res, next) => {
  const tow = getTow(req.params.id);
  if (!tow || tow.deletedAt) return res.status(404).json({ error: 'Tow not found.' });
  res.set('Cache-Control', 'private, no-store');
  next();
});
router.get('/', (req, res) => res.json(getTowPaperDraft(req.params.id)));
router.post('/autofill', (req, res) => {
  if (!req.user.autofill) return res.status(403).json({ error: 'Autofill permission required.' });
  try {
    const current = getTowPaperDraft(req.params.id);
    const state = autofillChecklist(getTow(req.params.id), current.state);
    const draft = saveTowPaperDraft(req.params.id, { state, revision: req.body.revision }, req.user.id);
    writeAudit(req.user, 'tow.paper_autofill', { entityType: 'tow', entityId: req.params.id, details: { revision: draft.revision } });
    res.json(draft);
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});
router.put('/', (req, res) => {
  try {
    const draft = saveTowPaperDraft(req.params.id, req.body, req.user.id);
    writeAudit(req.user, 'tow.paper_draft_save', { entityType: 'tow', entityId: req.params.id, details: { revision: draft.revision } });
    res.json(draft);
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});
