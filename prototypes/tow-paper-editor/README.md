# Tow Paper Editor Prototype

Open `index.html` directly in a browser. No server or network connection is needed.

When opened directly, Save Draft stores answers in this browser only.
The main app also serves this editor at `/api/paper-editor/?tow=ID`, requiring a signed-in
session for the editor and every document asset. Open a tow and choose Edit Tow Paper.
In connected mode, tow details and crew are populated from the tow record; checklist
answers and risk selections start blank. Drafts are saved to the database for
other signed-in users. Revision checks reject stale writes instead of overwriting a
newer draft. Edits autosave after a short pause. Menu flushes pending saves.
Menu returns to the original tow view, not the dashboard. Save errors leave edits intact;
revision conflicts pause autosave until the shared draft is reloaded. Refresh the editor
to fetch another user's changes. The connected editor
shows only Menu and Reset in its action bar; use the tow detail page to preview or download.

The v3.0.0 upgrade migration preserves the legacy auto-generated answers for every
existing tow without a saved editor draft. Saved editor drafts are never overwritten.
Only tows created after that migration start with blank checklist and risk responses.

Finalization, approval validation, and automatic paperwork completion are not wired up.
The main site's Preview PDF and Checklist PDF buttons render this tow's currently saved
draft. Missing tow-detail fields are populated consistently in the editor and PDF;
existing manual values, including deliberately cleared fields, remain untouched.
When a tow detail changes, that corresponding field is synchronized to its saved paper
immediately, including bulk aircraft-type updates and workflow start/finish times.
Unchanged manual fields, checklist answers, comments, and risk selections are preserved.
The paper revision advances so an editor opened before the tow change cannot overwrite it.
Reset clears risk selections, checklist answers, and exception comments only, preserving
tow details and member names. The selected paper page scrolls beneath the toolbar.

Only the original local administrator can view or change the account-level Autofill permission in Administration > Users. This identity is independent of the username and cannot be granted through ordinary user administration. Existing installations designate the earliest administrator account; new installations designate the bootstrap administrator. Database backup and restore are also restricted to that account to prevent bypassing this boundary.
It is off by default, including for admins. Authorized users can click the plain
CHECKLIST heading to fill blank checklist responses and save them. The API rechecks
the permission on each request; it does not overwrite manual responses, tow details,
or existing risk selections. Blank risk selections default to green. Defaults include A220 preparation item 6 and completion item 5
as No with N/A comments, During Tow item 1 as No with In Pushback, and Emirates
completion item 5 as No with Bypass pin left in. MX records with no aircraft type
retain their previous no-bypass-pin defaults.

The downloaded PDF is a static three-page copy for viewing and printing. Draft answers
are persisted, but exported PDF files are not retained on the server as immutable records.
Blank responses remain blank; the editor never assumes checklist completion.

The supplied template has damaged embedded fonts when rewritten by pdf-lib. Export uses
200-dpi renders of the unchanged blank pages plus vector text, response marks, and risk
rings. The original file is not modified. Text too long to fit is rejected at export.

Assets include the rendered blank template, extracted field positions, and the MIT-licensed
pdf-lib browser build with its license. To regenerate assets, render the source with
`pdftoppm -scale-to 2200 -png SOURCE.pdf assets/page`, then run
`python extract_template.py SOURCE.pdf` from this directory.

Browser checks can be run from the repository root with `node prototypes/tow-paper-editor/verify.mjs`.
Set `PLAYWRIGHT_PACKAGE` to a Playwright installation if it is not available locally.
The checks use headless Edge and write temporary output to `tmp/pdf-review/`.
`verify-connected.mjs` tests the integrated app on port 8080 with the preview test login.
Do not run it against a production database.

For the connected app, provide only `data/TowPermit.pdf` (or configure
`TOW_PERMIT_TEMPLATE_PATH`). Startup generates the private document assets under
`data/paper-editor-assets/` automatically and reuses the cache on later starts.
Poppler and Python with the project's requirements are needed; Docker installs them.
The browser PDF library comes from the installed `pdf-lib` package. The standalone
prototype can still use manually generated assets in its own assets directory.
Private assets are Git-ignored and never copied to the public production frontend build.
