# Hydrant locator backend

Vercel serverless functions (`api/`) backed by PostgreSQL + PostGIS. Serves
hydrant data to the Expo app instead of the app bundling a static GeoJSON
file.

The whole project (this backend + the app, once it has a web frontend) is
meant to be deployed on Vercel, so there's no persistent server here — each
route in `api/` is a standalone function, and the database is expected to be
a serverless-friendly Postgres like [Neon](https://neon.tech) (which supports
the `postgis` extension) rather than a self-hosted instance.

## Local development

```bash
cd backend
cp .env.example .env
docker compose up -d      # Postgres + PostGIS, standing in for Neon locally
npm install
npm run import            # seed the DB from ../src/data/slovenia.json
npx vercel dev             # serves api/ on http://localhost:3000, matching prod routing
```

If Docker isn't available, point `DATABASE_URL` in `.env` at any Postgres 16+
instance with the `postgis` extension available, then run `psql -f schema.sql`
against it before `npm run import`.

## Endpoints

Hydrants:
- `GET /api/health`
- `GET /api/hydrants?minLat&minLon&maxLat&maxLon` — hydrants in a map viewport
- `GET /api/hydrants/nearby?lat&lon&limit` — nearest hydrants to a point
- `GET /api/hydrants/:id`

Accounts / teams (`uporabnik`/`skupina`/`paket`/`clanstvo`/`vozilo` — see
`schema.sql` for the full data model):
- `GET|POST /api/uporabniki`, `GET /api/uporabniki/:id`
- `GET|POST /api/skupine` (`POST` requires `lastnik_id`, `ime`, `lat`, `lon`;
  `st_sedezev` optional), `GET /api/skupine/:id`
- `GET|POST /api/paketi` (optional `?skupina_id=` filter on `GET`)
- `GET|POST /api/clanstva` (optional `?skupina_id=`/`?uporabnik_id=` filters)
- `GET|POST /api/vozila` (optional `?skupina_id=` filter on `GET`)

All `POST` endpoints return `400` on missing fields or constraint violations
(bad foreign key, invalid enum value, duplicate membership, etc.) instead of
a raw `500` — see `lib/dbError.js`.

## Deploying to Vercel

1. Create a [Neon](https://neon.tech) Postgres project, enable the `postgis`
   extension, and run `schema.sql` against it.
2. Run `npm run import` once (locally, pointed at the Neon connection string)
   to seed hydrant data, and `npm run seed` to fill the accounts/teams tables
   with test data.
3. Create a Vercel project from this repo with **Root Directory** set to
   `backend`.
4. Set the `DATABASE_URL` environment variable in Vercel to Neon's **pooled**
   connection string (routes through PgBouncer — required since each
   function invocation opens its own connection; see `lib/db.js`).

## Connecting the Expo app

Set `EXPO_PUBLIC_API_BASE_URL` in the repo root `.env` to this backend's
Vercel deployment URL (see `src/config.js`). Defaults to
`http://localhost:3000` for local development.

## Tests

```bash
npm test
```

Runs against `TEST_DATABASE_URL` (falls back to `DATABASE_URL`, then a local
`hydrants_test` database), calling the `api/` handler functions directly with
mock `req`/`res` objects — no server needed. CI
(`.github/workflows/backend-ci.yml`) spins up a disposable `postgis` service
container automatically.

## Web map support

The app's map (`src/Map.js` / `src/Map.web.js`) uses `react-native-maps` on
iOS/Android and `@teovilla/react-native-web-maps` (Google Maps JS SDK) on web.
The web build needs a Google Maps API key — set
`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in the repo root `.env` (see
`src/config.js`), otherwise the map area renders blank on web.

## TODO — open for anyone to pick up

- [ ] Provision the Neon project and complete the Vercel deployment above.
- [ ] Periodic re-sync job pulling fresh data from the Overpass API instead
      of the one-time static `slovenia.json` import (e.g. a Vercel Cron Job
      calling a dedicated `api/cron/resync.js`).
- [ ] `POST /api/hydrants/:id/report` — let users flag incorrect/missing data.
