import express from "express";
import { hasKnownTowSpot, parseTowPlan } from "../services/parser.js";
import { createTow, deleteTow, getTow, listTows, logStep, updateTow } from "../services/tows.js";

export const router = express.Router();

router.get("/", (req, res) => {
  res.json(listTows(req.query));
});

router.get("/export.csv", (req, res) => {
  const rows = listTows(req.query);
  const columns = [
    "id",
    "airline",
    "inboundFlightNumber",
    "inboundStation",
    "eta",
    "gate",
    "fromLocation",
    "toLocation",
    "towSpot",
    "tailNumber",
    "driver",
    "leftWingWalker",
    "rightWingWalker",
    "otherTeamMembers",
    "status",
    "needsReview",
    "towCompletedAt",
    "createdAt"
  ];
  const escape = (value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
  res.header("Content-Type", "text/csv");
  res.attachment("tow-history.csv");
  res.send(csv);
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
