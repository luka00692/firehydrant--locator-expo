CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS hydrants (
  id BIGINT PRIMARY KEY,
  geom GEOGRAPHY(Point, 4326) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hydrants_geom_idx ON hydrants USING GIST (geom);
CREATE INDEX IF NOT EXISTS hydrants_properties_idx ON hydrants USING GIN (properties);
