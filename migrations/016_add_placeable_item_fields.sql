-- ============================================
-- Migration 016: Add Placeable Item Fields
-- Date: 2025-01-XX
-- Purpose: Mark items as placeable and categorize them
-- ============================================

-- Add placeable flag
ALTER TABLE item_definitions 
  ADD COLUMN IF NOT EXISTS is_placeable BOOLEAN NOT NULL DEFAULT FALSE;

-- Add category for UI filtering (building menu, crafting menu, etc.)
ALTER TABLE item_definitions 
  ADD COLUMN IF NOT EXISTS placeable_category TEXT 
  CHECK (placeable_category IN ('building', 'crafting', 'decoration', 'storage', 'furniture', 'structure'));

-- Add placement metadata (size, rotation limits, placement rules, etc.)
ALTER TABLE item_definitions 
  ADD COLUMN IF NOT EXISTS placement_metadata JSONB DEFAULT '{}';

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_item_definitions_placeable 
  ON item_definitions(is_placeable) 
  WHERE is_placeable = true;

CREATE INDEX IF NOT EXISTS idx_item_definitions_placeable_category 
  ON item_definitions(placeable_category) 
  WHERE is_placeable = true AND placeable_category IS NOT NULL;

-- Comments
COMMENT ON COLUMN item_definitions.is_placeable IS 'If true, this item can be placed in the world by players';
COMMENT ON COLUMN item_definitions.placeable_category IS 'Category for UI filtering: building, crafting, decoration, storage, furniture, structure';
COMMENT ON COLUMN item_definitions.placement_metadata IS 'Placement-specific metadata: snap_to_grid, grid_size, rotation_increments, placement_rules, walkable_overlay (bridge|road|constructed for tiles covered by structure to become walkable over water), etc.';

