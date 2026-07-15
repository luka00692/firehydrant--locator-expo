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

-- Accounts, teams (e.g. fire brigades) and their subscriptions/vehicles.
CREATE TABLE IF NOT EXISTS uporabnik (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  uporabnisko_ime TEXT NOT NULL,
  nacin_prijave TEXT NOT NULL CHECK (nacin_prijave IN ('email', 'google', 'github')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS paket (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kupec_id UUID NOT NULL REFERENCES uporabnik(id) ON DELETE RESTRICT,
  skupina_id UUID NOT NULL REFERENCES skupina(id) ON DELETE CASCADE,
  tip TEXT NOT NULL CHECK (tip IN ('osnovni', 'napredni', 'premium')),
  st_sedezev INTEGER NOT NULL CHECK (st_sedezev > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
