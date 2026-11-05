import assert from 'node:assert/strict';
import test from 'node:test';
import '../db/migrate.js';
import { db } from '../db/database.js';
import { deleteCrewMember, listCrewMembers, rememberCrewMember, setCrewFavorite } from '../services/crewMembers.js';
import { createUser, getUserPreferences, updateUserPreferences } from '../services/users.js';
import { listAuditLogsPage, writeAudit } from '../services/audit.js';

test('user appearance preferences and crew recents remain user-scoped', () => {
  const user = createUser({ username: `preference-user-${Date.now()}`, password: 'test-only' });
  try {
    assert.equal(getUserPreferences(user.id).theme, 'system');
    const preferences = updateUserPreferences(user.id, { theme: 'contrast', language: 'es' });
    assert.equal(preferences.theme, 'contrast');
    assert.equal(preferences.language, 'es');
    assert.ok(preferences.updatedAt);
    assert.equal(updateUserPreferences(user.id, { language: 'pl' }).language, 'pl');
    assert.equal(updateUserPreferences(user.id, { language: 'ar-EG' }).language, 'ar-EG');
    let members = rememberCrewMember(user.id, 'driver', 'Maxx', true);
    assert.equal(members[0].name, 'Maxx');
    assert.equal(members[0].favorite, true);
    members = rememberCrewMember(user.id, 'driver', 'Maxx');
    assert.equal(members[0].usageCount, 2);
    assert.equal(setCrewFavorite(user.id, members[0].id, false), true);
    assert.equal(listCrewMembers(user.id, 'driver')[0].favorite, false);
    assert.equal(deleteCrewMember(user.id, members[0].id), true);
    assert.deepEqual(listCrewMembers(user.id, 'driver'), []);
  } finally {
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  }
});

test('audit pagination defaults to ten and reports totals', () => {
  const entityId = `pagination-${Date.now()}`;
  try {
    for (let index = 0; index < 13; index += 1) writeAudit(null, 'test.pagination', { entityType: 'test', entityId, details: { index } });
    const first = listAuditLogsPage(1, 10);
    assert.equal(first.pageSize, 10);
    assert.equal(first.logs.length, 10);
    assert.ok(first.total >= 13);
    const second = listAuditLogsPage(2, 10);
    assert.ok(second.logs.length >= 3);
  } finally {
    db.prepare("DELETE FROM auditLogs WHERE action = 'test.pagination' AND entityId = ?").run(entityId);
  }
});
