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
docker compose up --build
```

Before hosting with Docker, edit `.env` and replace `LOCAL_AUTH_PASSWORD=change-me`. The app is exposed at `http://localhost:8080`. SQLite data is stored in `./data`.

## Configuration

Copy `.env.example` to `.env`.

```bash
PORT=8080
HOST=0.0.0.0
DATABASE_URL=./data/towteam.sqlite
NODE_ENV=development
ENABLE_LOCAL_AUTH=false
LOCAL_AUTH_USERNAME=admin
LOCAL_AUTH_PASSWORD=change-me
CORS_ORIGIN=
ALLOW_UNAUTHENTICATED=false
```

For hosted production deployments, set `NODE_ENV=production`, `ENABLE_LOCAL_AUTH=true`, and replace `LOCAL_AUTH_PASSWORD` with a strong password. Production startup refuses unauthenticated hosting unless you explicitly set `ALLOW_UNAUTHENTICATED=true`. Same-origin browser use does not require `CORS_ORIGIN`; set it only when a separate frontend origin must call the API.

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
- `GET /api/tows`
- `GET /api/tows?status=active`
- `GET /api/tows/export.csv`
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
