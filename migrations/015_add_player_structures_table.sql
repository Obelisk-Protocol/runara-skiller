-- ============================================
-- Migration 015: Player Structures Table (Layer 3)
-- Date: 2025-01-XX
-- Purpose: Enable player-placed structures in world
-- ============================================

-- Create player_structures table for Layer 3 objects
CREATE TABLE IF NOT EXISTS player_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Chunk coordinates
  chunk_x INTEGER NOT NULL,
  chunk_y INTEGER NOT NULL,
  
  -- Position within chunk (pixels, 0-2047)
  x INTEGER NOT NULL CHECK (x >= 0 AND x < 2048),
  y INTEGER NOT NULL CHECK (y >= 0 AND y < 2048),
  
  -- Item reference
  item_definition_id TEXT NOT NULL REFERENCES item_definitions(item_id) ON DELETE CASCADE,
  structure_type TEXT NOT NULL, -- 'chest', 'wall', 'door', 'building', 'decoration', etc.
  
  -- Transform properties
  rotation REAL DEFAULT 0 CHECK (rotation >= 0 AND rotation < 360),
  scale REAL DEFAULT 1 CHECK (scale > 0 AND scale <= 5),
  z_layer TEXT CHECK (z_layer IN ('below', 'mid', 'above')) DEFAULT 'mid',
  z_offset INTEGER DEFAULT 0,
  
  -- Collision data
  collision BOOLEAN DEFAULT true,
  collision_bounds JSONB, -- Tile-based collision data (same format as PlacedObject)
  
  -- Structure properties (door codes, chest contents, wall connections, etc.)
  properties JSONB DEFAULT '{}',
  
  -- Lifecycle
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  destroyed_at TIMESTAMPTZ NULL, -- Soft delete for destruction
  health INTEGER DEFAULT 100 CHECK (health >= 0),
  max_health INTEGER DEFAULT 100 CHECK (max_health > 0),
  
  -- Optional metadata (for future features like door codes)
  placed_by_player_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = FFA (no ownership)
  placed_by_name TEXT      -- Denormalized for quick display
  
  -- Constraints: Unique position per chunk (only for active structures)
  -- Note: We use a unique index instead of a constraint because we need NULLS handling
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_structures_chunk 
  ON player_structures(chunk_x, chunk_y) 
  WHERE destroyed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_player_structures_type 
  ON player_structures(structure_type) 
  WHERE destroyed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_player_structures_player 
  ON player_structures(placed_by_player_id) 
  WHERE destroyed_at IS NULL AND placed_by_player_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_player_structures_item_def 
  ON player_structures(item_definition_id) 
  WHERE destroyed_at IS NULL;

-- Partial index for active structures only (most queries)
CREATE INDEX IF NOT EXISTS idx_player_structures_active 
  ON player_structures(chunk_x, chunk_y, x, y, id) 
  WHERE destroyed_at IS NULL;

-- Unique index to prevent duplicate active structures at same position
-- This enforces the constraint that active structures cannot overlap
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_structures_unique_active_position
  ON player_structures(chunk_x, chunk_y, x, y)
  WHERE destroyed_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE player_structures IS 'Layer 3: Player-placed structures (chests, walls, buildings, etc.)';
COMMENT ON COLUMN player_structures.chunk_x IS 'Chunk X coordinate (world chunk coordinate)';
COMMENT ON COLUMN player_structures.chunk_y IS 'Chunk Y coordinate (world chunk coordinate)';
COMMENT ON COLUMN player_structures.x IS 'X position within chunk in pixels (0-2047)';
COMMENT ON COLUMN player_structures.y IS 'Y position within chunk in pixels (0-2047)';
COMMENT ON COLUMN player_structures.structure_type IS 'Type of structure: chest, wall, door, building, decoration, etc.';
COMMENT ON COLUMN player_structures.collision_bounds IS 'Tile-based collision data matching PlacedObject format';
COMMENT ON COLUMN player_structures.properties IS 'Structure-specific properties (door_code, chest_contents, wall_connections, etc.)';
COMMENT ON COLUMN player_structures.destroyed_at IS 'Soft delete timestamp - NULL means structure is active';
COMMENT ON COLUMN player_structures.placed_by_player_id IS 'Player who placed structure (NULL = FFA, no ownership)';

