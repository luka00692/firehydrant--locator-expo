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
- `POST /api/hydrants/:id/report` — flag a hydrant's data as wrong/missing (body: `{ "sporocilo": "..." }`)

Auth (see [Auth](#auth) below):
- `POST /api/auth/register` — body `{ email, uporabnisko_ime }` → creates the
  account on first use, returns `{ user, token }`
- `GET /api/auth/session` — `Authorization: Bearer <token>` → `{ user }`

Payments (see [Payments](#payments) below):
- `POST /api/checkout` — auth required, body `{ tip, st_sedezev }` → Stripe
  Checkout URL
- `POST /api/webhooks/stripe` — Stripe calls this; records the purchased
  `paket` on `checkout.session.completed`

Groups / teams (auth required on all of these; `vloga` is `"admin"` or
`"member"`, `status` is `"pending"`, `"approved"`, or `"rejected"`):
- `POST /api/groups` — body `{ imeSkupine }`, consumes the caller's oldest
  unassigned `paket` and makes the caller `admin` / `GET /api/groups` (groups
  the caller belongs to)
- `GET /api/groups/:id` / `PATCH /api/groups/:id` — admin-only; body
  `{ ime?, lokacijaDoma?: { lat, lng } }` / `DELETE /api/groups/:id` — admin-only
- `POST /api/groups/join` — body `{ imeSkupine }` → pending (`member`) join
  request
- `GET /api/groups/:id/requests` — admin-only, lists pending join requests
- `GET|POST /api/groups/:id/vehicles` — any approved member can list, only an
  admin can add (body `{ ime, premerCevi }`)
- `PATCH /api/memberships/:id` — admin-only, body `{ status: "approved" }` to
  accept a pending request (`409` if the group has no free seat),
  `{ status: "rejected" }` to reject one, or `{ vloga: "admin"|"member" }` to
  change a member's role
- `DELETE /api/memberships/:id` — admin-only; removes an approved member or
  rejects a pending request (an alternative to `PATCH { status: "rejected" }`)
- `PATCH /api/vehicles/:id` — admin-only, body `{ ime?, premerCevi? }`
- `DELETE /api/vehicles/:id` — admin-only

Misc:
- `GET /api/geocode?q=<address>` — address → `{ lat, lon }` (Nominatim,
  Slovenia-scoped)
- `POST /api/hydrants/nearest` — see
  [Nearest-hydrant search](#nearest-hydrant-search) below

All `POST`/`PATCH` endpoints return `400` on missing fields or constraint
violations (bad foreign key, invalid enum value, duplicate membership, etc.)
instead of a raw `500` — see `lib/dbError.js`. All the group/membership/vehicle
endpoints enforce that only a group's admin (`clanstvo.vloga = 'admin'`) can
change its settings — a member can search/navigate but not administer.

Response bodies use camelCase (`stSedezev`, `lastnikId`, `premerCevi`,
`createdAt`, `uporabnikId`, `skupinaId`, `uporabniskoIme`, `lng`) even where
the underlying Slovenian column name differs — see the `SELECT`/`RETURNING`
aliases in each handler for the exact shape. Group/membership/vehicle field
*names* that are meaningful nouns stay Slovenian (`ime`, `vloga`, `imeSkupine`,
`premerCevi`, `lokacijaDoma`) to match the workflow spec exactly; only their
*casing* and enum *values* are normalized to camelCase/English.

## Auth

There's no OAuth provider wired up — `POST /api/auth/register` is
**passwordless and unverified**: it creates (or logs into) an account for
whatever email you send it, with no proof you actually control that inbox.
This is fine for wiring up the rest of the app end-to-end, but treat it as a
placeholder — a real launch needs either a magic-link email step (needs an
email-sending provider) or actual Google/Apple OAuth (needs registering
OAuth apps with those platforms and setting their client credentials as env
vars — neither is implemented here). `nacin_prijave` values other than
`"email"` currently return `501`.

Sessions are opaque tokens in the `session` table, sent back as
`Authorization: Bearer <token>` on every authenticated request. `lib/auth.js`
validates them; `lib/authz.js` checks group roles.

## Payments

`POST /api/checkout` creates a Stripe Checkout session and needs
`STRIPE_SECRET_KEY` set — it returns `503` without it. `POST
/api/webhooks/stripe` needs `STRIPE_WEBHOOK_SECRET` (shown when you register
this endpoint's URL in the Stripe dashboard) to verify the webhook signature;
it's the only place a `paket` row actually gets created; `POST /api/checkout`
only starts the payment. Optional `CHECKOUT_SUCCESS_URL`/`CHECKOUT_CANCEL_URL`
env vars control where Stripe redirects afterwards. Pricing
(`CENTS_PER_SEAT` in `api/checkout/index.js`) is a placeholder — update it
once real prices are decided. None of this was reachable from this sandbox
(outbound network to `api.stripe.com` is blocked here) — the webhook's
signature verification is covered by tests since that's pure local crypto,
but an actual live checkout has not been run end-to-end.

## Nearest-hydrant search

`POST /api/hydrants/nearest` — body `{ lat, lng, premer? }` (note: `lng`, not
`lon`, and `premer` rather than `premerCevi` — matches the workflow spec's
exact wording for this one endpoint). Takes the 5 nearest-as-crow-flies
hydrants (optionally filtered to an exact `fire_hydrant:diameter` match for
`premer`), road-routes each via OSRM (`lib/routing.js`), and returns whichever
is actually closest by road. Falls back to the closest straight-line
candidate if OSRM is unreachable. Not reachable from this sandbox either
(outbound network to `router.project-osrm.org` is blocked here) — implemented
per the existing client-side `src/routing.js` pattern but not live-tested.

## Push notifications

Join requests, acceptances, removals, and group deletion best-effort-notify
via Expo's push API (`lib/push.js`) using `uporabnik.push_token`. Nothing
currently sets that column — the frontend needs to register the device's
Expo push token (via `expo-notifications`) against the signed-in user for
this to actually reach a phone. Until then these calls silently no-op
(missing token) rather than failing the request.

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
5. (Optional but recommended) Set a `CRON_SECRET` environment variable —
   Vercel Cron automatically sends it as `Authorization: Bearer <value>` on
   its own requests, and `api/cron/resync.js` rejects any request missing a
   matching header once the variable is set.

## Overpass re-sync

`vercel.json` schedules `api/cron/resync.js` daily via Vercel Cron. It
queries the Overpass API for every `emergency=fire_hydrant` node in Slovenia
and upserts them into `hydrants` using the same logic as
`scripts/importHydrants.js`, so OSM edits eventually propagate without
needing a fresh app release. Not covered by the test suite (it depends on
Overpass' live API) — verify manually after deploying by calling the route
once (with the `Authorization` header if `CRON_SECRET` is set).

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
- [ ] Real Google/Apple sign-in (needs registering OAuth apps + client
      credentials) and/or a magic-link email step for the "email" method
      (needs an email-sending provider) — `/api/auth/register` is a
      passwordless placeholder today, see [Auth](#auth).
- [ ] Wire up Stripe: set `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`,
      register the webhook URL in the Stripe dashboard, decide real pricing.
- [ ] Frontend work: none of `/api/auth/*`, `/api/checkout`, `/api/groups/*`,
      `/api/memberships/:id`, `/api/vehicles/:id`, `/api/geocode`, or
      `/api/hydrants/nearest` are called from the Expo app yet — it still
      only uses the hydrant browsing/report endpoints from before this
      workflow spec.
- [ ] Register each device's Expo push token against its user so
      `lib/push.js` notifications actually reach a phone (see
      [Push notifications](#push-notifications)).
- [ ] Live-verify `/api/hydrants/nearest` (OSRM) and `/api/geocode`
      (Nominatim) once deployed — both were implemented against docs only,
      since outbound network to either is blocked in this dev sandbox.
