# TowTeam

TowTeam is a self-hosted aircraft tow planning, workflow tracking, and history app.
It uses React/Vite, Express, and SQLite, with a mobile-friendly dark interface.
The current version is **3.0.2**. The on-screen version is read from
`package-lock.json` when the frontend is built.

## Features

- Active tow cards, manual creation, and copy/paste bulk import with review before saving.
- Airline codes, names, colors, and airline-specific aircraft-type dropdowns.
- Workflow timestamps, conditional GOAA controls for West Ramp tows, and undo of the last step.
- Completed tow summaries, searchable/paginated History, and editable tow details.
- Shared, autosaved checklist paper drafts, PDF preview/download, and History PDF/ZIP exports.
- CSV and Excel-compatible tow-data exports.
- Local user accounts, admin management, audit logs, issue reports, and tow Trash.
- SQLite migrations, local-administrator database backup/restore, and Docker deployment.

Cards show the registration and airline code, not the flight number. The configured
airline color forms a stripe across the top. Only Needs Review gets a special red
outline and warning badge; workflow status is shown separately in the status badge.

## Requirements

**Docker Compose:** Docker with the Compose plugin. Node and Python are installed
inside the container; they do not need to be installed on the host.

**Direct installation:** Node.js 24 or newer, npm, and (for paper editing/export)
Python with the packages in `requirements.txt` plus Poppler's `pdftoppm` executable.
Native C/C++ build tools are needed if `better-sqlite3` cannot use a prebuilt binary.
The Docker configurations include these tools and PDF dependencies.

The private checklist template is not included in the repository. See
[Tow Paper Setup](#tow-paper-setup) before enabling the editor.

## Docker Compose

From the repository directory:

```bash
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` instead. Edit `.env` and set a
unique `ADMIN_PASSWORD` before the first startup. Place the supported blank PDF at
`data/TowPermit.pdf` if you want paper editing and downloads.

```bash
docker compose up -d
docker compose logs -f --tail=100 towteam
```

The service publishes port **8080** and stores its database at
`./data/towteam.sqlite`. Compose overrides `NODE_ENV` to `production`, the container
database path to `/app/data/towteam.sqlite`, and the listen address to `0.0.0.0:8080`.

**For public hosting, put the service behind an HTTPS reverse proxy.** The app does
not provide TLS itself. Production session cookies are marked `Secure`, so ordinary
remote plain-HTTP access is not a supported login setup. Restrict direct access to
the backend port as appropriate for your proxy/network.

The default Compose file uses `node:24-bookworm-slim`, mounts the checkout, and keeps
Node dependencies in a named volume. On container startup it installs dependencies,
builds the frontend, and starts Express. It does **not** use the repository's
Dockerfile or build a custom image, and startup needs package-download access.

### Updating

Back up the database and private files first, then run:

```bash
git pull
docker compose up -d --force-recreate
docker compose logs -f --tail=100 towteam
```

Recreation reruns the startup build. `docker compose up -d` alone may leave an
unchanged service running with its previous frontend build. To refresh the upstream
Node image too, run `docker compose pull towteam` before recreating.

The separate `Dockerfile` supports an image build with `docker build -t towteam .`.
When deploying that image, provide runtime configuration and mount the private data
directory at `/app/data`; private PDFs and database files are excluded from the
build context.

## Direct Installation And Development

Copy `.env.example` to `.env`, set the initial admin password, and install dependencies:

```bash
npm ci
python3 -m pip install -r requirements.txt
```

Install Poppler separately and ensure `pdftoppm` is on `PATH`. If your Python command
is `python` rather than `python3`, use that command for installation and set
`PDF_PYTHON_BIN=python` in `.env`. A Python virtual environment can also be used by
setting `PDF_PYTHON_BIN` to its interpreter path.

Development:

```bash
npm run dev
```

Open `http://localhost:5173`. Vite proxies the API and favicon to port 8080. For a
single-service local test with the built frontend:

```bash
npm run build
npm run start
```

Open `http://localhost:8080`. The example configuration uses `NODE_ENV=development`
for local HTTP testing. For public deployment, use `NODE_ENV=production`, HTTPS,
and a process supervisor; `npm run start` itself does not automatically restart.

Migrations run automatically on server startup. `npm run db:migrate` can also run
them explicitly. **Do not run `npm run db:seed` as an upgrade step:** it inserts
three sample tows every time it runs. Use it only for a disposable/demo database.

## Configuration And First Login

`.env.example` is the configuration reference. Important settings:

| Variable | Example/default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Server listen port/address. |
| `DATABASE_URL` | `./data/towteam.sqlite` | SQLite file path, not a network database URL. |
| `NODE_ENV` | `development` in the example | `production` enables Secure session cookies and production CORS behavior. |
| `ADMIN_USERNAME` | `admin` | Initial account name, used only when no users exist. |
| `ADMIN_PASSWORD` | `change-me-now` in the example | Replace with a unique password; placeholders trigger password generation. |
| `CORS_ORIGIN` | empty | Comma-separated allowed frontend origins; not needed for same-origin use. |
| `TOW_PERMIT_TEMPLATE_PATH` | `./data/TowPermit.pdf` | Private supported blank checklist template. |
| `TOW_PAPER_ASSETS_PATH` | `./data/paper-editor-assets` | Writable private generated-asset cache. |
| `PDF_PYTHON_BIN` | `python3` | Python interpreter for PDF preparation/export. |
| `PAPER_BACKUP_ENABLED` | `false` | Enable completed-paper folder backups. |
| `PAPER_BACKUP_PATH` | `./data/paper-backups` in the example | Destination folder, created automatically if needed. |

Rate limits are configurable through the corresponding `*_RATE_LIMIT_WINDOW_MS`
and `*_RATE_LIMIT_MAX` settings. Defaults are 300 API requests/minute, 20 login
attempts/15 minutes, 10 issue-route requests/minute, and 600 frontend fallback
requests/minute. These do not replace HTTPS, access controls, or deployment hardening.

The first startup with an empty users table creates the protected **local
administrator**. An unset password or one of `admin`, `change-me`, or `change-me-now`
causes a random password to be written to `initial-admin-password.txt` beside the
database, normally in `data/`. Change the password through user management and
remove that file afterward. Changing bootstrap environment variables does not
change an existing account's credentials.

## Tow Workflow And Search

The normal UI workflow logs setup, GOAA call/arrival when applicable, tow start,
physical tow completion, and finally paperwork completion. Physical completion
alone leaves the tow active; marking the paperwork complete moves it to History.
These are recorded workflow events, not validation that every PDF answer is filled.

Active and History use matching search bars, applying a search after a **350 ms**
typing pause. Search covers airline codes and flight numbers, registration, aircraft type,
locations, crew, status, and the displayed date. Each tab retains its visible search
text on return; clearing it removes the filter. History searches all matching
completed records before pagination, with page sizes of 5, 10, 25, 50, or 100.

Failed workflow timestamp requests can be queued in browser storage and retried
when connectivity returns. This is not full offline support: tow editing and
connected paper drafts still require the server.

## Tow Paper Setup

Use the original supported **blank three-page, letter-size (612 x 792 point)**
checklist with its expected form fields and 50 Yes/No checkbox widgets. The editor
uses this specific layout; it is not a general-purpose editor for arbitrary PDFs.

At startup, Python extracts the form field layout and Poppler renders the pages into
`TOW_PAPER_ASSETS_PATH`. Assets are reused when the source hash and expected files
match, and rebuilt when needed. The source PDF is not modified.

A missing source PDF logs a warning and allows the main app to start. Existing
cached assets may still work, but without a usable cache the editor and PDF exports
will fail. A present but incompatible template, missing rendering dependency, or
preparation failure stops startup with an error.

The editor runs inside the same service at `/api/paper-editor/`, opened from a tow's
**Edit Tow Paper** button. Its pages and template assets require authentication;
the private files are not exposed as public static downloads.

### Drafts And Autofill

- Tow details and crew populate automatically. New tows start with blank checklist answers and risk selections.
- Drafts are shared between users and stored in SQLite, with autosave after a 600 ms editing pause.
- Concurrent edits are revision-protected. A conflict pauses autosave; refresh/reopen to load the saved draft, taking care not to lose unsaved edits.
- Saving changed tow details updates the corresponding saved paper fields while preserving unrelated answers and comments. An already-open editor must refresh/reopen to load external updates.
- Reset clears checklist answers, exception comments, and risk selections, not tow details, crew, or the TTWS tester field.
- Menu saves pending edits before returning to that tow's detail view. On mobile, checklist/risk controls live in a drawer and the paper can scroll.
- Preview/download in the tow detail view generates the current saved paper. There are no separate manual save, reload, or download controls in the connected editor.

Only users granted **Autofill** can click the plain CHECKLIST heading to apply it.
Autofill fills unanswered items, blank exception comments, and blank risk selections
(green); it preserves existing answers and risk choices. A220 rules include N/A for
preparation step 6 and completion step 5 (no bypass pin). MX with no aircraft type
uses the no-pin fallback; EK has the bypass-pin-left-in exception when applicable.
The during-tow exception uses "In Pushback". These defaults must still be reviewed
against the actual tow; they do not mark the workflow complete.

The current automatic Brake Operator default is `MX`, and Headset Operator defaults
to the driver. Users can edit these paper fields when different values are needed.

Generated PDFs contain the rendered template pages with saved entries overlaid.
TowTeam stores draft data, not immutable original PDF files for each tow.

## Exports

| History action | Records included | Output |
| --- | --- | --- |
| CSV | All records matching the History filter, across pages | Tow-data CSV. |
| Excel | All records matching the History filter, across pages | HTML table with an `.xls` extension, not a native XLSX workbook. |
| Download PDF / ZIP | Only cards on the currently displayed History page | One PDF for one tow; a ZIP containing uniquely named PDFs for multiple tows. |

PDF/ZIP exports use the current saved paper state and respect the visible search and
pagination, with at most 100 completed tows per request. Multi-tow ZIP exports are
limited to 200 MiB of generated PDF payload before packaging. They are not snapshots
of previously downloaded papers.
The History bulk aircraft-type panel has been removed; its API remains available.

Admins can also use **Export Active Tow Papers** in Settings to download every
currently active, non-deleted tow's saved paper, independent of tab search filters.
One tow downloads a PDF; multiple tows download `active-tow-papers.zip`. The same
100-tow and ZIP payload limits apply. An empty active list produces a message rather
than an empty archive.

## Administration And Backups

Regular users can create/edit tows, record workflow events, edit shared papers, and
export data. Admins additionally manage ordinary user accounts, airline settings,
global settings, issue reports, audit logs, and Trash.

The protected local administrator identity is independent of username. Only that
account can manage Autofill permissions and use database backup/restore. Other
admins cannot view/manage those permission settings or modify the protected account.
The local administrator cannot be deleted or demoted, and its identity cannot be
assigned through the user API.

Airlines settings define codes, names, colors, and available aircraft types per
airline. Removing an airline does not erase its code from existing tows. Manual tow
entry has no flight-number or ETA fields; imported values are retained.

The Bulk Import setting enables/disables the import UI and parse/bulk endpoints
**for everyone**, including admins. It is enabled by default.

Favicon upload/reset is available to admins in Settings. Uploads must be PNG,
at most **256 KiB** and **512 x 512 pixels**; they are decoded/re-encoded before
storage. The file lives in `branding/favicon.png` beside the database. The favicon
is public so it can appear before login; tow papers remain authenticated.

Deleting a tow moves it to Trash. Admins can restore it or permanently delete it
with confirmation. Tow-edit audit entries include before/after details.

Database backup creates a SQLite snapshot and keeps a copy in a `backups/` directory
beside the database. It includes tows, paper drafts, users/permissions, sessions,
airlines/aircraft types/colors, settings, issues, audit records, and migrations.
It does **not** include the PDF template, generated assets, uploaded favicon,
application code, or `.env`. Back up those private files separately.

Restore accepts a TowTeam SQLite backup up to 200 MB, checks required tables, creates
a pre-restore backup, replaces the database, and exits the process. Compose's
`restart: unless-stopped` restarts it; a direct installation needs a supervisor or
manual restart. Migrations run on the next startup.

## Folder Backups

Completed-paper backups write to an ordinary folder. There is no NAS connection
setup, marker file, or Test Connection action. Configure the destination in `.env`:

```dotenv
PAPER_BACKUP_ENABLED=true
PAPER_BACKUP_PATH=./data/paper-backups
```

The folder is created automatically if needed. With the default Compose data bind,
files in `/app/data/paper-backups` inside Docker appear in `./data/paper-backups`
on the host. A different destination must be accessible and writable by the running
app; a host folder outside the existing binds must still be passed into Docker.
Relative paths resolve from the app's working directory. Restart after changing
configuration.

Existing `NAS_BACKUP_ENABLED` and `NAS_PDF_PATH` settings remain supported as
fallbacks, so existing folder mappings keep working. The new settings take precedence.
The optional `docker-compose.nas.yml` remains available for existing external-folder
binds using `NAS_MOUNT_PATH`; it is unnecessary for the default data folder.

When enabled, completing paperwork queues its saved state in SQLite. The worker
generates a PDF in memory, writes a temporary file directly in the destination,
reads it back to verify its SHA-256 checksum, then renames it over `tow-ID.pdf`.
Saved paper edits or mapped tow-detail changes replace only that tow's file.
Unchanged saves do not duplicate work; superseded generations are skipped.

Jobs survive restarts. Failed writes retry with increasing delays capped at one
hour, regenerating the PDF from the queued state. No local PDF cache is used.
Old `data/paper-backup-cache/` files are cleaned up after an hour. Reopening or
deleting a tow cancels pending work without deleting existing destination papers.

Settings shows the folder, progress, pending/failed counts, and latest 50 non-uploaded
jobs. Successfully uploaded papers disappear from the list but remain counted in totals.
**Transfer Pending** retries outstanding writes. **Replace All Completed** queues
all completed papers again after confirmation. **Clear Queue** skips pending work
without deleting PDFs; skipped versions stay cleared across polls/restarts until
the paper changes or a replacement is explicitly requested. These controls are
restricted to the local administrator. Write failures identify the failed operation.

The worker polls every 10 seconds and writes sequentially. Enabling it also queues
existing completed tows without a current backup record. Run only one worker per
database and give different databases separate folders to avoid tow-ID collisions.
The database backup includes queue state and metadata, not the PDF files. Back up
the destination separately. After changing destinations or restoring mismatched
upload records, use **Replace All Completed** to repopulate the folder.

## Import Notes

The parser supports blank-line-separated flight blocks, spaced flight numbers,
gate text, registrations, written directions, and shorthand such as
`34 > NL614` or `G34 < NL614`. It also supports the structured Arrival/Departure,
Tow off, and Towing back plan format.

Known import destinations include numbered `NL`, `BB`, and `WR` spots, exact `30A`
and `32A`, and hardstands `254A` through `254P` (including ranges such as `254A-C`).
North Lot, Bird Bath, and West Ramp names normalize to their respective codes.

The parser can flag a bare `NL`, `BB`, or `WR` as needing an exact number, but the
application's parse/bulk endpoints **exclude missing or unknown tow spots**, including
those bare codes. They are not automatically saved as review cards by bulk import.
Other parsing warnings can still require review of accepted records.

Edit `shared/towSpots.js` to configure numbered families and exact spots. Hardstand
parsing is additionally implemented in `server/services/parser.js`.

## Upgrade Notes

Node 24 is required starting with v3.0.1. Direct installations should use `npm ci`
after changing Node versions to install the matching SQLite native dependency,
then rebuild and restart. The original v3.0.1/v3.0.2 updates needed no new migration;
the folder backup feature adds `016_paper_backups.sql`, applied automatically at startup.
Back up the database before deploying it. Folder backups remain disabled by default.

When upgrading from a pre-v3.0.0 database, migration
`015_preserve_legacy_tow_papers.js` runs once, transactionally. Existing active,
completed, and soft-deleted tows without drafts get saved papers using the old
airline-based checklist rules and green risk selections. Existing drafts are left
unchanged. Later tows start with blank answers/risk selections. This preserves
legacy answers, not byte-identical copies of old generated PDFs; already downloaded
files are not modified.

## Private Files And Required Editor Code

Git ignores PDFs, SQLite database/WAL files, `.env` secrets, the default generated
paper assets, `data/branding/`, `.vscode/`, and `actions-runner/`. Custom asset/branding
locations may need additional ignore rules. Ignore rules do not untrack previously
committed files or remove them from Git history.

Despite its directory name, `prototypes/tow-paper-editor/index.html`, `editor.js`,
and `editor.css` are **required production editor code** and must remain tracked.
Only private document-derived assets in that directory are ignored. Do not delete
the editor directory from a deployment.

## API Overview

Session authentication is required for `/api` routes except health and
login/logout/session inspection. Access restrictions are also enforced server-side.

| Routes | Purpose/access |
| --- | --- |
| `GET /api/health`; `POST /api/auth/login`; `POST /api/auth/logout`; `GET /api/auth/me` | Public health/authentication endpoints. |
| `GET /api/tows`; `GET /api/tows/:id`; `POST /api/tows`; `PUT /api/tows/:id` | List/read/create/edit tows. Use `status=active` or `status=completed`; `paginated=true&page=1&pageSize=10` enables pagination. |
| `POST /api/tows/parse`; `POST /api/tows/bulk` | Import; blocked for everyone when Bulk Import is disabled. |
| `PATCH /api/tows/bulk/aircraft-type` | Retained bulk aircraft-type API; no longer exposed in History. |
| `POST /api/tows/:id/steps/:step`; `POST /api/tows/:id/steps/undo` | Record a workflow step / undo the last step. |
| `DELETE /api/tows/:id` | Soft-delete a tow. |
| `POST /api/tows/:id/restore`; `DELETE /api/tows/:id/permanent` | Admin-only Trash operations. |
| `GET /api/tows/export.csv`; `GET /api/tows/export.xls` | Filtered tow-data exports. |
| `GET /api/tows/:id/tow-checklist.pdf` | Current saved paper; `preview=true` requests inline display. |
| `POST /api/tows/paper-export` | Completed tow PDF/ZIP export with `{ "ids": [1, 2] }`; admins can export all active papers with `{ "scope": "active" }`. |
| `GET /api/tows/:id/paper-draft`; `PUT /api/tows/:id/paper-draft` | Shared draft read/save; saves require state and revision. |
| `POST /api/tows/:id/paper-draft/autofill` | Requires the user's Autofill permission and current revision. |
| `GET /api/airlines`; `POST /api/airlines`; `PUT /api/airlines/:code`; `DELETE /api/airlines/:code` | Read airlines; writes are admin-only. |
| `GET /api/settings`; `PUT /api/settings`; `PUT /api/settings/favicon`; `DELETE /api/settings/favicon` | Read settings; writes are admin-only. Favicon upload uses binary PNG. |
| `GET /api/users`; `POST /api/users`; `PUT /api/users/:id`; `PUT /api/users/:id/password`; `DELETE /api/users/:id` | Admin user management, subject to local-administrator protections. |
| `POST /api/issues`; `GET /api/issues`; `PATCH /api/issues/:id` | Submit issues; listing/updating requires admin. |
| `GET /api/audit` | Admin audit access; Autofill details are restricted for other admins. |
| `GET /api/maintenance/backup.sqlite`; `POST /api/maintenance/restore.sqlite` | Local administrator only; restore uses binary `application/octet-stream`. |
| `GET /api/settings/paper-backups`; `POST /api/settings/paper-backups/retry`; `POST /api/settings/paper-backups/clear` | Local administrator folder status/retry/clear controls; retry accepts `{ "replace": true }` for replacing all completed papers. |

Workflow step identifiers are `setupStartedAt`, `goaaCalledAt`, `goaaArrivalAt`,
`pushStartedAt` (retained API support), `towStartedAt`, `towCompletedAt`, and
`towPaperCompletedAt`. List/export APIs also accept supported date/location/search
filters; separate date-range controls are not currently shown in History.

## Tests And Workflows

```bash
npm test
npm run lint
npm run build
```

`npm test` provisions a fresh temporary database per test file, ignores the
configured application database, and removes test databases afterward. Use this
runner rather than invoking `node --test` directly against a deployment.

CI uses Node 24 and Python 3.12, installs PDF/native build dependencies, and runs
lint, tests, frontend build, and Docker build. The security workflow audits
production dependencies (failing at high severity or above) and runs Gitleaks.
Passing these checks is not a guarantee that an internet-facing deployment is secure.

The included deployment workflow is site-specific: it targets a self-hosted Linux
runner, branch `init`, and checkout `/root/TowTeam`. Its Compose command does not
force recreation when the service configuration is unchanged. Adapt it to your
deployment and ensure updated source triggers a rebuild/restart; do not assume it
deploys every checkout automatically.
