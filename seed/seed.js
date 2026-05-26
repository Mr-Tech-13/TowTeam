import "../server/db/migrate.js";
import { createTow } from "../server/services/tows.js";

const samples = [
  {
    airline: "MX",
    inboundFlightNumber: "606",
    inboundStation: "PVU",
    eta: "14:47",
    gate: "Gate 33",
    fromLocation: "Gate 33",
    toLocation: "BB113",
    towSpot: "BB113",
    tailNumber: "N223BZ",
    status: "planned",
    notes: "Seed active tow."
  },
  {
    airline: "MX",
    inboundFlightNumber: "607",
    inboundStation: "PVU",
    eta: "15:37",
    gate: "Gate 31",
    fromLocation: "BB113",
    toLocation: "Gate 31",
    towSpot: "BB113",
    tailNumber: "N218BZ",
    driver: "Maxx",
    leftWingWalker: "Liam",
    rightWingWalker: "Jarod",
    otherTeamMembers: "Raul, Myke",
    status: "completed",
    setupStartedAt: "2026-05-25T23:00:00.000Z",
    pushStartedAt: "2026-05-25T23:04:00.000Z",
    towStartedAt: "2026-05-25T23:06:00.000Z",
    towCompletedAt: "2026-05-25T23:25:00.000Z"
  },
  {
    airline: "MX",
    inboundFlightNumber: "761",
    inboundStation: "AVP",
    eta: "21:49",
    gate: "Gate 33",
    towSpot: "WR",
    toLocation: "WR",
    status: "planned",
    needsReview: true,
    parserWarnings: ["Exact tow spot number missing."]
  }
];

for (const sample of samples) {
  createTow(sample);
}

console.log(`Seeded ${samples.length} tow records.`);
