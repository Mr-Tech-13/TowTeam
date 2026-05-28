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

export const workflowSteps = {
  setupStartedAt: "setup_started",
  goaaCalledAt: "goaa_called",
  goaaArrivalAt: "goaa_arrival",
  pushStartedAt: "push_started",
  towStartedAt: "tow_started",
  towCompletedAt: "tow_completed",
  towPaperCompletedAt: "completed"
};

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

function deriveLocations(input) {
  if (!input.gate || !input.towSpot || input.fromLocation || input.toLocation) return input;
  return {
    ...input,
    fromLocation: input.gate,
    toLocation: input.towSpot
  };
}

export function listTows(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.status === "active") clauses.push("status != 'completed'");
  else if (filters.status) {
    clauses.push("status = @status");
    params.status = filters.status;
  }

  for (const field of ["tailNumber", "inboundFlightNumber", "gate", "towSpot"]) {
    if (filters[field]) {
      clauses.push(`${field} LIKE @${field}`);
      params[field] = `%${filters[field]}%`;
    }
  }

  if (filters.date) {
    clauses.push("date(COALESCE(towCompletedAt, createdAt)) = @date");
    params.date = filters.date;
  }

  if (filters.dateFrom) {
    clauses.push("date(COALESCE(towCompletedAt, createdAt)) >= @dateFrom");
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    clauses.push("date(COALESCE(towCompletedAt, createdAt)) <= @dateTo");
    params.dateTo = filters.dateTo;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM tows ${where} ORDER BY COALESCE(towCompletedAt, createdAt) DESC`).all(params).map(rowToTow);
}

export function getTow(id) {
  return rowToTow(db.prepare("SELECT * FROM tows WHERE id = ?").get(id));
}

export function createTow(input) {
  const tow = sanitizeTow({ status: "planned", ...input });
  const keys = Object.keys(tow);
  const placeholders = keys.map((key) => `@${key}`).join(", ");
  const result = db.prepare(`INSERT INTO tows (${keys.join(", ")}) VALUES (${placeholders})`).run(tow);
  return getTow(result.lastInsertRowid);
}

export function updateTow(id, input) {
  const tow = sanitizeTow(input);
  const keys = Object.keys(tow);
  if (keys.length === 0) return getTow(id);
  tow.updatedAt = nowIso();
  tow.id = id;
  const setClause = [...keys.map((key) => `${key} = @${key}`), "updatedAt = @updatedAt"].join(", ");
  db.prepare(`UPDATE tows SET ${setClause} WHERE id = @id`).run(tow);
  return getTow(id);
}

export function logStep(id, step, timestamp = nowIso(), force = false) {
  if (!workflowSteps[step]) throw new Error("Invalid workflow step.");
  const tow = getTow(id);
  if (!tow) return null;
  if (tow[step] && !force) throw new Error("Step has already been logged.");
  const status = workflowSteps[step];
  db.prepare(`UPDATE tows SET ${step} = @timestamp, status = @status, updatedAt = @updatedAt WHERE id = @id`).run({
    id,
    timestamp,
    status,
    updatedAt: nowIso()
  });
  return getTow(id);
}

export function deleteTow(id) {
  return db.prepare("DELETE FROM tows WHERE id = ?").run(id).changes > 0;
}
