import "./db/migrate.js";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
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

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(optionalLocalAuth);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/tows", towRoutes);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(rootDir, "dist")));
  app.get("*", (_req, res) => res.sendFile(path.join(rootDir, "dist", "index.html")));
}

app.listen(port, host, () => {
  console.log(`TowTeam listening on http://${host}:${port}`);
});
