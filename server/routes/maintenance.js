import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";
import { activatePreparedRestore, backupFilename, createDatabaseBackup, prepareDatabaseRestore } from "../services/maintenance.js";

export const router = express.Router();

router.use(requireAdmin);

router.get("/backup.sqlite", async (req, res) => {
  try {
    const backupPath = await createDatabaseBackup("download");
    writeAudit(req.user, "maintenance.backup", { entityType: "database", details: { filename: backupFilename(backupPath) } });
    res.download(backupPath, backupFilename(backupPath));
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to create backup." });
  }
});

router.post("/restore.sqlite", express.raw({ type: "application/octet-stream", limit: "200mb" }), async (req, res) => {
  try {
    const result = await prepareDatabaseRestore(req.body);
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
