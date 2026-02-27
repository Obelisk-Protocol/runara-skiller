-- Create inventory_versions table for persistent inventory versioning
CREATE TABLE IF NOT EXISTS inventory_versions (
  player_id UUID PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_versions_updated_at_idx
  ON inventory_versions (updated_at DESC);
