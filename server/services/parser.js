const SPOT_MAP = {
  "BIRD BATH": "BB",
  "WEST RAMP": "WR",
  "NORTH LOT": "NL"
};

const spotPattern = "(?:NL|BB|WR|BIRD\\s+BATH|WEST\\s+RAMP|NORTH\\s+LOT)\\s*\\d*";

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
  for (const [longName, code] of Object.entries(SPOT_MAP)) {
    if (clean.startsWith(longName)) {
      const num = clean.replace(longName, "").replace(/\D/g, "");
      return `${code}${num}`;
    }
  }
  const match = clean.match(/\b(NL|BB|WR)\s*(\d*)\b/);
  return match ? `${match[1]}${match[2] || ""}` : "";
}

function spotNeedsReview(spot) {
  return Boolean(spot && /^(NL|BB|WR)$/.test(spot));
}

function locationType(value) {
  const upper = value.toUpperCase();
  if (/^(NL|BB|WR|BIRD BATH|WEST RAMP|NORTH LOT)/.test(upper)) return "spot";
  if (/^(G|GATE)\s*\d+$|^\d+$/.test(upper)) return "gate";
  return "other";
}

function normalizeLocation(value) {
  const trimmed = value.trim();
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
  const fromTo = new RegExp(`\\bfrom\\s+(${spotPattern}|gate\\s*\\d+|g\\s*\\d+|\\d+)\\s+to\\s+(${spotPattern}|gate\\s*\\d+|g\\s*\\d+|\\d+)\\b`, "i");
  const fromToMatch = block.match(fromTo);
  if (fromToMatch) {
    const fromLocation = normalizeLocation(fromToMatch[1]);
    const toLocation = normalizeLocation(fromToMatch[2]);
    const towSpot = [fromLocation, toLocation].find((item) => /^(NL|BB|WR)/.test(item)) || "";
    return { fromLocation, toLocation, towSpot, source: "written" };
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

export function parseTowPlan(text) {
  return String(text)
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !/^RONS$/i.test(block))
    .flatMap(parseBlock);
}
