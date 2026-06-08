import { TOW_SPOTS } from "../../shared/towSpots.js";

const numberedSpots = TOW_SPOTS.filter((spot) => spot.numberRequired);
const exactSpots = TOW_SPOTS.filter((spot) => !spot.numberRequired);
const numberedCodes = numberedSpots.map((spot) => spot.code);
const exactCodes = exactSpots.map((spot) => spot.code);
const aliasMap = numberedSpots.flatMap((spot) => [spot.name, ...(spot.aliases || [])].map((alias) => [alias.toUpperCase(), spot.code]));
const hardstandPattern = "254\\s*[A-P](?:\\s*-\\s*[A-P])?";
const spotPattern = buildSpotPattern();
const groundLocationPattern = "tuck";
const directionLocationPattern = `${spotPattern}|${hardstandPattern}|gate\\s*\\d+|g\\s*\\d+|\\d+|${groundLocationPattern}`;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function flexibleCodeRegex(value) {
  return String(value)
    .split("")
    .map((char) => escapeRegex(char))
    .join("\\s*");
}

function buildSpotPattern() {
  const numberedPattern = [...numberedCodes, ...aliasMap.map(([alias]) => alias)]
    .map(escapeRegex)
    .join("|");
  const exactPattern = exactCodes.map(flexibleCodeRegex).join("|");
  return [numberedPattern && `(?:${numberedPattern})\\s*\\d*`, exactPattern, hardstandPattern].filter(Boolean).join("|");
}

export function normalizeTime(value) {
  const digits = value.replace(/\D/g, "").padStart(4, "0").slice(-4);
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function normalizeGate(value) {
  const match = String(value).match(/\d+/);
  return match ? `Gate ${match[0]}` : "";
}

export function normalizeSpot(value) {
  if (!value) return "";
  const clean = value.toUpperCase().replace(/\s+/g, " ").trim();
  const hardstandMatch = clean.match(new RegExp(`\\b(${hardstandPattern})\\b`, "i"));
  if (hardstandMatch) return hardstandMatch[1].toUpperCase().replace(/\s+/g, "").replace(/\s*-\s*/g, "-");
  for (const [longName, code] of aliasMap) {
    if (clean.startsWith(longName)) {
      const num = clean.replace(longName, "").replace(/\D/g, "");
      return `${code}${num}`;
    }
  }
  const exactMatch = exactCodes.find((code) => new RegExp(`\\b${flexibleCodeRegex(code)}\\b`).test(clean));
  if (exactMatch) return exactMatch;
  const match = numberedCodes.length ? clean.match(new RegExp(`\\b(${numberedCodes.map(escapeRegex).join("|")})\\s*(\\d*)\\b`)) : null;
  return match ? `${match[1]}${match[2] || ""}` : "";
}

function spotNeedsReview(spot) {
  return numberedCodes.includes(String(spot || "").toUpperCase());
}

export function hasKnownTowSpot(tow) {
  const spot = String(tow?.towSpot || "").toUpperCase();
  return new RegExp(`^${hardstandPattern}$`, "i").test(spot) || exactCodes.includes(spot) || numberedCodes.some((code) => new RegExp(`^${escapeRegex(code)}\\d+$`).test(spot));
}

function locationType(value) {
  const upper = value.toUpperCase();
  if (new RegExp(`^${hardstandPattern}$`, "i").test(upper)) return "spot";
  if (exactCodes.includes(upper)) return "spot";
  if ([...numberedCodes, ...aliasMap.map(([alias]) => alias)].some((spot) => upper.startsWith(spot))) return "spot";
  if (/^(G|GATE)\s*\d+$|^\d+$/.test(upper)) return "gate";
  return "other";
}

function normalizePlanGate(value) {
  const clean = String(value || "").trim().toUpperCase();
  if (!clean) return "";
  if (/^[A-Z]\d+[A-Z]?$/.test(clean)) return clean;
  return normalizeGate(clean) || clean;
}

function normalizeLocation(value) {
  const trimmed = value.trim();
  if (/^tuck$/i.test(trimmed)) return "Tuck";
  if (locationType(trimmed) === "gate") return normalizeGate(trimmed);
  return normalizeSpot(trimmed) || trimmed;
}

function parseFlights(block) {
  const flights = [];
  const flightRegex = /\b([A-Z]{2})\s*(\d{2,4})\s+([A-Z]{3})\s+(\d{3,4})\b/gi;
  let match;
  while ((match = flightRegex.exec(block)) !== null) {
    flights.push({
      airline: match[1].toUpperCase(),
      inboundFlightNumber: match[2],
      inboundStation: match[3].toUpperCase(),
      eta: normalizeTime(match[4])
    });
  }
  return flights;
}

function parseGate(block) {
  const match = block.match(/\bGATE\s*(\d+)\b/i);
  return match ? `Gate ${match[1]}` : "";
}

function parseTail(block) {
  const match = block.match(/\bN\d[0-9A-Z]{2,5}\b/i);
  return match ? match[0].toUpperCase() : "";
}

function parseShorthand(block) {
  const re = new RegExp(`\\b(?:GATE\\s*|G\\s*)?(\\d+)\\s*([<>])\\s*(${spotPattern})\\b`, "i");
  const match = block.match(re);
  if (!match) return null;

  const gate = `Gate ${match[1]}`;
  const spot = normalizeSpot(match[3]);
  if (match[2] === ">") {
    return { gate, towSpot: spot, fromLocation: gate, toLocation: spot, source: "shorthand" };
  }
  return { gate, towSpot: spot, fromLocation: spot, toLocation: gate, source: "shorthand" };
}

function parseWrittenDirection(block, gate) {
  const fromTo = new RegExp(`\\bfrom\\s+(${directionLocationPattern})\\s+to\\s+(${directionLocationPattern})\\b`, "i");
  const fromToMatch = block.match(fromTo);
  if (fromToMatch) {
    const fromLocation = normalizeLocation(fromToMatch[1]);
    const toLocation = normalizeLocation(fromToMatch[2]);
    const towSpot = [fromLocation, toLocation].find((item) => locationType(item) === "spot") || "";
    return { fromLocation, toLocation, towSpot, source: "written" };
  }

  const sourceToSpot = new RegExp(`\\b(${groundLocationPattern})\\s+to\\s+(${spotPattern})\\b`, "i");
  const sourceToSpotMatch = block.match(sourceToSpot);
  if (sourceToSpotMatch) {
    const fromLocation = normalizeLocation(sourceToSpotMatch[1]);
    const towSpot = normalizeSpot(sourceToSpotMatch[2]);
    return { fromLocation, toLocation: towSpot, towSpot, source: "written" };
  }

  const toSpot = new RegExp(`\\bto\\s+(${spotPattern})\\b`, "i");
  const toSpotMatch = block.match(toSpot);
  if (toSpotMatch) {
    const towSpot = normalizeSpot(toSpotMatch[1]);
    return { fromLocation: gate, toLocation: towSpot, towSpot, source: "written" };
  }

  return null;
}

function mergeDirections(block, gate, warnings) {
  const shorthand = parseShorthand(block);
  const written = parseWrittenDirection(block, shorthand?.gate || gate);

  if (shorthand && written) {
    const differs = shorthand.fromLocation !== written.fromLocation || shorthand.toLocation !== written.toLocation;
    if (differs) {
      warnings.push(`Shorthand says ${shorthand.fromLocation} to ${shorthand.toLocation}; written text says ${written.fromLocation} to ${written.toLocation}.`);
      return {
        ...shorthand,
        notes: `Parser conflict: shorthand ${shorthand.fromLocation} to ${shorthand.toLocation}; written ${written.fromLocation} to ${written.toLocation}.`
      };
    }
  }

  return written || shorthand || {};
}

function parseBlock(block) {
  const warnings = [];
  const flights = parseFlights(block);
  if (flights.length === 0) return [];

  const gate = parseGate(block);
  const tailNumber = parseTail(block);
  const direction = mergeDirections(block, gate, warnings);
  const resolvedGate = direction.gate || gate;
  const towSpot = direction.towSpot || "";

  if (!resolvedGate) warnings.push("Gate missing.");
  if (!towSpot) warnings.push("Tow spot missing.");
  if (spotNeedsReview(towSpot)) warnings.push("Exact tow spot number missing.");
  if (flights.length > 1) warnings.push("Multiple flights shared one block; review before starting.");

  return flights.map((flight) => ({
    ...flight,
    gate: resolvedGate,
    fromLocation: direction.fromLocation || "",
    toLocation: direction.toLocation || "",
    towSpot,
    tailNumber,
    driver: "",
    leftWingWalker: "",
    rightWingWalker: "",
    otherTeamMembers: "",
    notes: direction.notes || "",
    status: "planned",
    needsReview: warnings.length > 0,
    parserWarnings: warnings
  }));
}

function parseStructuredAirlinePlan(text) {
  const source = String(text || "");
  const arrivalMatch = source.match(/\bArrival\b[\s\S]*?\b([A-Z]{2})\s*(\d{2,4})\s*:\s*([A-Z]?\d+[A-Z]?)\b/i);
  const departureMatch = source.match(/\bDeparture\b[\s\S]*?\b([A-Z]{2})\s*(\d{2,4})\s*:\s*([A-Z]?\d+[A-Z]?)\b/i);
  const towOffMatch = source.match(/\bTow\s+off\s*:\s*([^\r\n]+)/i);
  const towingBackMatch = source.match(/\bTowing\s+back\s*:\s*(\d{3,4})\s*H?\b/i);
  if (!arrivalMatch || !towOffMatch) return [];

  const airline = arrivalMatch[1].toUpperCase();
  const arrivalFlightNumber = arrivalMatch[2];
  const arrivalGate = normalizePlanGate(arrivalMatch[3]);
  const towSpot = normalizeSpot(towOffMatch[1]);
  const tows = [
    {
      airline,
      inboundFlightNumber: arrivalFlightNumber,
      inboundStation: "",
      eta: "",
      gate: arrivalGate,
      fromLocation: arrivalGate,
      toLocation: towSpot,
      towSpot,
      tailNumber: "",
      driver: "",
      leftWingWalker: "",
      rightWingWalker: "",
      otherTeamMembers: "",
      notes: "Parsed from tow off plan.",
      status: "planned",
      needsReview: !hasKnownTowSpot({ towSpot }),
      parserWarnings: hasKnownTowSpot({ towSpot }) ? [] : ["Tow spot missing or unknown."]
    }
  ];

  if (departureMatch && towingBackMatch) {
    const departureAirline = departureMatch[1].toUpperCase();
    const departureGate = normalizePlanGate(departureMatch[3]);
    tows.push({
      airline: departureAirline,
      inboundFlightNumber: departureMatch[2],
      inboundStation: "",
      eta: normalizeTime(towingBackMatch[1]),
      gate: departureGate,
      fromLocation: towSpot,
      toLocation: departureGate,
      towSpot,
      tailNumber: "",
      driver: "",
      leftWingWalker: "",
      rightWingWalker: "",
      otherTeamMembers: "",
      notes: "Parsed from towing back plan.",
      status: "planned",
      needsReview: !hasKnownTowSpot({ towSpot }),
      parserWarnings: hasKnownTowSpot({ towSpot }) ? [] : ["Tow spot missing or unknown."]
    });
  }

  return tows;
}

export function parseTowPlan(text, options = {}) {
  const structuredTows = parseStructuredAirlinePlan(text);
  const tows = structuredTows.length ? structuredTows : String(text)
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !/^RONS$/i.test(block))
    .flatMap(parseBlock);

  return options.onlyKnownTowSpots ? tows.filter(hasKnownTowSpot) : tows;
}
