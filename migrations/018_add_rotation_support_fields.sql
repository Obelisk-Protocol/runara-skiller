-- ============================================
-- Migration 018: Add Rotation Support Fields
-- Date: 2025-01-XX
-- Purpose: Explicit rotation control with directional sprites
-- ============================================

-- Add comment to placement_metadata column explaining rotation system
COMMENT ON COLUMN item_definitions.placement_metadata IS 
'Placement-specific metadata JSONB:
{
  "supports_rotation": boolean,  // If true, item can be rotated (requires rotation_sprites)
  "rotation_sprites": {          // Required if supports_rotation = true
    "0": "/sprites/item_north.png",    // Rotation 0° (north)
    "90": "/sprites/item_east.png",    // Rotation 90° (east)
    "180": "/sprites/item_south.png",  // Rotation 180° (south)
    "270": "/sprites/item_west.png"    // Rotation 270° (west)
  },
  "rotation_increments": 90,     // Angle increments (90 = only 0/90/180/270 allowed)
  "snap_to_grid": boolean,
  "grid_size": number
}';

-- Note: We use placement_metadata JSONB field, no new columns needed
-- The engine UI will validate that rotation_sprites exists when supports_rotation = true

