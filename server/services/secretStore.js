import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dbPath } from '../db/database.js';

const keyPath = path.join(path.dirname(dbPath), 'node-secret.key');

function encryptionKey() {
  const configured = process.env.TOWTEAM_SECRET_KEY;
  if (configured) return crypto.createHash('sha256').update(configured).digest();
  try {
    const current = fs.readFileSync(keyPath);
    if (current.length === 32) return current;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyPath, key, { mode: 0o600, flag: 'wx' });
  return key;
}

export function encryptSecret(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(value) {
  if (!value) return '';
  const [version, iv, tag, encrypted] = String(value).split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Stored secret cannot be decrypted. Re-enter the destination password.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
