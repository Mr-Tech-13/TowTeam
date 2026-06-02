import { db, nowIso, rowToTow } from "../db/database.js";

const fields = [
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
  "notes",
  "status",
  "needsReview",
  "parserWarnings",
  "setupStartedAt",
  "goaaCalledAt",
  "goaaArrivalAt",
  "pushStartedAt",
  "towStartedAt",
  "towCompletedAt",
  "towPaperCompletedAt"
];

const createTowStatement = db.prepare(
  `INSERT INTO tows (
    airline, inboundFlightNumber, inboundStation, eta, gate, fromLocation, toLocation, towSpot, tailNumber,
    driver, leftWingWalker, rightWingWalker, otherTeamMembers, notes, status, needsReview, parserWarnings,
    setupStartedAt, goaaCalledAt, goaaArrivalAt, pushStartedAt, towStartedAt, towCompletedAt, towPaperCompletedAt
  ) VALUES (
    @airline, @inboundFlightNumber, @inboundStation, @eta, @gate, @fromLocation, @toLocation, @towSpot, @tailNumber,
    @driver, @leftWingWalker, @rightWingWalker, @otherTeamMembers, @notes, @status, @needsReview, @parserWarnings,
    @setupStartedAt, @goaaCalledAt, @goaaArrivalAt, @pushStartedAt, @towStartedAt, @towCompletedAt, @towPaperCompletedAt
  )`
);

const updateTowStatement = db.prepare(
  `UPDATE tows SET
    airline = @airline,
    inboundFlightNumber = @inboundFlightNumber,
    inboundStation = @inboundStation,
    eta = @eta,
    gate = @gate,
    fromLocation = @fromLocation,
    toLocation = @toLocation,
    towSpot = @towSpot,
    tailNumber = @tailNumber,
    driver = @driver,
    leftWingWalker = @leftWingWalker,
    rightWingWalker = @rightWingWalker,
    otherTeamMembers = @otherTeamMembers,
    notes = @notes,
    status = @status,
    needsReview = @needsReview,
    parserWarnings = @parserWarnings,
    setupStartedAt = @setupStartedAt,
    goaaCalledAt = @goaaCalledAt,
    goaaArrivalAt = @goaaArrivalAt,
    pushStartedAt = @pushStartedAt,
    towStartedAt = @towStartedAt,
    towCompletedAt = @towCompletedAt,
    towPaperCompletedAt = @towPaperCompletedAt,
    updatedAt = @updatedAt
  WHERE id = @id`
);

export const workflowSteps = {
  setupStartedAt: "setup_started",
  goaaCalledAt: "goaa_called",
  goaaArrivalAt: "goaa_arrival",
  pushStartedAt: "push_started",
  towStartedAt: "tow_started",
  towCompletedAt: "tow_completed",
  towPaperCompletedAt: "completed"
};

const stepUpdateStatements = {
  setupStartedAt: db.prepare("UPDATE tows SET setupStartedAt = @timestamp, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  goaaCalledAt: db.prepare("UPDATE tows SET goaaCalledAt = @timestamp, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  goaaArrivalAt: db.prepare("UPDATE tows SET goaaArrivalAt = @timestamp, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  pushStartedAt: db.prepare("UPDATE tows SET pushStartedAt = @timestamp, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  towStartedAt: db.prepare("UPDATE tows SET towStartedAt = @timestamp, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  towCompletedAt: db.prepare("UPDATE tows SET towCompletedAt = @timestamp, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  towPaperCompletedAt: db.prepare("UPDATE tows SET towPaperCompletedAt = @timestamp, status = @status, updatedAt = @updatedAt WHERE id = @id")
};

const undoStepStatements = {
  setupStartedAt: db.prepare("UPDATE tows SET setupStartedAt = NULL, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  goaaCalledAt: db.prepare("UPDATE tows SET goaaCalledAt = NULL, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  goaaArrivalAt: db.prepare("UPDATE tows SET goaaArrivalAt = NULL, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  pushStartedAt: db.prepare("UPDATE tows SET pushStartedAt = NULL, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  towStartedAt: db.prepare("UPDATE tows SET towStartedAt = NULL, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  towCompletedAt: db.prepare("UPDATE tows SET towCompletedAt = NULL, status = @status, updatedAt = @updatedAt WHERE id = @id"),
  towPaperCompletedAt: db.prepare("UPDATE tows SET towPaperCompletedAt = NULL, status = @status, updatedAt = @updatedAt WHERE id = @id")
};

const baseWorkflowOrder = [
  ["setupStartedAt", "planned"],
  ["pushStartedAt", "setup_started"],
  ["towStartedAt", "push_started"],
  ["towCompletedAt", "tow_started"],
  ["towPaperCompletedAt", "tow_completed"]
];

export function sanitizeTow(input) {
  const normalizedInput = deriveLocations(input);
  const tow = {};
  for (const field of fields) {
    if (!(field in normalizedInput)) continue;
    if (field === "needsReview") tow[field] = input[field] ? 1 : 0;
    else if (field === "parserWarnings") tow[field] = JSON.stringify(normalizedInput[field] || []);
    else tow[field] = normalizedInput[field] ?? "";
  }
  return tow;
}

function completeTowParams(tow) {
  return Object.fromEntries(fields.map((field) => [field, field in tow ? tow[field] : field === "needsReview" ? 0 : field === "parserWarnings" ? "[]" : ""]));
}

function deriveLocations(input) {
  if (!input.gate || !input.towSpot || input.fromLocation || input.toLocation) return input;
  return {
    ...input,
    fromLocation: input.gate,
    toLocation: input.towSpot
  };
}

export function listTows(filters = {}) {
  const params = {
    activeStatus: filters.status === "active" ? 1 : 0,
    hasStatus: filters.status && filters.status !== "active" ? 1 : 0,
    status: filters.status || "",
    tailNumber: filters.tailNumber ? `%${filters.tailNumber}%` : "",
    hasTailNumber: filters.tailNumber ? 1 : 0,
    inboundFlightNumber: filters.inboundFlightNumber ? `%${filters.inboundFlightNumber}%` : "",
    hasInboundFlightNumber: filters.inboundFlightNumber ? 1 : 0,
    gate: filters.gate ? `%${filters.gate}%` : "",
    hasGate: filters.gate ? 1 : 0,
    towSpot: filters.towSpot ? `%${filters.towSpot}%` : "",
    hasTowSpot: filters.towSpot ? 1 : 0,
    date: filters.date || "",
    hasDate: filters.date ? 1 : 0,
    dateFrom: filters.dateFrom || "",
    hasDateFrom: filters.dateFrom ? 1 : 0,
    dateTo: filters.dateTo || "",
    hasDateTo: filters.dateTo ? 1 : 0
  };

  return db
    .prepare(
      `SELECT * FROM tows
       WHERE (@activeStatus = 0 OR status != 'completed')
         AND (@hasStatus = 0 OR status = @status)
         AND (@hasTailNumber = 0 OR tailNumber LIKE @tailNumber)
         AND (@hasInboundFlightNumber = 0 OR inboundFlightNumber LIKE @inboundFlightNumber)
         AND (@hasGate = 0 OR gate LIKE @gate)
         AND (@hasTowSpot = 0 OR towSpot LIKE @towSpot)
         AND (@hasDate = 0 OR date(COALESCE(towCompletedAt, createdAt)) = @date)
         AND (@hasDateFrom = 0 OR date(COALESCE(towCompletedAt, createdAt)) >= @dateFrom)
         AND (@hasDateTo = 0 OR date(COALESCE(towCompletedAt, createdAt)) <= @dateTo)
       ORDER BY COALESCE(towCompletedAt, createdAt) DESC`
    )
    .all(params)
    .map(rowToTow);
}

export function getTow(id) {
  return rowToTow(db.prepare("SELECT * FROM tows WHERE id = ?").get(id));
}

export function createTow(input) {
  const tow = completeTowParams(sanitizeTow({ status: "planned", ...input }));
  const result = createTowStatement.run(tow);
  return getTow(result.lastInsertRowid);
}

export function updateTow(id, input) {
  const existing = getTow(id);
  if (!existing) return null;
  const tow = completeTowParams(sanitizeTow({ ...existing, ...input }));
  tow.updatedAt = nowIso();
  tow.id = id;
  updateTowStatement.run(tow);
  return getTow(id);
}

export function logStep(id, step, timestamp = nowIso(), force = false) {
  if (!workflowSteps[step]) throw new Error("Invalid workflow step.");
  const tow = getTow(id);
  if (!tow) return null;
  if (tow[step] && !force) throw new Error("Step has already been logged.");
  const status = workflowSteps[step];
  stepUpdateStatements[step].run({
    id,
    timestamp,
    status,
    updatedAt: nowIso()
  });
  return getTow(id);
}

export function undoLastStep(id) {
  const tow = getTow(id);
  if (!tow) return null;
  const workflowOrder = workflowOrderFor(tow);
  const last = [...workflowOrder].reverse().find(([field]) => Boolean(tow[field]));
  if (!last) throw new Error("No workflow step to undo.");
  const [field, previousStatus] = last;
  undoStepStatements[field].run({
    id,
    status: previousStatus,
    updatedAt: nowIso()
  });
  return { tow: getTow(id), undoneStep: field };
}

function workflowOrderFor(tow) {
  if (![tow.toLocation, tow.towSpot].some((value) => String(value || "").toUpperCase().startsWith("WR"))) {
    return baseWorkflowOrder;
  }
  return [
    ["setupStartedAt", "planned"],
    ["goaaCalledAt", "setup_started"],
    ["goaaArrivalAt", "goaa_called"],
    ["pushStartedAt", "goaa_arrival"],
    ["towStartedAt", "push_started"],
    ["towCompletedAt", "tow_started"],
    ["towPaperCompletedAt", "tow_completed"]
  ];
}

export function deleteTow(id) {
  return db.prepare("DELETE FROM tows WHERE id = ?").run(id).changes > 0;
}
