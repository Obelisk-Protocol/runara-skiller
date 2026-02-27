-- ============================================
-- Migration: Remove Legacy Fields and Redundant Indexes
-- Date: 2025-11-04
-- Description: Cleanup legacy skill fields and duplicate indexes
-- WARNING: Review LEGACY_ANALYSIS.md before running!
-- ============================================

-- ============================================
-- PART 1: REMOVE LEGACY SKILL FIELDS FROM player_skill_experience
-- ============================================
-- NOTE: Make sure you've migrated any data from old fields to new fields first!

-- Step 1: Check if any data exists in legacy fields (run this first):
-- SELECT 
--   COUNT(*) FILTER (WHERE combat_xp > 0 OR combat_level > 1) as combat_records,
--   COUNT(*) FILTER (WHERE exploration_xp > 0 OR exploration_level > 1) as exploration_records,
--   COUNT(*) FILTER (WHERE gambling_xp > 0 OR gambling_level > 1) as gambling_records
-- FROM player_skill_experience;

-- Step 2: If data exists, migrate it (example - adjust as needed):
-- UPDATE player_skill_experience
-- SET 
--   attack_xp = attack_xp + combat_xp,  -- Migrate combat to attack
--   attack_level = GREATEST(attack_level, combat_level),
--   -- Add other migrations as needed
-- WHERE combat_xp > 0 OR combat_level > 1;

-- Step 3: Drop legacy columns (only after migration confirmed):
-- ALTER TABLE player_skill_experience 
--   DROP COLUMN IF EXISTS combat_xp,
--   DROP COLUMN IF EXISTS combat_level,
--   DROP COLUMN IF EXISTS exploration_xp,
--   DROP COLUMN IF EXISTS exploration_level,
--   DROP COLUMN IF EXISTS gambling_xp,
--   DROP COLUMN IF EXISTS gambling_level;

-- NOTE: magic_xp/crafting_xp exist in both systems - keep them for now
-- NOTE: magic_level/crafting_level exist in both systems - keep them for now

-- ============================================
-- PART 2: REMOVE DUPLICATE INDEXES
-- ============================================

-- Drop duplicate coordinate indexes on chunks
DROP INDEX IF EXISTS idx_chunks_coordinates;

-- Drop duplicate player_pda indexes on experience_logs
DROP INDEX IF EXISTS idx_experience_logs_player;

-- Drop duplicate is_public indexes on map_saves
DROP INDEX IF EXISTS idx_map_saves_is_public;

-- Drop duplicate cnft_address indexes on player_items
DROP INDEX IF EXISTS idx_player_items_cnft;

-- Drop duplicate player_id indexes on player_items
DROP INDEX IF EXISTS idx_player_items_player;

-- ============================================
-- PART 3: FIX OR REMOVE update_virtual_balance FUNCTION
-- ============================================
-- This function references tables that don't exist in the schema.
-- Choose one:

-- Option A: Remove the function if virtual balance system was abandoned
-- DROP FUNCTION IF EXISTS update_virtual_balance(uuid, bigint, text, text, jsonb);

-- Option B: Create the missing tables if virtual balance system is planned
-- CREATE TABLE IF NOT EXISTS virtual_balances (
--   player_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
--   obx_balance BIGINT NOT NULL DEFAULT 0,
--   last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
--   version INTEGER NOT NULL DEFAULT 1
-- );
-- 
-- CREATE TABLE IF NOT EXISTS economy_transactions (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
--   transaction_type TEXT NOT NULL,
--   amount BIGINT NOT NULL,
--   source TEXT,
--   metadata JSONB,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
-- 
-- CREATE INDEX idx_economy_transactions_player ON economy_transactions(player_id);
-- CREATE INDEX idx_economy_transactions_created_at ON economy_transactions(created_at DESC);

-- ============================================
-- PART 4: CONSIDER REMOVING MAP EDITOR TABLES (If not using Unity map editor)
-- ============================================
-- Only run if you're NOT rebuilding the map editor in Unity:

-- DROP TABLE IF EXISTS map_editor_collisions CASCADE;
-- DROP TABLE IF EXISTS map_editor_animations CASCADE;

-- ============================================
-- PART 5: CONSIDER CONSOLIDATING EXPERIENCE LOGGING (Review first!)
-- ============================================
-- skill_training_logs seems to be legacy (uses action_skills FK)
-- If experience_logs is comprehensive enough, consider:

-- Step 1: Migrate data from skill_training_logs to experience_logs
-- INSERT INTO experience_logs (player_pda, skill, experience_gain, source, asset_id, session_id, game_mode, additional_data, timestamp)
-- SELECT 
--   player_pda,
--   skill,
--   exp_gained,
--   action as source,
--   asset_id,
--   session_id::uuid,
--   game_mode,
--   additional_data,
--   created_at
-- FROM skill_training_logs
-- WHERE player_pda IS NOT NULL;

-- Step 2: Drop skill_training_logs (only after migration confirmed)
-- DROP TABLE IF EXISTS skill_training_logs CASCADE;

-- ============================================
-- VERIFICATION QUERIES (Run after migration)
-- ============================================

-- Check for any remaining legacy skill data:
-- SELECT COUNT(*) as legacy_records
-- FROM player_skill_experience
-- WHERE combat_xp > 0 OR exploration_xp > 0 OR gambling_xp > 0;

-- Check index count reduction:
-- SELECT schemaname, tablename, indexname 
-- FROM pg_indexes 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename, indexname;

-- ============================================
-- ROLLBACK (If needed)
-- ============================================
-- If you need to rollback, you'll need to recreate:
-- 1. The dropped columns (with appropriate types)
-- 2. The dropped indexes
-- 3. The dropped tables (if any)

-- Example rollback for player_skill_experience:
-- ALTER TABLE player_skill_experience
--   ADD COLUMN IF NOT EXISTS combat_xp BIGINT DEFAULT 0,
--   ADD COLUMN IF NOT EXISTS combat_level INTEGER DEFAULT 1,
--   ADD COLUMN IF NOT EXISTS exploration_xp BIGINT DEFAULT 0,
--   ADD COLUMN IF NOT EXISTS exploration_level INTEGER DEFAULT 1,
--   ADD COLUMN IF NOT EXISTS gambling_xp BIGINT DEFAULT 0,
--   ADD COLUMN IF NOT EXISTS gambling_level INTEGER DEFAULT 1;

