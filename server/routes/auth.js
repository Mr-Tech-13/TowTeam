import express from "express";
import rateLimit from "express-rate-limit";
import {
  authenticate,
  clearSessionCookie,
  createSession,
  deleteSession,
  getUserForToken,
  parseCookie,
  sessionCookie,
  sessionCookieName
} from "../services/users.js";

export const router = express.Router();
const loginRateLimit = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60_000),
  limit: Number(process.env.LOGIN_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." }
});

router.post("/login", loginRateLimit, (req, res) => {
  const user = authenticate(req.body.username, req.body.password);
  if (!user) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }
  const session = createSession(user.id);
  res.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt));
  res.json({ user });
});

router.post("/logout", (req, res) => {
  const token = parseCookie(req.get("cookie"), sessionCookieName());
  deleteSession(token);
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.status(204).end();
});

router.get("/me", (req, res) => {
  const token = parseCookie(req.get("cookie"), sessionCookieName());
  const user = getUserForToken(token);
  res.json({ user });
});
