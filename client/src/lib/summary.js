function fmtTime(value) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/New_York"
  }).format(new Date(value));
}

function fmtDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    timeZone: "America/New_York"
  }).format(new Date(value));
}

export function fmtDateTime(value) {
  if (!value) return "Waiting";
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/New_York"
  }).format(new Date(value));
}

export function completedSummary(tow) {
  const otherTeam = cleanOptionalNameList(tow.otherTeamMembers);
  return [
    tow.tailNumber || "Tail unknown",
    `From ${tow.fromLocation || "Unknown"} to ${tow.toLocation || tow.towSpot || "Unknown"}`,
    `${fmtTime(tow.pushStartedAt || tow.towStartedAt)}-${fmtTime(tow.towCompletedAt)}`,
    `Tow Conductor ${tow.driver || ""}`.trim(),
    `LWW ${tow.leftWingWalker || ""}`.trim(),
    `RWW ${tow.rightWingWalker || ""}`.trim(),
    otherTeam ? `Other Team: ${otherTeam}` : "",
    fmtDate(tow.towCompletedAt || tow.updatedAt)
  ]
    .filter(Boolean)
    .join("\n");
}

function cleanOptionalNameList(value) {
  const cleaned = String(value || "")
    .replace(/^other\s+team\s*:?\s*/i, "")
    .trim();
  if (!cleaned || ["none", "n/a", "na", "-", "--"].includes(cleaned.toLowerCase())) return "";
  return cleaned;
}

export function isWestRamp(tow) {
  return [tow.toLocation, tow.towSpot].some((value) => String(value || "").toUpperCase().startsWith("WR"));
}
