import express from "express";
import { requireAutofillManager } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";
import { activatePreparedRestore, backupFilename, createDatabaseBackup, createPortableExport, importPortableExport, prepareDatabaseRestore } from "../services/maintenance.js";
import { checkForUpdates, installUpdate, restartForUpdate } from "../services/updates.js";

export const router = express.Router();

router.use(requireAutofillManager);

router.get("/updates", async (_req, res) => {
  try {
    res.json(await checkForUpdates());
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to check for updates." });
  }
});

router.post("/updates/install", async (req, res) => {
  try {
    const status = await checkForUpdates();
    const preUpdateBackup = status.canUpdate ? backupFilename(await createDatabaseBackup("pre-update")) : null;
    const result = { ...await installUpdate(), preUpdateBackup };
    writeAudit(req.user, "maintenance.update", { entityType: "application", details: result });
    if (result.restartRequired) res.once("finish", restartForUpdate);
    res.json(result);
  } catch (error) {
    res.status(409).json({ error: error.message || "Unable to install the update." });
  }
});

router.get("/backup.sqlite", async (req, res) => {
  try {
    const backupPath = await createDatabaseBackup("download");
    writeAudit(req.user, "maintenance.backup", { entityType: "database", details: { filename: backupFilename(backupPath) } });
    res.download(backupPath, backupFilename(backupPath));
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to create backup." });
  }
});

router.get("/export.json", (req, res) => {
  try {
    const categories = String(req.query.categories || "tows").split(",").filter(Boolean);
    const payload = createPortableExport(categories);
    const filename = `towteam-export-${nowDateSlug()}.json`;
    writeAudit(req.user, "maintenance.portable_export", { entityType: "database", details: { categories: payload.categories, filename } });
    res.set({
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    });
    res.send(JSON.stringify(payload));
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to export selected data." });
  }
});

router.post("/import.json", express.raw({ type: "application/octet-stream", limit: "200mb" }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Upload a valid TowTeam export file." });
      return;
    }
    const categories = String(req.query.categories || "").split(",").filter(Boolean);
    const mode = String(req.query.mode || "merge");
    const result = await importPortableExport(Buffer.from(req.body), categories, mode);
    writeAudit(req.user, "maintenance.portable_import", { entityType: "database", details: result });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to import selected data." });
  }
});

router.post("/restore.sqlite", express.raw({ type: "application/octet-stream", limit: "200mb" }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Upload a valid SQLite backup file." });
      return;
    }
    const restoreBuffer = Buffer.from(req.body);
    const result = await prepareDatabaseRestore(restoreBuffer);
    writeAudit(req.user, "maintenance.restore", { entityType: "database", details: { preRestoreBackup: result.preRestoreBackup } });
    res.json({ restored: true, preRestoreBackup: result.preRestoreBackup, restartRequired: true });
    res.on("finish", () => {
      setTimeout(() => {
        activatePreparedRestore(result.uploadPath);
        process.exit(0);
      }, 250);
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to restore backup." });
  }
});

function nowDateSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
