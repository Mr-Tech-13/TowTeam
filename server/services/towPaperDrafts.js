import { db, nowIso } from '../db/database.js';
import { towPaperDetails } from './towPermit.js';

export function getTowPaperDraft(towId) {
  const row = db.prepare('SELECT state, revision, updatedAt FROM towPaperDrafts WHERE towId = ?').get(towId);
  const draft = row ? { ...row, state: JSON.parse(row.state) } : { state: null, revision: 0, updatedAt: null };
  const tow = db.prepare('SELECT * FROM tows WHERE id = ?').get(towId);
  if (!tow) return draft;
  draft.state = {
    text: { ...towPaperDetails(tow), ...(draft.state?.text || {}) },
    answers: draft.state?.answers || {},
    risk: draft.state?.risk || {}
  };
  return draft;
}

export function syncTowPaperDraftDetails(before, after) {
  const previous = towPaperDetails(before);
  const next = towPaperDetails(after);
  const changes = Object.entries(next).filter(([field, value]) => value !== previous[field]);
  if (!changes.length) return;
  const row = db.prepare('SELECT state FROM towPaperDrafts WHERE towId = ?').get(after.id);
  if (!row) return;
  const state = JSON.parse(row.state);
  state.text = { ...state.text, ...Object.fromEntries(changes) };
  db.prepare('UPDATE towPaperDrafts SET state = ?, revision = revision + 1, updatedAt = ? WHERE towId = ?')
    .run(JSON.stringify(state), nowIso(), after.id);
}

function validateState(state) {
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(state) || !object(state.text) || !object(state.answers) || !object(state.risk)) throw new Error('Invalid paper draft.');
  const text = Object.entries(state.text);
  if (text.length > 60 || text.some(([key,value]) => key.length > 100 || typeof value !== 'string' || value.length > 150)) throw new Error('Invalid paper fields.');
  if (Object.entries(state.answers).some(([key,value]) => !/^(?:[0-9]|1[0-9]|2[0-4])$/.test(key) || !['yes','no',''].includes(value))) throw new Error('Invalid checklist response.');
  if (Object.entries(state.risk).some(([key,value]) => !['Tow from','Tow to','Final agreed status'].includes(key) || !['red','amber','green',''].includes(value))) throw new Error('Invalid risk selection.');
  return { text: state.text, answers: state.answers, risk: state.risk };
}

export function saveTowPaperDraft(towId, input, userId) {
  if (!Number.isSafeInteger(input?.revision) || input.revision < 0) throw new Error('Invalid draft revision.');
  const state = JSON.stringify(validateState(input.state));
  return db.transaction(() => {
    const current = getTowPaperDraft(towId);
    if (current.revision !== input.revision) {
      const error = new Error('Another user updated this paper. Reload the saved draft before saving your changes.');
      error.status = 409;
      throw error;
    }
    db.prepare(`INSERT INTO towPaperDrafts (towId, state, revision, updatedBy, updatedAt)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(towId) DO UPDATE SET
      state = excluded.state, revision = excluded.revision, updatedBy = excluded.updatedBy, updatedAt = excluded.updatedAt`)
      .run(towId, state, current.revision + 1, userId, nowIso());
    return getTowPaperDraft(towId);
  })();
}
