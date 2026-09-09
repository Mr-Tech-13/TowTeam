import test from "node:test";
import assert from "node:assert/strict";
import "../db/migrate.js";

const {
  createTow,
  deleteTow,
  listTows,
  listTowsPage,
  logStep,
  permanentlyDeleteTow,
  restoreTow,
  softDeleteTow,
  undoLastStep,
  updateAircraftTypeForTows,
  updateTow
} = await import("../services/tows.js");

test("tow is not completed until paper is complete", () => {
  const tow = createTow({
    airline: "MX",
    inboundFlightNumber: `T${Date.now()}`,
    inboundStation: "TST",
    aircraftType: "A220",
    eta: "12:00",
    gate: "Gate 1",
    towSpot: "NL614"
  });

  try {
    assert.equal(tow.aircraftType, "A220");
    const moved = logStep(tow.id, "towCompletedAt");
    assert.equal(moved.status, "tow_completed");
    assert.ok(moved.towCompletedAt);

    const papered = logStep(tow.id, "towPaperCompletedAt");
    assert.equal(papered.status, "completed");
    assert.ok(papered.towPaperCompletedAt);
  } finally {
    deleteTow(tow.id);
  }
});

test("saving tow details preserves active deletion state", () => {
  const tow = createTow({
    airline: "MX",
    inboundFlightNumber: `S${Date.now()}`,
    aircraftType: "A220-300",
    eta: "15:15",
    gate: "Gate 8",
    towSpot: "NL612"
  });

  try {
    const saved = updateTow(tow.id, { ...tow, tailNumber: "N213BZ", deletedAt: "" });
    assert.equal(saved.deletedAt, null);
    assert.equal(saved.deletedBy, null);
    assert.equal(saved.deleteReason, null);

    const completed = logStep(tow.id, "towCompletedAt");
    assert.equal(completed.status, "tow_completed");
    assert.equal(listTows({ status: "active" }).some((row) => row.id === tow.id), true);
    assert.equal(listTows({ deleted: "true" }).some((row) => row.id === tow.id), false);
  } finally {
    deleteTow(tow.id);
  }
});

test("undo last workflow step restores previous status", () => {
  const tow = createTow({
    airline: "MX",
    inboundFlightNumber: `U${Date.now()}`,
    inboundStation: "TST",
    eta: "12:00",
    gate: "Gate 1",
    towSpot: "NL614"
  });

  try {
    logStep(tow.id, "setupStartedAt");
    const moved = logStep(tow.id, "towStartedAt");
    assert.equal(moved.status, "tow_started");

    const undone = undoLastStep(tow.id);
    assert.equal(undone.undoneStep, "towStartedAt");
    assert.equal(undone.tow.status, "setup_started");
    assert.equal(undone.tow.towStartedAt, null);
  } finally {
    deleteTow(tow.id);
  }
});

test("missing gate or tow spot automatically needs review", () => {
  const tow = createTow({
    airline: "MX",
    inboundFlightNumber: `R${Date.now()}`,
    inboundStation: "TST",
    eta: "12:00",
    towSpot: "NL614"
  });

  try {
    assert.equal(tow.needsReview, true);
    assert.match(tow.parserWarnings.join(" "), /Tow from missing/);

    const fixed = updateTow(tow.id, { gate: "Gate 1" });
    assert.equal(fixed.needsReview, false);
    assert.deepEqual(fixed.parserWarnings, []);
  } finally {
    deleteTow(tow.id);
  }
});

test("editing gate or tow spot updates derived summary locations", () => {
  const outbound = createTow({
    airline: "MX",
    inboundFlightNumber: `O${Date.now()}`,
    inboundStation: "TST",
    eta: "12:00",
    gate: "Gate 1",
    towSpot: "NL614"
  });
  const inbound = createTow({
    airline: "MX",
    inboundFlightNumber: `I${Date.now()}`,
    inboundStation: "TST",
    eta: "12:00",
    gate: "Gate 2",
    fromLocation: "BB113",
    toLocation: "Gate 2",
    towSpot: "BB113"
  });

  try {
    const movedOutbound = updateTow(outbound.id, { gate: "Gate 3", towSpot: "NL615" });
    assert.equal(movedOutbound.fromLocation, "Gate 3");
    assert.equal(movedOutbound.toLocation, "NL615");

    const movedInbound = updateTow(inbound.id, { gate: "Gate 4", towSpot: "BB114" });
    assert.equal(movedInbound.fromLocation, "BB114");
    assert.equal(movedInbound.toLocation, "Gate 4");

    const movedTuck = updateTow(inbound.id, { gate: "Gate 5", fromLocation: "Tuck", toLocation: "30A", towSpot: "30A" });
    assert.equal(movedTuck.fromLocation, "Gate 5");
    assert.equal(movedTuck.toLocation, "30A");
  } finally {
    deleteTow(outbound.id);
    deleteTow(inbound.id);
  }
});

test("bulk aircraft type update applies to filtered tows", () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const first = createTow({
    airline: "MX",
    inboundFlightNumber: `B${suffix}`,
    gate: "Gate 1",
    towSpot: "NL614",
    towPaperCompletedAt: "2026-06-01T12:00:00.000Z",
    status: "completed"
  });
  const second = createTow({
    airline: "MX",
    inboundFlightNumber: `B${suffix}`,
    gate: "Gate 2",
    towSpot: "BB113",
    towPaperCompletedAt: "2026-06-01T12:00:00.000Z",
    status: "completed"
  });

  try {
    const result = updateAircraftTypeForTows({ status: "completed", inboundFlightNumber: `B${suffix}` }, "a320");
    assert.equal(result.count, 2);
    assert.equal(updateTow(first.id, {}).aircraftType, "A320");
    assert.equal(updateTow(second.id, {}).aircraftType, "A320");
  } finally {
    deleteTow(first.id);
    deleteTow(second.id);
  }
});

test("history can filter completed tows by airline", () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const mxTow = createTow({
    airline: "MX",
    inboundFlightNumber: `M${suffix}`,
    gate: "Gate 1",
    towSpot: "NL614",
    towPaperCompletedAt: "2026-06-01T12:00:00.000Z",
    status: "completed"
  });
  const ekTow = createTow({
    airline: "EK",
    inboundFlightNumber: `E${suffix}`,
    gate: "Gate 2",
    towSpot: "BB113",
    towPaperCompletedAt: "2026-06-01T12:00:00.000Z",
    status: "completed"
  });

  try {
    const rows = listTows({ status: "completed", airline: "EK" });
    assert.ok(rows.some((tow) => tow.id === ekTow.id));
    assert.equal(rows.some((tow) => tow.id === mxTow.id), false);
  } finally {
    deleteTow(mxTow.id);
    deleteTow(ekTow.id);
  }
});

test("history pagination returns filtered pages and totals", () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const created = Array.from({ length: 12 }, (_, index) => createTow({
    airline: "TP",
    inboundFlightNumber: `${suffix}-${index}`,
    gate: `Gate ${index + 1}`,
    towSpot: "NL614",
    towCompletedAt: new Date(Date.UTC(2026, 8, 1, 12, index)).toISOString(),
    towPaperCompletedAt: new Date(Date.UTC(2026, 8, 1, 12, index + 1)).toISOString(),
    status: "completed"
  }));

  try {
    const first = listTowsPage({ status: "completed", inboundFlightNumber: suffix }, 1, 5);
    const third = listTowsPage({ status: "completed", inboundFlightNumber: suffix }, 3, 5);
    const defaultSize = listTowsPage({ status: "completed", inboundFlightNumber: suffix }, 1, 7);
    assert.deepEqual({ page: first.page, pageSize: first.pageSize, total: first.total, totalPages: first.totalPages }, { page: 1, pageSize: 5, total: 12, totalPages: 3 });
    assert.equal(first.tows.length, 5);
    assert.equal(third.tows.length, 2);
    assert.equal(defaultSize.pageSize, 10);
    assert.equal(defaultSize.tows.length, 10);
  } finally {
    for (const tow of created) deleteTow(tow.id);
  }
});

test("soft deleted tows move to trash before permanent delete", () => {
  const tow = createTow({
    airline: "MX",
    inboundFlightNumber: `D${Date.now()}`,
    gate: "Gate 1",
    towSpot: "NL614"
  });

  const trashed = softDeleteTow(tow.id, { username: "tester" }, "bad import");
  assert.equal(trashed.after.deletedBy, "tester");
  assert.equal(trashed.after.deleteReason, "bad import");
  assert.equal(listTows({ status: "active" }).some((row) => row.id === tow.id), false);
  assert.equal(listTows({ deleted: "true" }).some((row) => row.id === tow.id), true);

  const restored = restoreTow(tow.id);
  assert.equal(restored.after.deletedAt, null);
  assert.equal(listTows({ status: "active" }).some((row) => row.id === tow.id), true);

  softDeleteTow(tow.id, { username: "tester" });
  const removed = permanentlyDeleteTow(tow.id);
  assert.equal(removed.id, tow.id);
  assert.equal(permanentlyDeleteTow(tow.id), null);
});
