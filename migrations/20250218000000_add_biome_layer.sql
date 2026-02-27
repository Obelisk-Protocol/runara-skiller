-- Add biome_layer column to map_editor_collisions for per-tile biome data
-- Migration: 20250218000000_add_biome_layer.sql
-- Purpose: Store semantic biome layer (water, land, lava, etc.) for rule-based walkability

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'map_editor_collisions'
  ) THEN
    ALTER TABLE map_editor_collisions
      ADD COLUMN IF NOT EXISTS biome_layer JSONB DEFAULT NULL;

    COMMENT ON COLUMN map_editor_collisions.biome_layer IS
      'Per-tile biome grid [tileY][tileX] = biome id (water, land, lava, swamp, void). Used for rule-based walkability.';
  END IF;
END $$;
