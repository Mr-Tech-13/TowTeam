const stores = new Map();

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function rateLimit({ windowMs, max, keyPrefix = "global" }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${clientKey(req)}`;
    const entry = stores.get(key);

    if (!entry || entry.resetAt <= now) {
      stores.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }

    next();
  };
}

export const apiRateLimit = rateLimit({
  windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.API_RATE_LIMIT_MAX || 300),
  keyPrefix: "api"
});

export const loginRateLimit = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60_000),
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 20),
  keyPrefix: "login"
});

export const issueRateLimit = rateLimit({
  windowMs: Number(process.env.ISSUE_RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.ISSUE_RATE_LIMIT_MAX || 10),
  keyPrefix: "issue"
});
