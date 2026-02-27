-- Migration: Fix nft_total_level trigger to not reference non-existent columns
-- Date: 2025-01-06
-- Description: Disables the trigger that tries to access skill columns that don't exist in nfts table
--              Skill levels are stored in nft_skill_experience table, not nfts table

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS trigger_update_nft_total_level ON nfts;
DROP TRIGGER IF EXISTS trigger_update_nft_total_level_update ON nfts;

-- Optionally drop the function (it's no longer needed)
-- The function references columns (att, str, def, etc.) that don't exist in nfts table
-- total_level should be calculated from nft_skill_experience table in application code
DROP FUNCTION IF EXISTS update_nft_total_level();

-- Note: total_level is still stored in nfts table, but it's updated by application code
-- when syncing from nft_skill_experience table, not by database trigger

