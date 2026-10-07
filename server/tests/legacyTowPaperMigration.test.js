import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import migrate from '../../migrations/015_preserve_legacy_tow_papers.js';

test('upgrade preserves legacy papers and existing drafts without autofilling future tows', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE tows (id INTEGER PRIMARY KEY, airline TEXT, aircraftType TEXT,
      tailNumber TEXT, driver TEXT, createdAt TEXT, towCompletedAt TEXT, status TEXT, deletedAt TEXT);
      CREATE TABLE towPaperDrafts (towId INTEGER PRIMARY KEY REFERENCES tows(id), state TEXT,
        revision INTEGER, updatedBy INTEGER, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP);`);
    const insert = db.prepare('INSERT INTO tows (airline, aircraftType, tailNumber, driver, createdAt, status, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insert.run('MX','A320','NLEGACY','Legacy Driver','2026-10-01T12:00:00Z','completed',null);
    insert.run('EK','777','ELEGACY','EK Driver','2026-10-01T12:00:00Z','planned',null);
    insert.run('AA','A220','ALEGACY','AA Driver','2026-10-01T12:00:00Z','completed','2026-10-02');
    insert.run('MX','A220','NEDITED','Edited Driver','2026-10-01T12:00:00Z','completed',null);
    const manual = JSON.stringify({ text: { 'Aircraft Reg': 'MANUAL' }, answers: { 0: 'no' }, risk: { 'Tow from': 'red' } });
    db.prepare('INSERT INTO towPaperDrafts (towId,state,revision,updatedBy,updatedAt) VALUES (4,?,7,9,?)').run(manual,'2026-10-03');
    db.transaction(() => migrate(db))();
    const get = (id) => JSON.parse(db.prepare('SELECT state FROM towPaperDrafts WHERE towId = ?').get(id).state);
    const mx = get(1);
    assert.equal(mx.text['Aircraft Reg'],'NLEGACY'); assert.equal(mx.text['Tractor Driver'],'Legacy Driver');
    assert.equal(mx.text.Date,'10/01/26'); assert.equal(mx.text.undefined_11,'N/A');
    assert.equal(mx.text.undefined_44,'N/A - No bypass pin');
    assert.equal(Object.keys(mx.answers).length,25);
    assert.equal(mx.answers[5],'no'); assert.equal(mx.answers[14],'no'); assert.equal(mx.answers[23],'no');
    assert.equal(mx.answers[0],'yes');
    assert.deepEqual(mx.risk,{'Tow from':'green','Tow to':'green','Final agreed status':'green'});
    assert.equal(get(2).answers[5],'yes'); assert.equal(get(2).answers[23],'no');
    assert.equal(get(2).text.undefined_44,'Bypass pin left in');
    assert.equal(get(3).answers[5],'yes'); assert.equal(get(3).answers[23],'yes');
    assert.deepEqual(db.prepare('SELECT state,revision,updatedBy,updatedAt FROM towPaperDrafts WHERE towId = 4').get(),
      {state:manual,revision:7,updatedBy:9,updatedAt:'2026-10-03'});
    db.transaction(() => migrate(db))();
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM towPaperDrafts').get().count,4);
    insert.run('MX','A220','NNEW','New Driver','2026-10-06T12:00:00Z','planned',null);
    assert.equal(db.prepare('SELECT state FROM towPaperDrafts WHERE towId = 5').get(),undefined);
  } finally { db.close(); }
});
