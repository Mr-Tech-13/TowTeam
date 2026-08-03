import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const helperPath = path.join(rootDir, "server/scripts/fillTowPermit.py");

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    timeZone: "America/New_York"
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/New_York"
  }).format(new Date(value));
}

function safeText(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").trim();
}

function fitText(text, maxLength = 34) {
  const cleaned = safeText(text);
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function airlineCode(value) {
  return safeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function bypassPinCompletionReasonForAirline(value) {
  const code = airlineCode(value);
  if (code === "EK") return "Bypass pin left in";
  if (code === "MX") return "N/A - No bypass pin";
  return "";
}

export function towPrepStep6ReasonForAirline(value) {
  const code = airlineCode(value);
  if (code === "MX") return "N/A";
  return "";
}

export function towPermitTemplatePath() {
  return path.resolve(rootDir, process.env.TOW_PERMIT_TEMPLATE_PATH || "./data/TowPermit.pdf");
}

export function towPermitFilename(tow) {
  const reg = safeText(tow.tailNumber || "aircraft").replace(/[^a-z0-9-]+/gi, "_");
  const date = formatDate(tow.towCompletedAt || tow.towStartedAt || tow.createdAt).replaceAll("/", "-") || "tow";
  return `tow-checklist-${reg}-${date}.pdf`;
}

function towPermitPayload(tow, templatePath) {
  const startValue = tow.towStartedAt || tow.setupStartedAt;
  const finishValue = tow.towCompletedAt;
  const bypassPinCompletionReason = bypassPinCompletionReasonForAirline(tow.airline);
  const towPrepStep6Reason = towPrepStep6ReasonForAirline(tow.airline);
  return {
    templatePath,
    towPrepStep6Exception: Boolean(towPrepStep6Reason),
    bypassPinCompletionException: Boolean(bypassPinCompletionReason),
    fields: {
      Airline: fitText(tow.airline, 14),
      "Aircraft Reg": fitText(tow.tailNumber, 14),
      "Aircraft Type": fitText(tow.aircraftType, 22),
      Date: formatDate(finishValue || startValue || tow.createdAt),
      "Start Time": formatTime(startValue),
      "Finish Time": formatTime(finishValue),
      "Tow from": fitText(tow.gate, 26),
      "Tow to": fitText(tow.towSpot, 26),
      "Tractor Driver": fitText(tow.driver, 28),
      "Wing Walker LH": fitText(tow.leftWingWalker, 28),
      "Brake Operator": "MX",
      "Wing Walker RH": fitText(tow.rightWingWalker, 28),
      "Headset Operator": fitText(tow.driver, 28),
      "Other team": fitText(tow.otherTeamMembers, 62),
      undefined_26: "In Pushback",
      undefined_11: fitText(towPrepStep6Reason, 34),
      undefined_44: fitText(bypassPinCompletionReason, 34)
    }
  };
}

export async function generateTowPermitPdf(tow, options = {}) {
  const templatePath = options.templatePath || towPermitTemplatePath();
  const pythonBin = options.pythonBin || process.env.PDF_PYTHON_BIN || "python3";
  let child;
  try {
    child = spawn(pythonBin, [helperPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });
  } catch (error) {
    error.code = error.code || "PYTHON_UNAVAILABLE";
    throw error;
  }

  const chunks = [];
  const errorChunks = [];

  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stderr.on("data", (chunk) => errorChunks.push(chunk));

  child.stdin.end(JSON.stringify(towPermitPayload(tow, templatePath)));

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", (error) => {
      error.code = error.code || "PYTHON_UNAVAILABLE";
      reject(error);
    });
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    const message = Buffer.concat(errorChunks).toString("utf8").trim() || "Unable to generate tow checklist PDF.";
    const error = new Error(message);
    if (message.includes("No such file") || message.includes("not found")) error.code = "ENOENT";
    if (message.includes("No module named")) error.code = "PYTHON_MODULE_MISSING";
    throw error;
  }

  return Buffer.concat(chunks);
}
