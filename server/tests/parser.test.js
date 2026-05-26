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
