# TowTeam

TowTeam is a self-hostable aircraft tow planning, workflow tracking, completion summary, and history database app. It is built for ramp use: dark theme, large touch controls, fast cards, mobile-first layout, and SQLite by default.

## Features

- Dashboard for active tows
- Manual tow creation
- Bulk copy/paste import with review before saving
- Parser support for messy flight/gate/tail/tow spot text
- Shorthand parsing for `34 > NL`, `Gate 34 > NL`, `G34 < NL614`, and related formats
- Workflow logging with timestamps
- Required GOAA steps for West Ramp / WR tows
- Completed tow plain-text summaries
- Searchable history by date, tail number, flight number, gate, and tow spot
- Historical edit/delete with confirmation
- CSV export
- Excel-compatible history export with date range and tow filters
- Login with session-based local users
- Admin user management for creating users, deleting users, changing passwords, and assigning roles
- SQLite database with migrations and seed data
- Docker and docker-compose deployment
- CI workflow for lint, test, build, and Docker build

## Quick Start

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

Before hosting with Docker, edit `.env` and replace `ADMIN_PASSWORD=change-me-now`. The first startup creates the initial admin account if no users exist. If the password is left blank or as a placeholder, TowTeam generates a random password and prints it in the server logs. The app is exposed at `http://localhost:8080`. SQLite data is stored in `./data`.

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
```

On first startup, TowTeam creates an admin user from `ADMIN_USERNAME` and `ADMIN_PASSWORD` when the users table is empty. If `ADMIN_PASSWORD` is unset or still a placeholder, a random password is printed in the server logs. Log in as that user, then change the password from the admin user-management screen. Same-origin browser use does not require `CORS_ORIGIN`; set it only when a separate frontend origin must call the API.

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
- `POST /api/tows/parse`
- `POST /api/tows`
- `POST /api/tows/bulk`
- `GET /api/tows/:id`
- `PUT /api/tows/:id`
- `POST /api/tows/:id/steps/:step`
- `DELETE /api/tows/:id`

Workflow step names:

- `setupStartedAt`
- `goaaCalledAt`
- `goaaArrivalAt`
- `pushStartedAt`
- `towStartedAt`
- `towCompletedAt`
