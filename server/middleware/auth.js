import { getUserForToken, parseCookie, sessionCookieName } from "../services/users.js";

const publicApiPaths = new Set(["/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/me"]);

export function requireAuth(req, res, next) {
  if (!req.path.startsWith("/api") || publicApiPaths.has(req.path)) {
    next();
    return;
  }

  const token = parseCookie(req.get("cookie"), sessionCookieName());
  const user = getUserForToken(token);
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admin role required." });
    return;
  }
  next();
}
