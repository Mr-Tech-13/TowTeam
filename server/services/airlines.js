import { db } from '../db/database.js';

export function listAirlines() {
  return db.prepare('SELECT code, name, color, aircraftTypes FROM airlines ORDER BY code').all()
    .map((airline) => ({ ...airline, aircraftTypes: JSON.parse(airline.aircraftTypes) }));
}

function airlineValues(input) {
  const code = String(input.code || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const color = String(input.color || '#60a5fa').trim();
  if (!/^[A-Z0-9]{2,3}$/.test(code)) throw new Error('Airline code must be 2 or 3 letters or numbers.');
  if (name.length > 80) throw new Error('Airline name must be 80 characters or fewer.');
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a valid airline color.');
  if (input.aircraftTypes !== undefined && (!Array.isArray(input.aircraftTypes) || input.aircraftTypes.length > 100 || input.aircraftTypes.some((type) => typeof type !== 'string' || !type.trim() || type.trim().length > 40))) {
    throw new Error('Aircraft types must be a list of up to 100 names, each 1 to 40 characters.');
  }
  const aircraftTypes = [...new Set((input.aircraftTypes || []).map((type) => type.trim().toUpperCase()))];
  return { code, name, color, aircraftTypes };
}

export function createAirline(input) {
  const airline = airlineValues(input);
  if (db.prepare('SELECT code FROM airlines WHERE code = ?').get(airline.code)) {
    throw new Error('That airline code already exists.');
  }
  db.prepare('INSERT INTO airlines (code, name, color, aircraftTypes) VALUES (@code, @name, @color, @aircraftTypes)').run({ ...airline, aircraftTypes: JSON.stringify(airline.aircraftTypes) });
  return airline;
}

export function updateAirline(code, input) {
  const existing = db.prepare('SELECT aircraftTypes FROM airlines WHERE code = ?').get(code);
  const airline = airlineValues({ aircraftTypes: existing ? JSON.parse(existing.aircraftTypes) : [], ...input, code });
  const result = db.prepare('UPDATE airlines SET name = @name, color = @color, aircraftTypes = @aircraftTypes WHERE code = @code').run({ ...airline, aircraftTypes: JSON.stringify(airline.aircraftTypes) });
  return result.changes ? airline : null;
}

export function deleteAirline(code) {
  return db.prepare('DELETE FROM airlines WHERE code = ?').run(code).changes > 0;
}
