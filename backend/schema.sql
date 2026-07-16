CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS hydrants (
  id BIGINT PRIMARY KEY,
  geom GEOGRAPHY(Point, 4326) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hydrants_geom_idx ON hydrants USING GIST (geom);
CREATE INDEX IF NOT EXISTS hydrants_properties_idx ON hydrants USING GIN (properties);

CREATE TABLE IF NOT EXISTS hydrant_report (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hydrant_id BIGINT NOT NULL REFERENCES hydrants(id) ON DELETE CASCADE,
  sporocilo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hydrant_report_hydrant_idx ON hydrant_report (hydrant_id);

-- Accounts, teams (e.g. fire brigades) and their subscriptions/vehicles.
CREATE TABLE IF NOT EXISTS uporabnik (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  uporabnisko_ime TEXT NOT NULL,
  nacin_prijave TEXT NOT NULL CHECK (nacin_prijave IN ('email', 'google', 'apple')),
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE uporabnik ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Passwordless session tokens issued by /api/auth/register. See backend/README.md
-- for the security caveat: there is no email verification yet, so this identifies
-- a claimed email, not a proven one.
CREATE TABLE IF NOT EXISTS session (
  token TEXT PRIMARY KEY,
  uporabnik_id UUID NOT NULL REFERENCES uporabnik(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS session_uporabnik_idx ON session (uporabnik_id);

CREATE TABLE IF NOT EXISTS skupina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lastnik_id UUID NOT NULL REFERENCES uporabnik(id) ON DELETE RESTRICT,
  ime TEXT NOT NULL,
  lokacija_doma GEOGRAPHY(Point, 4326),
  st_sedezev INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS skupina_lokacija_idx ON skupina USING GIST (lokacija_doma);
CREATE INDEX IF NOT EXISTS skupina_lastnik_idx ON skupina (lastnik_id);

-- skupina_id starts NULL: a package is purchased first (via Stripe checkout),
-- then consumed/assigned when its buyer creates a group (see api/groups/index.js).
CREATE TABLE IF NOT EXISTS paket (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kupec_id UUID NOT NULL REFERENCES uporabnik(id) ON DELETE RESTRICT,
  skupina_id UUID REFERENCES skupina(id) ON DELETE CASCADE,
  tip TEXT NOT NULL CHECK (tip IN ('osnovni', 'napredni', 'premium')),
  st_sedezev INTEGER NOT NULL CHECK (st_sedezev > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE paket ALTER COLUMN skupina_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS paket_kupec_idx ON paket (kupec_id);
CREATE INDEX IF NOT EXISTS paket_skupina_idx ON paket (skupina_id);

CREATE TABLE IF NOT EXISTS clanstvo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uporabnik_id UUID NOT NULL REFERENCES uporabnik(id) ON DELETE CASCADE,
  skupina_id UUID NOT NULL REFERENCES skupina(id) ON DELETE CASCADE,
  vloga TEXT NOT NULL CHECK (vloga IN ('lastnik', 'clan', 'gost')),
  status TEXT NOT NULL CHECK (status IN ('povabljen', 'aktiven', 'zapustil')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (uporabnik_id, skupina_id)
);

CREATE INDEX IF NOT EXISTS clanstvo_uporabnik_idx ON clanstvo (uporabnik_id);
CREATE INDEX IF NOT EXISTS clanstvo_skupina_idx ON clanstvo (skupina_id);

CREATE TABLE IF NOT EXISTS vozilo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skupina_id UUID NOT NULL REFERENCES skupina(id) ON DELETE CASCADE,
  ime TEXT NOT NULL,
  premer_cevi NUMERIC NOT NULL CHECK (premer_cevi > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vozilo_skupina_idx ON vozilo (skupina_id);
