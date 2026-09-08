import { db, nowIso, rowToTow } from "../db/database.js";

const fields = [
  "airline",
  "inboundFlightNumber",
  "inboundStation",
  "aircraftType",
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
  "towPaperCompletedAt",
  "deletedAt",
  "deletedBy",
  "deleteReason"
];

function ensureTowSchemaColumns() {
  const columns = db.prepare("PRAGMA table_info(tows)").all().map((column) => column.name);
  const missingColumns = [
    ["aircraftType", "TEXT"],
    ["towPaperCompletedAt", "TEXT"],
    ["deletedAt", "TEXT"],
    ["deletedBy", "TEXT"],
    ["deleteReason", "TEXT"]
  ].filter(([name]) => !columns.includes(name));

  for (const [name, type] of missingColumns) {
    db.exec(`ALTER TABLE tows ADD COLUMN ${name} ${type}`);
  }
  db.exec("UPDATE tows SET deletedAt = NULL WHERE deletedAt = ''");
  db.exec("UPDATE tows SET deletedBy = NULL WHERE deletedBy = ''");
  db.exec("UPDATE tows SET deleteReason = NULL WHERE deleteReason = ''");
}

ensureTowSchemaColumns();

const createTowStatement = db.prepare(
  `INSERT INTO tows (
    airline, inboundFlightNumber, inboundStation, aircraftType, eta, gate, fromLocation, toLocation, towSpot, tailNumber,
    driver, leftWingWalker, rightWingWalker, otherTeamMembers, notes, status, needsReview, parserWarnings,
    setupStartedAt, goaaCalledAt, goaaArrivalAt, pushStartedAt, towStartedAt, towCompletedAt, towPaperCompletedAt,
    deletedAt, deletedBy, deleteReason
  ) VALUES (
    @airline, @inboundFlightNumber, @inboundStation, @aircraftType, @eta, @gate, @fromLocation, @toLocation, @towSpot, @tailNumber,
    @driver, @leftWingWalker, @rightWingWalker, @otherTeamMembers, @notes, @status, @needsReview, @parserWarnings,
    @setupStartedAt, @goaaCalledAt, @goaaArrivalAt, @pushStartedAt, @towStartedAt, @towCompletedAt, @towPaperCompletedAt,
    @deletedAt, @deletedBy, @deleteReason
  )`
);

const updateTowStatement = db.prepare(
  `UPDATE tows SET
    airline = @airline,
    inboundFlightNumber = @inboundFlightNumber,
    inboundStation = @inboundStation,
    aircraftType = @aircraftType,
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
    deletedAt = @deletedAt,
    deletedBy = @deletedBy,
    deleteReason = @deleteReason,
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
  ["towStartedAt", "setup_started"],
  ["towCompletedAt", "tow_started"],
  ["towPaperCompletedAt", "tow_completed"]
];
const automaticMissingDetailWarnings = ["Tow from missing.", "Tow to missing."];
const nullableFields = new Set(["deletedAt", "deletedBy", "deleteReason"]);

export function sanitizeTow(input) {
  const normalizedInput = deriveLocations(input);
  const tow = {};
  for (const field of fields) {
    if (!(field in normalizedInput)) continue;
    if (field === "needsReview") continue;
    if (field === "parserWarnings") continue;
    const value = normalizedInput[field];
    tow[field] = nullableFields.has(field) && (value == null || value === "") ? null : value ?? "";
  }
  const warnings = normalizeWarnings(normalizedInput.parserWarnings);
  addMissingDetailWarnings(normalizedInput, warnings);
  tow.needsReview = warnings.length > 0 ? 1 : 0;
  tow.parserWarnings = JSON.stringify(warnings);
  return tow;
}

function normalizeWarnings(value) {
  const withoutAutomaticWarnings = (warnings) => warnings.filter((warning) => !automaticMissingDetailWarnings.includes(warning));
  if (Array.isArray(value)) return withoutAutomaticWarnings(value);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? withoutAutomaticWarnings(parsed) : [];
  } catch {
    return [];
  }
}

function addWarning(warnings, message) {
  if (!warnings.includes(message)) warnings.push(message);
}

function addMissingDetailWarnings(tow, warnings) {
  if (!String(tow.gate || "").trim()) addWarning(warnings, automaticMissingDetailWarnings[0]);
  if (!String(tow.towSpot || "").trim()) addWarning(warnings, automaticMissingDetailWarnings[1]);
}

function completeTowParams(tow) {
  return Object.fromEntries(fields.map((field) => {
    if (field in tow) return [field, tow[field]];
    if (field === "needsReview") return [field, 0];
    if (field === "parserWarnings") return [field, "[]"];
    if (nullableFields.has(field)) return [field, null];
    return [field, ""];
  }));
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
    trashOnly: filters.deleted === "true" || filters.trash === "true" ? 1 : 0,
    airline: filters.airline ? `%${filters.airline}%` : "",
    hasAirline: filters.airline ? 1 : 0,
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
       WHERE (@trashOnly = 0 OR NULLIF(TRIM(deletedAt), '') IS NOT NULL)
         AND (@trashOnly = 1 OR NULLIF(TRIM(deletedAt), '') IS NULL)
         AND (@activeStatus = 0 OR status != 'completed')
         AND (@hasStatus = 0 OR status = @status)
         AND (@hasAirline = 0 OR airline LIKE @airline)
         AND (@hasTailNumber = 0 OR tailNumber LIKE @tailNumber)
         AND (@hasInboundFlightNumber = 0 OR inboundFlightNumber LIKE @inboundFlightNumber)
         AND (@hasGate = 0 OR gate LIKE @gate)
         AND (@hasTowSpot = 0 OR towSpot LIKE @towSpot)
         AND (@hasDate = 0 OR date(COALESCE(towCompletedAt, createdAt)) = @date)
         AND (@hasDateFrom = 0 OR date(COALESCE(towCompletedAt, createdAt)) >= @dateFrom)
         AND (@hasDateTo = 0 OR date(COALESCE(towCompletedAt, createdAt)) <= @dateTo)
       ORDER BY
         CASE WHEN @activeStatus = 1 THEN
           CASE
             WHEN status IN ('setup_started', 'goaa_called', 'goaa_arrival', 'push_started', 'tow_started') THEN 0
             WHEN status = 'planned' THEN 1
             WHEN status = 'tow_completed' THEN 2
             ELSE 3
           END
         ELSE 0 END,
         COALESCE(towCompletedAt, updatedAt, createdAt) DESC,
         id DESC`
    )
    .all(params)
    .map(rowToTow);
}

export function getTow(id) {
  return rowToTow(db.prepare("SELECT * FROM tows WHERE id = ?").get(id));
}

export function createTow(input) {
  const tow = completeTowParams(sanitizeTow({ status: "planned", ...input, deletedAt: null, deletedBy: null, deleteReason: null }));
  const result = createTowStatement.run(tow);
  return getTow(result.lastInsertRowid);
}

export function updateTow(id, input) {
  const existing = getTow(id);
  if (!existing) return null;
  const tow = completeTowParams(sanitizeTow(syncEditedLocations(existing, {
    ...input,
    deletedAt: existing.deletedAt,
    deletedBy: existing.deletedBy,
    deleteReason: existing.deleteReason
  })));
  tow.updatedAt = nowIso();
  tow.id = id;
  updateTowStatement.run(tow);
  return getTow(id);
}

export function updateAircraftTypeForTows(filters = {}, aircraftType = "") {
  const cleanedAircraftType = String(aircraftType || "").trim().toUpperCase();
  if (!cleanedAircraftType) throw new Error("Aircraft type is required.");
  const rows = listTows(filters);
  const ids = rows.map((tow) => tow.id);
  if (ids.length === 0) return { count: 0 };

  const update = db.prepare("UPDATE tows SET aircraftType = @aircraftType, updatedAt = @updatedAt WHERE id = @id");
  const run = db.transaction(() => {
    for (const id of ids) {
      update.run({ id, aircraftType: cleanedAircraftType, updatedAt: nowIso() });
    }
  });
  run();
  return { count: ids.length, aircraftType: cleanedAircraftType };
}

function syncEditedLocations(existing, input) {
  const merged = { ...existing, ...input };
  if (merged.gate && merged.fromLocation === "Tuck") merged.fromLocation = merged.gate;
  if (input.gate !== undefined && input.gate !== existing.gate) {
    if (existing.fromLocation === existing.gate && merged.fromLocation === existing.fromLocation) merged.fromLocation = input.gate;
    if (existing.toLocation === existing.gate && merged.toLocation === existing.toLocation) merged.toLocation = input.gate;
  }
  if (input.towSpot !== undefined && input.towSpot !== existing.towSpot) {
    if (existing.fromLocation === existing.towSpot && merged.fromLocation === existing.fromLocation) merged.fromLocation = input.towSpot;
    if (existing.toLocation === existing.towSpot && merged.toLocation === existing.toLocation) merged.toLocation = input.towSpot;
  }
  return merged;
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

export function softDeleteTow(id, user, reason = "") {
  const tow = getTow(id);
  if (!tow || tow.deletedAt) return null;
  const cleanedReason = String(reason || "").trim();
  if (!cleanedReason) throw new Error("Delete reason is required.");
  if (cleanedReason.length > 500) throw new Error("Delete reason must be 500 characters or fewer.");
  db.prepare(
    `UPDATE tows
     SET deletedAt = @deletedAt, deletedBy = @deletedBy, deleteReason = @deleteReason, updatedAt = @updatedAt
     WHERE id = @id`
  ).run({
    id,
    deletedAt: nowIso(),
    deletedBy: user?.username || "",
    deleteReason: cleanedReason,
    updatedAt: nowIso()
  });
  return { before: tow, after: getTow(id) };
}

export function restoreTow(id) {
  const tow = getTow(id);
  if (!tow || !tow.deletedAt) return null;
  db.prepare(
    `UPDATE tows
     SET deletedAt = NULL, deletedBy = NULL, deleteReason = NULL, updatedAt = @updatedAt
     WHERE id = @id`
  ).run({ id, updatedAt: nowIso() });
  return { before: tow, after: getTow(id) };
}

export function permanentlyDeleteTow(id) {
  const tow = getTow(id);
  if (!tow || !tow.deletedAt) return null;
  const deleted = db.prepare("DELETE FROM tows WHERE id = ?").run(id).changes > 0;
  return deleted ? tow : null;
}

function workflowOrderFor(tow) {
  if (![tow.toLocation, tow.towSpot].some((value) => String(value || "").toUpperCase().startsWith("WR"))) {
    return baseWorkflowOrder;
  }
  return [
    ["setupStartedAt", "planned"],
    ["goaaCalledAt", "setup_started"],
    ["goaaArrivalAt", "goaa_called"],
    ["towStartedAt", "goaa_arrival"],
    ["towCompletedAt", "tow_started"],
    ["towPaperCompletedAt", "tow_completed"]
  ];
}

export function deleteTow(id) {
  return db.prepare("DELETE FROM tows WHERE id = ?").run(id).changes > 0;
}
