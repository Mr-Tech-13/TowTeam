import express from "express";
import { hasKnownTowSpot, parseTowPlan } from "../services/parser.js";
import { createTow, deleteTow, getTow, listTows, logStep, updateTow } from "../services/tows.js";

export const router = express.Router();

const exportColumns = [
  ["id", "ID"],
  ["airline", "Airline"],
  ["inboundFlightNumber", "Flight"],
  ["inboundStation", "From Station"],
  ["eta", "ETA"],
  ["gate", "Gate"],
  ["fromLocation", "From Location"],
  ["toLocation", "To Location"],
  ["towSpot", "Tow Spot"],
  ["tailNumber", "Tail Number"],
  ["driver", "Tow Conductor"],
  ["leftWingWalker", "LWW"],
  ["rightWingWalker", "RWW"],
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
  res.json({ candidates: parseTowPlan(req.body.text || "", { onlyKnownTowSpots: true }) });
});

router.post("/", (req, res) => {
  if (!req.body.inboundFlightNumber) {
    res.status(400).json({ error: "Inbound flight number is required." });
    return;
  }
  res.status(201).json(createTow(req.body));
});

router.post("/bulk", (req, res) => {
  const items = Array.isArray(req.body.tows) ? req.body.tows.filter(hasKnownTowSpot) : [];
  res.status(201).json(items.map(createTow));
});

router.get("/:id", (req, res) => {
  const tow = getTow(req.params.id);
  if (!tow) res.status(404).json({ error: "Tow not found." });
  else res.json(tow);
});

router.put("/:id", (req, res) => {
  const tow = updateTow(req.params.id, req.body);
  if (!tow) res.status(404).json({ error: "Tow not found." });
  else res.json(tow);
});

router.post("/:id/steps/:step", (req, res) => {
  try {
    const tow = logStep(req.params.id, req.params.step, req.body.timestamp, req.body.force);
    if (!tow) res.status(404).json({ error: "Tow not found." });
    else res.json(tow);
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

router.delete("/:id", (req, res) => {
  if (!deleteTow(req.params.id)) res.status(404).json({ error: "Tow not found." });
  else res.status(204).end();
});
