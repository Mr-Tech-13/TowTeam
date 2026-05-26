import "./db/migrate.js";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optionalLocalAuth } from "./middleware/auth.js";
import { router as towRoutes } from "./routes/tows.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";
const distDir = path.join(rootDir, "dist");
const indexHtml = path.join(distDir, "index.html");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(optionalLocalAuth);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
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
