import test from "node:test";
import assert from "node:assert/strict";
import "../db/migrate.js";
import { createTow, deleteTow, logStep, undoLastStep, updateTow } from "../services/tows.js";

test("tow is not completed until paper is complete", () => {
  const tow = createTow({
    airline: "MX",
    inboundFlightNumber: `T${Date.now()}`,
    inboundStation: "TST",
    eta: "12:00",
    gate: "Gate 1",
    towSpot: "NL614"
  });

  try {
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
    assert.match(tow.parserWarnings.join(" "), /Gate missing/);

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
