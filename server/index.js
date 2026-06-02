import "./db/migrate.js";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAuth } from "./middleware/auth.js";
import { router as auditRoutes } from "./routes/audit.js";
import { router as authRoutes } from "./routes/auth.js";
import { router as issueRoutes } from "./routes/issues.js";
import { router as towRoutes } from "./routes/tows.js";
import { router as userRoutes } from "./routes/users.js";
import { deleteExpiredSessions, ensureDefaultAdmin } from "./services/users.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";
const distDir = path.join(rootDir, "dist");
const indexHtml = path.join(distDir, "index.html");
const isProduction = process.env.NODE_ENV === "production";
const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const devCorsOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const apiRateLimit = rateLimit({
  windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000),
  limit: Number(process.env.API_RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." }
});

ensureDefaultAdmin();
deleteExpiredSessions();

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    const allowedOrigins = isProduction ? corsOrigins : [...devCorsOrigins, ...corsOrigins];
    callback(null, allowedOrigins.includes(origin));
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(isProduction ? "combined" : "dev"));
app.use("/api", apiRateLimit);
app.use(requireAuth);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/audit", auditRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tows", towRoutes);

if (fs.existsSync(indexHtml)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(indexHtml));
} else {
  app.get("/", (_req, res) => {
    res.status(503).send("TowTeam API is running. Build the web UI with `npm run build`, then run `npm run start`, or use `npm run dev` and open http://localhost:5173.");
  });
}

app.listen(port, host, () => {
  console.log(`TowTeam listening on http://${host}:${port}`);
});
