import { db } from '../db/database.js';

export function listAirlines() {
  return db.prepare('SELECT code, name, color FROM airlines ORDER BY code').all();
}

function airlineValues(input) {
  const code = String(input.code || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const color = String(input.color || '#60a5fa').trim();
  if (!/^[A-Z0-9]{2,3}$/.test(code)) throw new Error('Airline code must be 2 or 3 letters or numbers.');
  if (name.length > 80) throw new Error('Airline name must be 80 characters or fewer.');
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a valid airline color.');
  return { code, name, color };
}

export function createAirline(input) {
  const airline = airlineValues(input);
  if (db.prepare('SELECT code FROM airlines WHERE code = ?').get(airline.code)) {
    throw new Error('That airline code already exists.');
  }
  db.prepare('INSERT INTO airlines (code, name, color) VALUES (@code, @name, @color)').run(airline);
  return airline;
}

export function updateAirline(code, input) {
  const airline = airlineValues({ ...input, code });
  const result = db.prepare('UPDATE airlines SET name = @name, color = @color WHERE code = @code').run(airline);
  return result.changes ? airline : null;
}

export function deleteAirline(code) {
  return db.prepare('DELETE FROM airlines WHERE code = ?').run(code).changes > 0;
}
