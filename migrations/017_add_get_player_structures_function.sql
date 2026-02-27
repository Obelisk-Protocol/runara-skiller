-- ============================================
-- Migration 017: Add Player Structures Query Function
-- Date: 2025-01-XX
-- Purpose: Efficient function to load all active structures for a chunk
-- ============================================

-- Function to efficiently load all active structures for a chunk
CREATE OR REPLACE FUNCTION get_player_structures_for_chunk(
  p_chunk_x INTEGER,
  p_chunk_y INTEGER
) RETURNS TABLE (
  id UUID,
  chunk_x INTEGER,
  chunk_y INTEGER,
  x INTEGER,
  y INTEGER,
  item_definition_id TEXT,
  structure_type TEXT,
  rotation REAL,
  scale REAL,
  z_layer TEXT,
  z_offset INTEGER,
  collision BOOLEAN,
  collision_bounds JSONB,
  properties JSONB,
  placed_at TIMESTAMPTZ,
  health INTEGER,
  max_health INTEGER,
  placed_by_player_id UUID,
  placed_by_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ps.id,
    ps.chunk_x,
    ps.chunk_y,
    ps.x,
    ps.y,
    ps.item_definition_id,
    ps.structure_type,
    ps.rotation,
    ps.scale,
    ps.z_layer,
    ps.z_offset,
    ps.collision,
    ps.collision_bounds,
    ps.properties,
    ps.placed_at,
    ps.health,
    ps.max_health,
    ps.placed_by_player_id,
    ps.placed_by_name
  FROM player_structures ps
  WHERE ps.chunk_x = p_chunk_x
    AND ps.chunk_y = p_chunk_y
    AND ps.destroyed_at IS NULL
  ORDER BY ps.placed_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Comment on function
COMMENT ON FUNCTION get_player_structures_for_chunk(INTEGER, INTEGER) IS 'Returns all active player structures for a given chunk, ordered by placement time';

