import test from "node:test";
import assert from "node:assert/strict";
import { parseTowPlan } from "../services/parser.js";

const messySample = `MX524 ILM 1232
MX525 ILM 1312
GATE 30

MX606 PVU 1447 
Gate 33 
Tows to BB113 tail number N223BZ

MX607 PVU 1537
GATE31
TAIL NUMBER N218BZ WILL NEED TO GET TOWED FROM BB113 TO GATE 31

MX267 HSV 1427
MX760 AVP 1539 
GATE 30

MX247 HVN 1747
MX 247 CAK 1832
GATE 33

RONS

MX843 CHS 1641
GATE 31

MX855 RDU 1811
GATE 30

MX761 AVP 2149
GATE 33`;

test("parses messy copied tow plan into candidates", () => {
  const tows = parseTowPlan(messySample);
  assert.equal(tows.length, 11);

  const bbTow = tows.find((tow) => tow.inboundFlightNumber === "606");
  assert.equal(bbTow.gate, "Gate 33");
  assert.equal(bbTow.towSpot, "BB113");
  assert.equal(bbTow.toLocation, "BB113");
  assert.equal(bbTow.tailNumber, "N223BZ");
  assert.equal(bbTow.needsReview, false);

  const inboundTow = tows.find((tow) => tow.inboundFlightNumber === "607");
  assert.equal(inboundTow.fromLocation, "BB113");
  assert.equal(inboundTow.toLocation, "Gate 31");
  assert.equal(inboundTow.tailNumber, "N218BZ");

  const multi = tows.filter((tow) => tow.gate === "Gate 30" && ["524", "525"].includes(tow.inboundFlightNumber));
  assert.equal(multi.length, 2);
  assert.equal(multi[0].needsReview, true);
  assert.match(multi[0].parserWarnings.join(" "), /Multiple flights|Tow spot missing/);
});

test("import mode only returns flights with exact tow spots", () => {
  const tows = parseTowPlan(messySample, { onlyKnownTowSpots: true });
  assert.deepEqual(
    tows.map((tow) => tow.inboundFlightNumber),
    ["606", "607"]
  );
  assert.deepEqual(
    tows.map((tow) => tow.towSpot),
    ["BB113", "BB113"]
  );
});

test("parses outbound shorthand gate to north lot", () => {
  const [tow] = parseTowPlan("MX100 ILM 1234\n34 > NL");
  assert.equal(tow.gate, "Gate 34");
  assert.equal(tow.fromLocation, "Gate 34");
  assert.equal(tow.toLocation, "NL");
  assert.equal(tow.towSpot, "NL");
  assert.equal(tow.needsReview, true);
});

test("parses inbound shorthand north lot to gate", () => {
  const [tow] = parseTowPlan("MX101 ILM 1334\nGate 34 < NL614");
  assert.equal(tow.gate, "Gate 34");
  assert.equal(tow.fromLocation, "NL614");
  assert.equal(tow.toLocation, "Gate 34");
  assert.equal(tow.towSpot, "NL614");
  assert.equal(tow.needsReview, false);
});

test("flags shorthand and written direction conflicts", () => {
  const [tow] = parseTowPlan("MX102 ILM 1434\nG34 > NL\nfrom BB113 to Gate 34");
  assert.equal(tow.needsReview, true);
  assert.match(tow.parserWarnings.join(" "), /Shorthand says/);
});

test("imports 30A and 32A tow spots", () => {
  const tows = parseTowPlan("MX300 TPA 1200\nGate 30\nTows to 30A\n\nMX320 JAX 1300\nfrom 32A to Gate 32", { onlyKnownTowSpots: true });
  assert.deepEqual(
    tows.map((tow) => tow.towSpot),
    ["30A", "32A"]
  );
});

test("parses tuck to tow spot directions", () => {
  const [tow] = parseTowPlan("MX321 JAX 1300\ntuck to 32A", { onlyKnownTowSpots: true });
  assert.equal(tow.fromLocation, "Tuck");
  assert.equal(tow.toLocation, "32A");
  assert.equal(tow.towSpot, "32A");
  assert.equal(tow.needsReview, true);
  assert.match(tow.parserWarnings.join(" "), /Gate missing/);
});

test("parses gate tuck to spaced exact tow spot", () => {
  const [tow] = parseTowPlan("MX322 JAX 1300\nGate 32 tuck to 30 A", { onlyKnownTowSpots: true });
  assert.equal(tow.gate, "Gate 32");
  assert.equal(tow.fromLocation, "Gate 32");
  assert.equal(tow.toLocation, "30A");
  assert.equal(tow.towSpot, "30A");
});

test("parses structured arrival departure tow off plans", () => {
  const plan = `Good Morning Team and Happy Monday!

Arrival 
EK219: C244
Tow off: 254D-P
Departing:1230H
Carousel: C67(may change)

Departure 
EK220: C244
Towing back:1815H`;

  const tows = parseTowPlan(plan, { onlyKnownTowSpots: true });
  assert.equal(tows.length, 2);
  assert.deepEqual(
    tows.map((tow) => [tow.airline, tow.inboundFlightNumber, tow.gate, tow.fromLocation, tow.toLocation, tow.towSpot, tow.eta, tow.notes]),
    [
      ["EK", "219", "C244", "C244", "254D-P", "254D-P", "", ""],
      ["EK", "220", "C244", "254D-P", "C244", "254D-P", "18:15", ""]
    ]
  );
});

test("only accepts 254A through 254P as hardstand tow spots", () => {
  const valid = parseTowPlan("EK219 ILM 1200\nGate 32\nTows to 254 p", { onlyKnownTowSpots: true });
  assert.equal(valid[0].towSpot, "254P");

  const range = parseTowPlan("EK219 ILM 1200\nGate 32\nTows to 254d-p", { onlyKnownTowSpots: true });
  assert.equal(range[0].towSpot, "254D-P");

  const invalid = parseTowPlan("EK219 ILM 1200\nGate 32\nTows to 254Q", { onlyKnownTowSpots: true });
  assert.equal(invalid.length, 0);
});

test("flags missing gate for review", () => {
  const [tow] = parseTowPlan("MX400 TPA 1200\nTows to BB113");
  assert.equal(tow.needsReview, true);
  assert.match(tow.parserWarnings.join(" "), /Gate missing/);
});
