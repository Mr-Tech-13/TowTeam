import crypto from "node:crypto";
import { db, nowIso } from "../db/database.js";

const SESSION_COOKIE = "towteam_session";
const SESSION_DAYS = 14;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, storedHash) {
  const [scheme, saltHex, hashHex] = String(storedHash || "").split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function ensureDefaultAdmin() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) return;
  const username = process.env.ADMIN_USERNAME || process.env.LOCAL_AUTH_USERNAME || "admin";
  const configuredPassword = process.env.ADMIN_PASSWORD || process.env.LOCAL_AUTH_PASSWORD || "";
  const password = ["", "admin", "change-me", "change-me-now"].includes(configuredPassword)
    ? crypto.randomBytes(12).toString("base64url")
    : configuredPassword;
  db.prepare("INSERT INTO users (username, passwordHash, role) VALUES (?, ?, 'admin')").run(username, hashPassword(password));
  console.warn(`Created default admin user '${username}' with password '${password}'. Change it after first login.`);
}

export function listUsers() {
  return db.prepare("SELECT id, username, role, createdAt, updatedAt FROM users ORDER BY username").all().map(publicUser);
}

export function getUserById(id) {
  return publicUser(db.prepare("SELECT id, username, role, createdAt, updatedAt FROM users WHERE id = ?").get(id));
}

export function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE lower(username) = lower(?)").get(username);
}

export function createUser({ username, password, role = "user" }) {
  if (!username || !password) throw new Error("Username and password are required.");
  if (!["admin", "user"].includes(role)) throw new Error("Invalid role.");
  const result = db
    .prepare("INSERT INTO users (username, passwordHash, role) VALUES (@username, @passwordHash, @role)")
    .run({ username: username.trim(), passwordHash: hashPassword(password), role });
  return getUserById(result.lastInsertRowid);
}

export function updateUser(id, { username, role }) {
  const existing = getUserById(id);
  if (!existing) return null;
  const next = {
    id,
    username: username?.trim() || existing.username,
    role: role || existing.role,
    updatedAt: nowIso()
  };
  if (!["admin", "user"].includes(next.role)) throw new Error("Invalid role.");
  if (existing.role === "admin" && next.role !== "admin" && adminCount() <= 1) {
    throw new Error("At least one admin user is required.");
  }
  db.prepare("UPDATE users SET username = @username, role = @role, updatedAt = @updatedAt WHERE id = @id").run(next);
  return getUserById(id);
}

export function updatePassword(id, password) {
  if (!password) throw new Error("Password is required.");
  db.prepare("UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?").run(hashPassword(password), nowIso(), id);
  return getUserById(id);
}

export function deleteUser(id, currentUserId) {
  const user = getUserById(id);
  if (!user) return false;
  if (Number(id) === Number(currentUserId)) throw new Error("You cannot delete your own account.");
  if (user.username.toLowerCase() === "admin") throw new Error("The admin account cannot be deleted.");
  if (user.role === "admin" && adminCount() <= 1) throw new Error("At least one admin user is required.");
  return db.prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
}

export function authenticate(username, password) {
  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return publicUser(user);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (userId, tokenHash, expiresAt) VALUES (?, ?, ?)").run(userId, hashToken(token), expiresAt);
  return { token, expiresAt };
}

export function getUserForToken(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT users.id, users.username, users.role, users.createdAt, users.updatedAt
       FROM sessions
       JOIN users ON users.id = sessions.userId
       WHERE sessions.tokenHash = ? AND sessions.expiresAt > ?`
    )
    .get(hashToken(token), new Date().toISOString());
  return publicUser(row);
}

export function deleteSession(token) {
  if (!token) return false;
  return db.prepare("DELETE FROM sessions WHERE tokenHash = ?").run(hashToken(token)).changes > 0;
}

export function deleteExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expiresAt <= ?").run(new Date().toISOString());
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function sessionCookie(token, expiresAt) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Expires=${new Date(expiresAt).toUTCString()}`
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function parseCookie(header, name) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .map((part) => part.split("="))
    .find(([key]) => key === name)?.[1];
}

function adminCount() {
  return db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
}
