import assert from 'node:assert/strict';
import test from 'node:test';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { createTow, updateTow, updateAircraftTypeForTows, logStep, undoLastStep } from '../services/tows.js';
import { getTowPaperDraft, saveTowPaperDraft } from '../services/towPaperDrafts.js';
import { createUser } from '../services/users.js';

test('tow edits sync changed paper details, preserve answers, and reject stale editor saves', () => {
  const user = createUser({ username: `paper-sync-${Date.now()}`, password: 'test-only' });
  const tow = createTow({ airline: 'MX', aircraftType: 'A220', tailNumber: 'NSYNC', gate: 'Gate 1', towSpot: 'NL614', driver: 'Original Driver' });
  try {
    const state = getTowPaperDraft(tow.id).state;
    state.text['Aircraft Reg'] = 'MANUAL REG';
    state.text.undefined_11 = 'Manual comment';
    state.text['Full Name'] = 'Tester';
    state.answers[5] = 'no'; state.risk['Tow from'] = 'amber';
    const original = saveTowPaperDraft(tow.id, { state, revision: 0 }, user.id);
    updateTow(tow.id, { aircraftType: 'A320', driver: 'New Driver', leftWingWalker: 'Left', rightWingWalker: 'Right', otherTeamMembers: 'Team', gate: 'Gate 2', towSpot: 'NL615' });
    let draft = getTowPaperDraft(tow.id);
    assert.equal(draft.revision,original.revision + 1);
    for (const [field,value] of Object.entries({ 'Aircraft Type':'A320','Tractor Driver':'New Driver','Headset Operator':'New Driver','Wing Walker LH':'Left','Wing Walker RH':'Right','Other team':'Team','Tow from':'Gate 2','Tow to':'NL615','Aircraft Reg':'MANUAL REG','Full Name':'Tester',undefined_11:'Manual comment' })) {
      assert.equal(draft.state.text[field],value);
    }
    assert.deepEqual(draft.state.answers,state.answers); assert.deepEqual(draft.state.risk,state.risk);
    assert.throws(() => saveTowPaperDraft(tow.id, { state, revision: original.revision }, user.id), error => error.status === 409);
    updateTow(tow.id, { notes: 'Not a paper field', aircraftType: 'A320' });
    assert.equal(getTowPaperDraft(tow.id).revision,draft.revision);
    updateTow(tow.id, { driver: '', tailNumber: 'NSYNCNEW', airline: 'EK', status: 'completed' });
    draft = getTowPaperDraft(tow.id);
    assert.equal(draft.state.text['Tractor Driver'],''); assert.equal(draft.state.text['Headset Operator'],'');
    assert.equal(draft.state.text['Aircraft Reg'],'NSYNCNEW'); assert.equal(draft.state.text.Airline,'EK');
    updateAircraftTypeForTows({ tailNumber:'NSYNCNEW', status:'completed' }, '777');
    draft = getTowPaperDraft(tow.id); assert.equal(draft.state.text['Aircraft Type'],'777');
    logStep(tow.id,'towStartedAt','2026-10-06T14:00:00Z');
    draft = getTowPaperDraft(tow.id); assert.equal(draft.state.text['Start Time'],'10:00');
    logStep(tow.id,'towCompletedAt','2026-10-06T15:00:00Z');
    draft = getTowPaperDraft(tow.id); assert.equal(draft.state.text['Finish Time'],'11:00');
    undoLastStep(tow.id);
    draft = getTowPaperDraft(tow.id); assert.equal(draft.state.text['Finish Time'],'');
    assert.deepEqual(draft.state.answers,state.answers); assert.deepEqual(draft.state.risk,state.risk);
  } finally {
    db.prepare('DELETE FROM tows WHERE id = ?').run(tow.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  }
});
