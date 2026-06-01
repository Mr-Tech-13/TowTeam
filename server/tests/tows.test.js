import test from "node:test";
import assert from "node:assert/strict";
import "../db/migrate.js";
import { createTow, deleteTow, logStep, undoLastStep } from "../services/tows.js";

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
    const moved = logStep(tow.id, "pushStartedAt");
    assert.equal(moved.status, "push_started");

    const undone = undoLastStep(tow.id);
    assert.equal(undone.undoneStep, "pushStartedAt");
    assert.equal(undone.tow.status, "setup_started");
    assert.equal(undone.tow.pushStartedAt, null);
  } finally {
    deleteTow(tow.id);
  }
});
