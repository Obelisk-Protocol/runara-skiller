-- ============================================
-- REMOVE SKILL LEVEL COLUMNS FROM nfts TABLE
-- Date: January 2025
-- Purpose: Remove redundant skill level columns from nfts table
--          Skills are now stored exclusively in nft_skill_experience table
-- Impact: nfts table now only stores character metadata (name, levels, blockchain sync)
-- ============================================

-- Drop all skill level columns from nfts table
-- These are now stored exclusively in nft_skill_experience table

ALTER TABLE nfts 
DROP COLUMN IF EXISTS attack,
DROP COLUMN IF EXISTS strength,
DROP COLUMN IF EXISTS defense,
DROP COLUMN IF EXISTS magic,
DROP COLUMN IF EXISTS projectiles,
DROP COLUMN IF EXISTS vitality,
DROP COLUMN IF EXISTS crafting,
DROP COLUMN IF EXISTS luck,
DROP COLUMN IF EXISTS mining,
DROP COLUMN IF EXISTS woodcutting,
DROP COLUMN IF EXISTS fishing,
DROP COLUMN IF EXISTS hunting,
DROP COLUMN IF EXISTS smithing,
DROP COLUMN IF EXISTS cooking,
DROP COLUMN IF EXISTS alchemy,
DROP COLUMN IF EXISTS construction;

-- Note: Legacy abbreviated columns (att, str, def, etc.) should already be renamed
-- by previous migrations, but drop them if they still exist
ALTER TABLE nfts 
DROP COLUMN IF EXISTS att,
DROP COLUMN IF EXISTS str,
DROP COLUMN IF EXISTS def,
DROP COLUMN IF EXISTS mag,
DROP COLUMN IF EXISTS pro,
DROP COLUMN IF EXISTS vit,
DROP COLUMN IF EXISTS cra,
DROP COLUMN IF EXISTS luc,
DROP COLUMN IF EXISTS gat;

-- Note: Legacy _level suffixed columns (mining_level, woodcutting_level, etc.) should already be removed
-- but drop them if they still exist
ALTER TABLE nfts 
DROP COLUMN IF EXISTS mining_level,
DROP COLUMN IF EXISTS woodcutting_level,
DROP COLUMN IF EXISTS fishing_level,
DROP COLUMN IF EXISTS hunting_level,
DROP COLUMN IF EXISTS smithing_level,
DROP COLUMN IF EXISTS cooking_level,
DROP COLUMN IF EXISTS alchemy_level,
DROP COLUMN IF EXISTS construction_level,
DROP COLUMN IF EXISTS farming_level;

-- ============================================
-- VERIFICATION QUERIES (for manual checking)
-- ============================================

-- Verify skill columns are removed
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'nfts' AND column_name IN ('attack', 'strength', 'woodcutting', 'mining', 'fishing', 'hunting', 'smithing', 'cooking', 'alchemy', 'construction');
-- Should return 0 rows

-- Verify nfts table still has metadata columns
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'nfts' AND column_name IN ('asset_id', 'name', 'combat_level', 'total_level', 'player_pda', 'last_arweave_uri', 'last_update_sig');
-- Should return all metadata columns

