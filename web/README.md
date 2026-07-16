# Hidranti SI — web frontend

Next.js (App Router) + TypeScript frontend for the fire hydrant locator,
built against the workflow spec in `../design/design_handoff_hidranti/` and
talking to the backend in `../backend/`.

This is a separate frontend from the Expo/React Native app at the repo
root — that app only covers the hydrant map (no auth, groups, or payments).
This one implements the full flow: onboarding → auth → packages/checkout →
create-or-join a group → the main app (map / group / vehicles / profile).

## Local development

```bash
cd web
npm install
cp .env.local.example .env.local   # point NEXT_PUBLIC_API_BASE_URL at your backend
npm run dev
```

Requires the backend (`../backend/`) running and reachable at
`NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:3000`).

## Structure

- `lib/api.ts` — typed fetch client for every backend endpoint
- `lib/app-state.tsx` — global app state (screen/tab routing, session, active
  group/vehicle) via React Context; the closest equivalent to the design
  prototype's single `state` object
- `lib/auth-storage.ts` — session token persistence (`localStorage`)
- `components/screens/*` — one component per top-level screen (onboarding,
  auth, packages, group-new, join, waiting)
- `components/screens/AppShellScreen.tsx` + `components/tabs/*` — the signed-
  in app's four tabs (map/group/vehicles/profile) and bottom tab bar
- `components/HydrantMap.tsx` — Leaflet map wrapper (client-only, dynamically
  imported — Leaflet needs `window`)

## Known simplifications vs. the design prototype

- **No fake phone frame.** The prototype's HTML wraps everything in a
  status-bar/notch mockup for the design tool's preview canvas; this is a
  real responsive web page instead.
- **No in-app Stripe checkout UI.** `POST /api/checkout` returns a real
  Stripe Checkout URL and the browser navigates there directly — Stripe
  hosts that page, so there's no need to reimplement it. Set
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` on the backend and
  `CHECKOUT_SUCCESS_URL`/`CHECKOUT_CANCEL_URL` to this app's origin
  (`.../?checkout=success` / `.../?checkout=cancel`, handled in
  `components/AppRoot.tsx`) for the redirect loop to work.
- **No address autocomplete dropdown.** The backend's `/api/geocode` returns
  a single best match (Nominatim `limit=1`), not a suggestions list — so
  search is submit-then-geocode (Enter or the search button), not type-ahead.
- **Google/Apple sign-in buttons are disabled** (not implemented on the
  backend either — see `backend/README.md`'s Auth section).
- **Google Maps deep link for navigation**, same as the prototype
  (`openNav` in `components/tabs/MapTab.tsx`) — no in-app turn-by-turn.

## What's been tested

End-to-end manually (register → guest join → admin approves via the UI →
member sees the group/vehicles/map with real hydrant data from the backend)
against a local Postgres+PostGIS instance and a throwaway local server
mimicking Vercel's routing for `backend/api/*.js`, since `vercel dev` and
real Neon/Vercel aren't reachable from this environment. `npx tsc --noEmit`
and `npm run build` both pass cleanly. Map tiles themselves didn't load in
that test (OpenStreetMap's tile server is unreachable from this sandbox) —
markers, search, filters, and the detail sheet all rendered and worked
against real backend data regardless.
