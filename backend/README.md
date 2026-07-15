# Hydrant locator backend

Node.js/Fastify API backed by PostgreSQL + PostGIS. Serves hydrant data to the
Expo app instead of the app bundling a static GeoJSON file.

## Setup

```bash
cd backend
cp .env.example .env
docker compose up -d      # Postgres + PostGIS
npm install
npm run import            # seed the DB from ../src/data/slovenia.json
npm start                 # API on http://localhost:3000
```

If Docker isn't available, point `DATABASE_URL` in `.env` at any Postgres 16+
instance with the `postgis` extension available, then run `psql -f schema.sql`
against it before `npm run import`.

## Endpoints

- `GET /health`
- `GET /hydrants?minLat&minLon&maxLat&maxLon` — hydrants in a map viewport
- `GET /hydrants/nearby?lat&lon&limit` — nearest hydrants to a point
- `GET /hydrants/:id`

## Connecting the Expo app

Set `EXPO_PUBLIC_API_BASE_URL` in the repo root `.env` (see `src/config.js`).
Defaults to `http://localhost:3000`.

## TODO — open for anyone to pick up

- [ ] Deploy the backend somewhere reachable from a real device (Fly.io,
      Railway, or similar) instead of localhost-only.
- [ ] Periodic re-sync job pulling fresh data from the Overpass API instead
      of the one-time static `slovenia.json` import.
- [ ] `POST /hydrants/:id/report` — let users flag incorrect/missing data.
- [ ] Web support for the map (`react-native-maps` has no web renderer;
      needs a shim like `@teovilla/react-native-web-maps` or a web-specific
      map component) if the app should also run in a browser.
- [ ] Automated tests for the API routes and import script.
- [ ] CI workflow to run tests/lint on push.
