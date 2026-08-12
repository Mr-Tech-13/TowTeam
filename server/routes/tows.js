import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";
import { hasKnownTowSpot, parseTowPlan } from "../services/parser.js";
import { generateTowPermitPdf, towPermitFilename } from "../services/towPermit.js";
import {
  createTow,
  getTow,
  listTows,
  logStep,
  permanentlyDeleteTow,
  restoreTow,
  softDeleteTow,
  undoLastStep,
  updateAircraftTypeForTows,
  updateTow
} from "../services/tows.js";

export const router = express.Router();

const exportColumns = [
  ["id", "ID"],
  ["airline", "Airline"],
  ["inboundFlightNumber", "Flight"],
  ["aircraftType", "Aircraft Type"],
  ["eta", "ETA"],
  ["gate", "Tow From"],
  ["fromLocation", "From Location"],
  ["toLocation", "To Location"],
  ["towSpot", "Tow To"],
  ["tailNumber", "Aircraft Reg"],
  ["driver", "Tractor Driver"],
  ["leftWingWalker", "Wing Walker LH"],
  ["rightWingWalker", "Wing Walker RH"],
  ["otherTeamMembers", "Other Team"],
  ["status", "Status"],
  ["needsReview", "Needs Review"],
  ["setupStartedAt", "Setup Started"],
  ["goaaCalledAt", "GOAA Called"],
  ["goaaArrivalAt", "GOAA Arrival"],
  ["pushStartedAt", "Push Started"],
  ["towStartedAt", "Tow Started"],
  ["towCompletedAt", "Tow Completed"],
  ["towPaperCompletedAt", "Tow Paper Complete"],
  ["createdAt", "Created"]
];

function safeSpreadsheetText(value) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function escapeCsv(value) {
  return `"${safeSpreadsheetText(value).replaceAll("\"", "\"\"")}"`;
}

function escapeHtml(value) {
  return safeSpreadsheetText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function diagnosticMessage(error) {
  return String(error?.message || "")
    .replaceAll(process.cwd(), "<app>")
    .slice(0, 500);
}

function auditTowDetails(tow) {
  if (!tow) return null;
  return {
    airline: tow.airline,
    inboundFlightNumber: tow.inboundFlightNumber,
    aircraftType: tow.aircraftType,
    gate: tow.gate,
    towSpot: tow.towSpot,
    tailNumber: tow.tailNumber,
    status: tow.status,
    towCompletedAt: tow.towCompletedAt,
    towPaperCompletedAt: tow.towPaperCompletedAt,
    deletedAt: tow.deletedAt
  };
}

router.get("/", (req, res) => {
  res.json(listTows(req.query));
});

router.get("/export.csv", (req, res) => {
  const rows = listTows(req.query);
  const csv = [
    exportColumns.map(([_field, label]) => escapeCsv(label)).join(","),
    ...rows.map((row) => exportColumns.map(([field]) => escapeCsv(row[field])).join(","))
  ].join("\n");
  res.header("Content-Type", "text/csv");
  res.attachment("tow-history.csv");
  res.send(csv);
});

router.get("/export.xls", (req, res) => {
  const rows = listTows(req.query);
  const title = "TowTeam History Export";
  const header = exportColumns.map(([_field, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${exportColumns.map(([field]) => `<td style="mso-number-format:'\\@';">${escapeHtml(row[field])}</td>`).join("")}</tr>`)
    .join("");
  const workbook = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; }
    th { background: #1f2937; color: #ffffff; font-weight: bold; }
    th, td { border: 1px solid #94a3b8; padding: 6px 8px; white-space: nowrap; }
  </style>
</head>
<body>
  <table>
    <caption>${escapeHtml(title)}</caption>
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
  res.header("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.attachment("tow-history.xls");
  res.send(workbook);
});

router.post("/parse", (req, res) => {
  const allCandidates = parseTowPlan(req.body.text || "");
  const candidates = allCandidates.filter(hasKnownTowSpot);
  res.json({ candidates, ignoredCount: allCandidates.length - candidates.length, totalParsed: allCandidates.length });
});

router.post("/", (req, res) => {
  if (!req.body.inboundFlightNumber) {
    res.status(400).json({ error: "Inbound flight number is required." });
    return;
  }
  const tow = createTow(req.body);
  writeAudit(req.user, "tow.create", { entityType: "tow", entityId: tow.id, details: { flight: `${tow.airline}${tow.inboundFlightNumber}` } });
  res.status(201).json(tow);
});

router.post("/bulk", (req, res) => {
  const items = Array.isArray(req.body.tows) ? req.body.tows.filter(hasKnownTowSpot) : [];
  const tows = items.map(createTow);
  writeAudit(req.user, "tow.bulk_create", { entityType: "tow", details: { count: tows.length } });
  res.status(201).json(tows);
});

router.patch("/bulk/aircraft-type", (req, res) => {
  try {
    const result = updateAircraftTypeForTows(req.body.filters || {}, req.body.aircraftType);
    writeAudit(req.user, "tow.bulk_aircraft_type", { entityType: "tow", details: result });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/:id", (req, res) => {
  const tow = getTow(req.params.id);
  if (!tow) res.status(404).json({ error: "Tow not found." });
  else res.json(tow);
});

router.get("/:id/tow-checklist.pdf", async (req, res) => {
  const tow = getTow(req.params.id);
  if (!tow) {
    res.status(404).json({ error: "Tow not found." });
    return;
  }

  try {
    const pdf = await generateTowPermitPdf(tow);
    const filename = towPermitFilename(tow);
    res.header("Content-Type", "application/pdf");
    if (req.query.preview === "true") {
      res.header("Content-Disposition", `inline; filename="${filename}"`);
    } else {
      res.attachment(filename);
    }
    res.send(Buffer.from(pdf));
  } catch (error) {
    console.error("Tow checklist PDF generation failed:", error.message);
    if (error.code === "ENOENT") {
      res.status(404).json({ error: "Tow checklist template not found. Add TowPermit.pdf to data/ or set TOW_PERMIT_TEMPLATE_PATH." });
      return;
    }
    if (error.code === "PYTHON_UNAVAILABLE") {
      res.status(500).json({ error: "Python is not available in the app container. Install python3 or rebuild/recreate the Docker service." });
      return;
    }
    if (error.code === "PYTHON_MODULE_MISSING") {
      res.status(500).json({ error: "PDF Python dependencies are missing. Install pypdf and reportlab in the app container or recreate the Docker service." });
      return;
    }
    res.status(500).json({ error: "Unable to generate tow checklist PDF.", details: diagnosticMessage(error) });
  }
});

router.put("/:id", (req, res) => {
  const before = getTow(req.params.id);
  const tow = updateTow(req.params.id, req.body);
  if (!tow) res.status(404).json({ error: "Tow not found." });
  else {
    writeAudit(req.user, "tow.update", { entityType: "tow", entityId: tow.id, details: { before: auditTowDetails(before), after: auditTowDetails(tow) } });
    res.json(tow);
  }
});

router.post("/:id/steps/undo", (req, res) => {
  try {
    const result = undoLastStep(req.params.id);
    if (!result) res.status(404).json({ error: "Tow not found." });
    else {
      writeAudit(req.user, "tow.undo_step", { entityType: "tow", entityId: req.params.id, details: { step: result.undoneStep } });
      res.json(result.tow);
    }
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

router.post("/:id/steps/:step", (req, res) => {
  try {
    const tow = logStep(req.params.id, req.params.step, req.body.timestamp, req.body.force);
    if (!tow) res.status(404).json({ error: "Tow not found." });
    else {
      writeAudit(req.user, "tow.step", { entityType: "tow", entityId: tow.id, details: { step: req.params.step } });
      res.json(tow);
    }
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

router.delete("/:id", (req, res) => {
  const result = softDeleteTow(req.params.id, req.user, req.body?.reason);
  if (!result) {
    res.status(404).json({ error: "Tow not found." });
    return;
  }
  writeAudit(req.user, "tow.soft_delete", {
    entityType: "tow",
    entityId: req.params.id,
    details: { before: auditTowDetails(result.before), after: auditTowDetails(result.after) }
  });
  res.status(204).end();
});

router.post("/:id/restore", requireAdmin, (req, res) => {
  const result = restoreTow(req.params.id);
  if (!result) {
    res.status(404).json({ error: "Deleted tow not found." });
    return;
  }
  writeAudit(req.user, "tow.restore", {
    entityType: "tow",
    entityId: req.params.id,
    details: { before: auditTowDetails(result.before), after: auditTowDetails(result.after) }
  });
  res.json(result.after);
});

router.delete("/:id/permanent", requireAdmin, (req, res) => {
  const deleted = permanentlyDeleteTow(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Deleted tow not found." });
    return;
  }
  writeAudit(req.user, "tow.permanent_delete", {
    entityType: "tow",
    entityId: req.params.id,
    details: { deleted: auditTowDetails(deleted) }
  });
  res.status(204).end();
});
