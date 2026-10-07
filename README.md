# TowTeam

TowTeam is a self-hostable aircraft tow planning, workflow tracking, completion summary, and history database app. It is built for ramp use: dark theme, large touch controls, fast cards, mobile-first layout, and SQLite by default.

## Features

- Dashboard for active tows
- Manual tow creation
- Bulk copy/paste import with review before saving
- Parser support for messy flight/gate/aircraft reg/tow spot text
- Shorthand parsing for `34 > NL`, `Gate 34 > NL`, `G34 < NL614`, and related formats
- Workflow logging with timestamps
- Required GOAA steps for West Ramp / WR tows
- Completed tow plain-text summaries
- Downloadable Aircraft Towing Checklist PDFs generated from tow details
- Searchable history by date, aircraft reg, flight number, tow from, and tow to
- Historical edit/delete with confirmation
- CSV export
- Excel-compatible history export with date range and tow filters
- Login with session-based local users
- Admin user management for creating users, deleting users, changing passwords, and assigning roles
- SQLite database with migrations and seed data
- Docker and docker-compose deployment
- CI workflow for lint, test, build, and Docker build

## Quick Start

### Upgrading to v3.0.0

Back up the SQLite database before upgrading. Startup applies migration
`015_preserve_legacy_tow_papers.js` once, in a transaction. Every existing tow without
an editor draft receives a saved paper using the legacy airline-based checklist rules
and green risk selections. Existing editor drafts are left completely unchanged.
This includes active, completed, and soft-deleted tows already present at upgrade.
Tows created afterward automatically receive tow details and crew names, but checklist
answers and risk selections remain blank until edited or explicitly autofilled by an
authorized user. Previously downloaded PDF files are not changed. The migration preserves
paper answers, not an immutable copy of each formerly generated PDF.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The dev UI runs through Vite at `http://localhost:5173` and proxies API requests to the server at `http://localhost:8080`.

Production-style local run:

```bash
npm install
npm run build
npm run start
```

Open `http://localhost:8080`.

## Docker

```bash
cp .env.example .env
docker compose up -d
```

Before hosting with Docker, edit `.env` and replace `ADMIN_PASSWORD=change-me-now`. The first startup creates the initial admin account if no users exist. If the password is left blank or as a placeholder, TowTeam generates a random password and saves it to `data/initial-admin-password.txt` instead of printing it in server logs. The app is exposed at `http://localhost:8080`. SQLite data is stored in `./data`.

To enable the tow paper editor and PDF downloads, place the original blank checklist at
`data/TowPermit.pdf` or set `TOW_PERMIT_TEMPLATE_PATH` in `.env`. Startup automatically
renders its three pages and extracts form fields into `data/paper-editor-assets/`.
Cached assets are reused unless the template changes or an asset is missing. The PDF
and generated private assets are Git-ignored and excluded from Docker build contexts;
they are served only through authenticated editor routes, never as public static files.
For a Docker image deployment, mount your private data directory at `/app/data`.
Both Docker deployment paths include the editor code, Python dependencies, and Poppler.
For a non-Docker host, install Python with `requirements.txt` and Poppler (`pdftoppm`).
Set `PDF_PYTHON_BIN` when Python is not available as `python3`; optionally set
`TOW_PAPER_ASSETS_PATH` to another writable private cache directory. A missing PDF
leaves the main app available without PDF editing; an invalid template or rendering
failure stops startup with a diagnostic instead of serving stale template assets.

The default Compose setup does not build a custom image. It runs the official Node image, mounts this project into the container, stores container dependencies in a named volume, builds the web UI on startup, and starts the server. After pulling code changes, use:

```bash
docker compose up -d
```

If you only changed files while the container is already running, restart it so the startup build runs again:

```bash
docker compose restart towteam
```

The `Dockerfile` remains available for immutable image builds when you specifically want one:

```bash
docker build -t towteam .
```

## Configuration

Copy `.env.example` to `.env`.

```bash
PORT=8080
HOST=0.0.0.0
DATABASE_URL=./data/towteam.sqlite
NODE_ENV=development
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-now
CORS_ORIGIN=
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=300
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=20
ISSUE_RATE_LIMIT_WINDOW_MS=60000
ISSUE_RATE_LIMIT_MAX=10
PAGE_RATE_LIMIT_WINDOW_MS=60000
PAGE_RATE_LIMIT_MAX=600
TOW_PERMIT_TEMPLATE_PATH=./data/TowPermit.pdf
PDF_PYTHON_BIN=python3
```

On first startup, TowTeam creates an admin user from `ADMIN_USERNAME` and `ADMIN_PASSWORD` when the users table is empty. If `ADMIN_PASSWORD` is unset or still a placeholder, a random password is saved to `data/initial-admin-password.txt`. Log in as that user, then change the password from the admin user-management screen and remove the password file. Same-origin browser use does not require `CORS_ORIGIN`; set it only when a separate frontend origin must call the API.

Rate limiting is enabled by default for API requests, login attempts, issue reporting, and frontend page fallback routes. The rate limit values above can be adjusted for your deployment.

## Admin Maintenance

The Airlines tab lets admins add airline codes, edit names and colors, and remove airlines from the dropdown. Existing tow records retain their codes when an airline is removed. Manual entry does not require a flight number or ETA; imported flight details are retained.

Tow cards use red outlines for Needs Review, white for physical tow completion or paperwork completion, blue for planned tows, and yellow for in-progress tows. Needs Review takes priority. The small swatch beside the airline code uses its admin-configured color.

Admin users can use the admin page for user management, issue reports, audit logs, trash, and database backup/restore.

- Deleting a tow from the app now moves it to Trash first.
- Trash allows admins to restore a tow or permanently delete it with double confirmation.
- Audit log entries for tow edits include before/after details.
- Backup downloads a SQLite backup from the running database.
- Restore accepts a SQLite backup upload, creates a pre-restore backup, swaps in the uploaded database, and restarts the app.

## Tests

```bash
npm test
npm run lint
npm run build
```

Parser tests cover the provided messy sample, bad flight spacing, missing tow spots, multi-flight blocks, shorthand directions, and shorthand/written direction conflicts.

## Import Notes

The importer splits pasted plans on blank lines, ignores headers like `RONS`, detects flight lines such as `MX524 ILM 1232` and `MX 247 CAK 1832`, and detects gates such as `GATE 30`, `Gate 33`, `GATE31`, and `gate  33`.

Tow spots normalize these forms:

- `NL###`, `BB###`, `WR###`
- `NL`, `BB`, `WR`
- `Bird Bath` to `BB`
- `West Ramp` to `WR`
- `North Lot` to `NL`

Spot codes without a number are saved but flagged `Needs Review`.

To add or remove tow spots in code, edit `shared/towSpots.js`. Use `numberRequired: true` for spot families like `NL614`, where plain `NL` should be flagged for review. Use `numberRequired: false` for exact hardstand-style spots like `30A`.

## API

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/users` admin only
- `POST /api/users` admin only
- `PUT /api/users/:id` admin only
- `PUT /api/users/:id/password` admin only
- `DELETE /api/users/:id` admin only
- `GET /api/tows`
- `GET /api/tows?status=active`
- `GET /api/tows/export.csv`
- `GET /api/tows/export.xls`
- `GET /api/tows/:id/tow-checklist.pdf`
- `GET /api/tows/:id/tow-checklist.pdf?preview=true`
- `POST /api/tows/parse`
- `POST /api/tows`
- `POST /api/tows/bulk`
- `PATCH /api/tows/bulk/aircraft-type`
- `GET /api/tows/:id`
- `PUT /api/tows/:id`
- `POST /api/tows/:id/steps/:step`
- `DELETE /api/tows/:id` soft delete
- `POST /api/tows/:id/restore` admin only
- `DELETE /api/tows/:id/permanent` admin only
- `GET /api/maintenance/backup.sqlite` admin only
- `POST /api/maintenance/restore.sqlite` admin only

Workflow step names:

- `setupStartedAt`
- `goaaCalledAt`
- `goaaArrivalAt`
- `towStartedAt`
- `towCompletedAt`
