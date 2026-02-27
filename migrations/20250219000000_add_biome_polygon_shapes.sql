-- Add biome_polygon_shapes column to map_editor_collisions
-- Enables polygon-based biome editing (water/land) with precise boundaries like collision polygons
-- Migration: 20250219000000_add_biome_polygon_shapes.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'map_editor_collisions'
    AND column_name = 'biome_polygon_shapes'
  ) THEN
    ALTER TABLE map_editor_collisions
      ADD COLUMN biome_polygon_shapes JSONB DEFAULT '[]'::jsonb;

    COMMENT ON COLUMN map_editor_collisions.biome_polygon_shapes IS
      'Array of polygon shapes for biome regions (water, land). Each shape: { id, vertices: [{x,y}], biome, closed }. Enables precise polygon boundaries like collision shapes.';
  END IF;
END
$$;
