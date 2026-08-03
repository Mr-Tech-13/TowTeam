import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bypassPinCompletionReasonForAirline, generateTowPermitPdf, towPermitFilename, towPrepStep6ReasonForAirline } from "../services/towPermit.js";

const bundledPython = "/Users/maxxshearey/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

async function pythonBin() {
  try {
    await fs.access(bundledPython);
    return bundledPython;
  } catch {
    return process.env.PDF_PYTHON_BIN || "python3";
  }
}

function createFillableTemplate(templatePath, python) {
  execFileSync(python, [
    "-c",
    `
from reportlab.pdfgen import canvas
c = canvas.Canvas("${templatePath}", pagesize=(612, 792))
form = c.acroForm
fields = [
  ("Airline", 96, 682), ("Aircraft Reg", 224, 682), ("Aircraft Type", 359, 682),
  ("Date", 96, 666), ("Start Time", 224, 666), ("Finish Time", 359, 666),
  ("Tow from", 96, 649), ("Tow to", 324, 649),
  ("Tractor Driver", 124, 583), ("Wing Walker LH", 323, 583),
  ("Brake Operator", 124, 566), ("Wing Walker RH", 323, 566),
  ("Headset Operator", 124, 550), ("Tail Walker", 323, 550), ("Other team", 124, 522)
]
for name, x, y in fields:
    form.textfield(name=name, x=x, y=y, width=160, height=14, borderWidth=1)
c.showPage()
c.showPage()
c.showPage()
c.save()
`
  ]);
}

test("generates a tow checklist pdf from fillable form fields", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "towteam-permit-"));
  const templatePath = path.join(dir, "TowPermit.pdf");
  const python = await pythonBin();
  createFillableTemplate(templatePath, python);

  const pdfBytes = await generateTowPermitPdf(
    {
      airline: "MX",
      tailNumber: "N219BZ",
      gate: "Gate 36",
      towSpot: "NL614",
      driver: "Maxx",
      leftWingWalker: "Liam",
      rightWingWalker: "Jarod",
      otherTeamMembers: "Raul, Myke",
      towStartedAt: "2026-05-25T23:04:00.000-04:00",
      towCompletedAt: "2026-05-25T23:25:00.000-04:00",
      createdAt: "2026-05-25T22:00:00.000-04:00"
    },
    { templatePath, pythonBin: python }
  );

  assert.ok(pdfBytes.length > 1000);
  assert.match(towPermitFilename({ tailNumber: "N219BZ", towCompletedAt: "2026-05-25T23:25:00.000-04:00" }), /N219BZ/);
});

test("sets airline-specific bypass pin completion reasons", () => {
  assert.equal(bypassPinCompletionReasonForAirline("EK"), "Bypass pin left in");
  assert.equal(bypassPinCompletionReasonForAirline("MX"), "N/A - No bypass pin");
  assert.equal(bypassPinCompletionReasonForAirline("mx "), "N/A - No bypass pin");
  assert.equal(bypassPinCompletionReasonForAirline("AA"), "");
});

test("sets MX towing preparation step 6 to N/A", () => {
  assert.equal(towPrepStep6ReasonForAirline("MX"), "N/A");
  assert.equal(towPrepStep6ReasonForAirline("mx "), "N/A");
  assert.equal(towPrepStep6ReasonForAirline("EK"), "");
});
