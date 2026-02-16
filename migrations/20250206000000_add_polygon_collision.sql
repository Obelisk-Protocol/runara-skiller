-- Add polygon collision support to map_editor_collisions table
-- Migration: 20250206000000_add_polygon_collision.sql
-- This migration is safe to run multiple times (idempotent)

-- Only proceed if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'map_editor_collisions') THEN
    -- Add polygon collision columns (JSONB for flexible storage)
    ALTER TABLE map_editor_collisions 
      ADD COLUMN IF NOT EXISTS collision_shapes JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS above_shapes JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS below_shapes JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS interaction_shapes JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS collision_mode TEXT DEFAULT 'tiles';
    
    -- Add check constraint if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.constraint_column_usage 
      WHERE table_name = 'map_editor_collisions' 
      AND constraint_name LIKE '%collision_mode%'
    ) THEN
      ALTER TABLE map_editor_collisions 
        ADD CONSTRAINT map_editor_collisions_collision_mode_check 
        CHECK (collision_mode IN ('tiles', 'polygons', 'hybrid'));
    END IF;
    
    -- Create GIN index for JSONB queries (for efficient polygon shape queries)
    -- Only create if columns exist
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'map_editor_collisions' 
      AND column_name = 'collision_shapes'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_map_editor_collisions_shapes 
        ON map_editor_collisions USING GIN (collision_shapes, above_shapes, below_shapes, interaction_shapes);
    END IF;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN map_editor_collisions.collision_shapes IS 'Array of polygon shapes for collision areas. Each shape contains vertices array with {x, y} coordinates relative to object origin.';
COMMENT ON COLUMN map_editor_collisions.above_shapes IS 'Array of polygon shapes for areas above player. Each shape contains vertices array with {x, y} coordinates relative to object origin.';
COMMENT ON COLUMN map_editor_collisions.below_shapes IS 'Array of polygon shapes for areas below player. Each shape contains vertices array with {x, y} coordinates relative to object origin.';
COMMENT ON COLUMN map_editor_collisions.interaction_shapes IS 'Array of polygon shapes for interaction areas. Each shape contains vertices array with {x, y} coordinates relative to object origin.';
COMMENT ON COLUMN map_editor_collisions.collision_mode IS 'Collision system mode: "tiles" (legacy tile-based), "polygons" (new polygon-based), or "hybrid" (both). Defaults to "tiles" for backward compatibility.';

-- Update table comment to reflect polygon support
COMMENT ON TABLE map_editor_collisions IS 'Stores collision and interaction data for map editor objects. Supports both tile-based (legacy) and polygon-based (new) collision systems.';
