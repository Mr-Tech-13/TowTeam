import { db, nowIso } from '../db/database.js';

const roles = new Set(['driver', 'headset']);

function validate(role, name) {
  if (!roles.has(role)) throw new Error('Crew role must be driver or headset.');
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean || clean.length > 80) throw new Error('Crew member name must be between 1 and 80 characters.');
  return clean;
}

export function listCrewMembers(userId, role) {
  if (!roles.has(role)) throw new Error('Crew role must be driver or headset.');
  return db.prepare(`SELECT id, crewRole, name, favorite, usageCount, lastUsedAt
    FROM userCrewMembers WHERE userId = ? AND crewRole = ?
    ORDER BY favorite DESC, lastUsedAt DESC LIMIT 20`).all(userId, role).map((row) => ({ ...row, favorite: Boolean(row.favorite) }));
}

export function rememberCrewMember(userId, role, name, favorite) {
  const clean = validate(role, name);
  if (favorite !== undefined && typeof favorite !== 'boolean') throw new Error('Favorite must be true or false.');
  const timestamp = nowIso();
  db.prepare(`INSERT INTO userCrewMembers (userId, crewRole, name, favorite, usageCount, lastUsedAt)
    VALUES (@userId, @role, @name, @favorite, 1, @timestamp)
    ON CONFLICT(userId, crewRole, name) DO UPDATE SET
      favorite = CASE WHEN @hasFavorite = 1 THEN @favorite ELSE userCrewMembers.favorite END,
      usageCount = userCrewMembers.usageCount + 1,
      lastUsedAt = excluded.lastUsedAt`).run({
        userId, role, name: clean, timestamp,
        hasFavorite: Number(favorite !== undefined),
        favorite: Number(Boolean(favorite))
      });
  return listCrewMembers(userId, role);
}

export function setCrewFavorite(userId, id, favorite) {
  if (typeof favorite !== 'boolean') throw new Error('Favorite must be true or false.');
  const result = db.prepare('UPDATE userCrewMembers SET favorite = ? WHERE id = ? AND userId = ?').run(Number(favorite), id, userId);
  return result.changes > 0;
}

export function deleteCrewMember(userId, id) {
  return db.prepare('DELETE FROM userCrewMembers WHERE id = ? AND userId = ?').run(id, userId).changes > 0;
}
