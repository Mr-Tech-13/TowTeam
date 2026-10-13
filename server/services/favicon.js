import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pngjs from 'pngjs';
import { dbPath } from '../db/database.js';

const { PNG } = pngjs;
const file = path.join(path.dirname(dbPath), 'branding', 'favicon.png');
export const faviconLimit = 256 * 1024;
const blank = new PNG({ width: 32, height: 32 });
blank.data.fill(0);
const defaultIcon = PNG.sync.write(blank);

export function getFavicon() {
  try { return fs.readFileSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function faviconUrl() {
  const image = getFavicon();
  const version = image ? crypto.createHash('sha256').update(image).digest('hex').slice(0, 16) : 'default';
  return `/favicon.png?v=${version}`;
}

export function saveFavicon(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.length > faviconLimit) throw new Error('Upload a PNG file up to 256 KB.');
  if (!buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || buffer.toString('ascii',12,16) !== 'IHDR') throw new Error('The favicon must be a valid PNG image.');
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height || width > 512 || height > 512) throw new Error('The favicon must be no larger than 512 by 512 pixels.');
  let image;
  try { image = PNG.sync.write(PNG.sync.read(buffer)); }
  catch { throw new Error('The favicon must be a valid PNG image.'); }
  if (image.length > faviconLimit) throw new Error('The favicon must be up to 256 KB.');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, image, { mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}

export function resetFavicon() { fs.rmSync(file, { force: true }); }

export function serveFavicon(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.type('png').send(getFavicon() || defaultIcon);
}
