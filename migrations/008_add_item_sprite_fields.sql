-- Migration 008: Add multi-sprite fields to item_definitions table
-- Supports inventory sprite, ground sprite, and in-use sprite/animation
-- 
-- This migration creates the item_definitions table if it doesn't exist, then adds sprite columns

-- Create item_definitions table if it doesn't exist (from 001_initial_schema.sql)
CREATE TABLE IF NOT EXISTS item_definitions (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('material', 'equipment', 'consumable')),
    rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
    base_properties JSONB NOT NULL,
    image_url TEXT,
    animation_url TEXT,
    icon_url TEXT,
    craft_recipe JSONB,
    max_floor_level INTEGER,
    base_drop_rate NUMERIC NOT NULL DEFAULT 0.0001,
    is_craftable BOOLEAN DEFAULT FALSE,
    max_stack_size INTEGER DEFAULT 1,
    min_floor_level INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    mint_cost_cobx INTEGER NOT NULL DEFAULT 0
);

-- Add new sprite columns (IF NOT EXISTS prevents errors if columns already exist)
ALTER TABLE item_definitions 
ADD COLUMN IF NOT EXISTS ground_sprite_url TEXT,
ADD COLUMN IF NOT EXISTS in_use_sprite_url TEXT,
ADD COLUMN IF NOT EXISTS in_use_animation_config JSONB;

-- Add indexes for sprite URL lookups (if needed for performance)
CREATE INDEX IF NOT EXISTS idx_item_definitions_ground_sprite ON item_definitions(ground_sprite_url) WHERE ground_sprite_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_definitions_in_use_sprite ON item_definitions(in_use_sprite_url) WHERE in_use_sprite_url IS NOT NULL;

-- Add comments to document the sprite fields
COMMENT ON COLUMN item_definitions.ground_sprite_url IS 'Sprite URL displayed when item is dropped on ground';
COMMENT ON COLUMN item_definitions.in_use_sprite_url IS 'Sprite/animation URL displayed when item is actively being used';
COMMENT ON COLUMN item_definitions.in_use_animation_config IS 'JSONB animation configuration for in-use sprite (frame dimensions, sequence, fps, loop)';

