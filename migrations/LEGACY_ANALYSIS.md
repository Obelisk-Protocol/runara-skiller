-- ============================================
-- DATABASE LEGACY & REDUNDANCY ANALYSIS
-- Date: 2025-11-04
-- Purpose: Identify legacy/unused features and redundancy
-- ============================================

-- ============================================
-- 🔴 CRITICAL: LEGACY SKILL SYSTEM FIELDS
-- ============================================
-- Issue: player_skill_experience table has OLD skill fields that are no longer used
-- Old System (v1.0.0): combat, magic, crafting, exploration, gambling
-- New System (v2.0.0): attack, strength, defense, magic, projectiles, vitality, 
--                      mining, woodcutting, fishing, farming, hunting, smithing, 
--                      cooking, alchemy, construction, luck

-- LEGACY COLUMNS IN player_skill_experience (Lines 212-221):
--   - combat_xp, combat_level          ❌ DEPRECATED
--   - magic_xp, magic_level            ⚠️ AMBIGUOUS (exists in both systems)
--   - crafting_xp, crafting_level      ⚠️ AMBIGUOUS (exists in both systems)
--   - exploration_xp, exploration_level ❌ DEPRECATED
--   - gambling_xp, gambling_level      ❌ DEPRECATED

-- RECOMMENDATION: Migrate any remaining data from old fields to new fields, then drop:
--   ALTER TABLE player_skill_experience 
--     DROP COLUMN IF EXISTS combat_xp,
--     DROP COLUMN IF EXISTS combat_level,
--     DROP COLUMN IF EXISTS exploration_xp,
--     DROP COLUMN IF EXISTS exploration_level,
--     DROP COLUMN IF EXISTS gambling_xp,
--     DROP COLUMN IF EXISTS gambling_level;

-- ============================================
-- 🔴 REDUNDANT: DUPLICATE INDEXES
-- ============================================

-- 1. chunks table - duplicate coordinate indexes:
--   - idx_chunks_coordinates (line 350) ❌ DUPLICATE
--   - idx_chunks_coords (line 351)     ✅ KEEP THIS ONE
--   RECOMMENDATION: DROP idx_chunks_coordinates

-- 2. experience_logs table - duplicate player_pda indexes:
--   - idx_experience_logs_player (line 356)      ❌ DUPLICATE
--   - idx_experience_logs_player_pda (line 357) ✅ KEEP THIS ONE
--   RECOMMENDATION: DROP idx_experience_logs_player

-- 3. map_saves table - duplicate is_public indexes:
--   - idx_map_saves_is_public (line 370) ❌ DUPLICATE
--   - idx_map_saves_public (line 371)     ✅ KEEP THIS ONE
--   RECOMMENDATION: DROP idx_map_saves_is_public

-- 4. player_items table - duplicate cnft_address indexes:
--   - idx_player_items_cnft (line 384)       ❌ DUPLICATE
--   - idx_player_items_cnft_address (line 385) ✅ KEEP THIS ONE
--   RECOMMENDATION: DROP idx_player_items_cnft

-- 5. player_items table - duplicate player_id indexes:
--   - idx_player_items_player (line 388)     ❌ DUPLICATE
--   - idx_player_items_player_id (line 389) ✅ KEEP THIS ONE
--   RECOMMENDATION: DROP idx_player_items_player

-- ============================================
-- 🔴 QUESTIONABLE: REDUNDANT SKILL TRACKING
-- ============================================

-- ISSUE: Two separate tables tracking NFT skill experience
-- 1. nfts table - has skill level columns directly (mining_level, woodcutting_level, etc.)
-- 2. nft_skill_experience table - separate normalized table for skill experience

-- ANALYSIS:
--   - nfts table tracks levels only (no experience)
--   - nft_skill_experience tracks both experience AND levels
--   - Both have pending_onchain_update flag

-- QUESTION: Is nft_skill_experience the source of truth, or is nfts?
--   If nfts is authoritative → nft_skill_experience is redundant
--   If nft_skill_experience is authoritative → nfts skill columns are redundant

-- RECOMMENDATION: Consolidate into one approach:
--   Option A: Keep nft_skill_experience, remove skill columns from nfts
--   Option B: Keep nfts skill columns, remove nft_skill_experience table
--   (Current codebase likely uses nft_skill_experience based on migration logic)

-- ============================================
-- 🟡 LEGACY: MAP EDITOR TABLES (If moving to Unity)
-- ============================================

-- These tables are specifically for the Phaser 3 map editor:
--   - map_editor_animations (lines 54-68)
--   - map_editor_collisions (lines 71-88)

-- QUESTION: Are you rebuilding the map editor in Unity?
--   If YES → Keep these tables
--   If NO → These can be archived/removed

-- The map_saves table is still needed (stores world data)

-- ============================================
-- 🟡 UNUSED: FUNCTION REFERENCES NON-EXISTENT TABLES
-- ============================================

-- Function: update_virtual_balance (lines 582-608)
--   References: virtual_balances table ❌ DOES NOT EXIST IN SCHEMA
--   References: economy_transactions table ❌ DOES NOT EXIST IN SCHEMA

-- RECOMMENDATION: Either:
--   A) Create these tables if virtual balance system is planned
--   B) Remove this function if virtual balance system was abandoned

-- ============================================
-- 🟡 LEGACY: ACTION SKILLS SYSTEM
-- ============================================

-- Table: action_skills (lines 11-19)
-- View: action_skill_mapping (lines 633-637)
-- Foreign Key: skill_training_logs.action → action_skills.action

-- STATUS: ✅ ACTUALLY USED (found in src/services/database.ts)
--   - getActionSkillMappings() method exists
--   - getSkillForAction() method exists

-- However, skill_training_logs references this but experience_logs doesn't
-- QUESTION: Are both logging systems needed? Or is one legacy?

-- ============================================
-- 🟡 POTENTIAL REDUNDANCY: EXPERIENCE LOGGING TABLES
-- ============================================

-- Two similar tables for logging experience:
--   1. experience_logs (lines 37-51)
--      - player_pda, skill, experience_gain, source, timestamp
--      - Has session_id, game_mode, additional_data, asset_id
--
--   2. skill_training_logs (lines 307-321)
--      - asset_id, action, skill, exp_gained, player_pda
--      - Has session_id, game_mode, additional_data
--
--   3. xp_award_events (lines 324-334)
--      - asset_id, skill, experience_gain, idempotency_key
--      - Simpler, focused on idempotency

-- QUESTION: Are all three needed? Or can they be consolidated?
--   experience_logs seems more comprehensive
--   skill_training_logs seems legacy (uses action_skills FK)
--   xp_award_events seems specialized for idempotent awards

-- ============================================
-- 🟡 LEGACY: NFT TABLE REDUNDANT COLUMNS
-- ============================================

-- nfts table has both:
--   - Individual skill levels (mining_level, woodcutting_level, etc.) 
--   - Aggregated columns (att, str, def, mag, pro, vit, cra, luc, gat)
--   - total_level (calculated via trigger)

-- QUESTION: What do the abbreviated columns represent?
--   att, str, def, mag, pro, vit, cra, luc, gat
--   These might be:
--     - Legacy combat stats?
--     - Aggregated skill levels?
--     - Something else?

-- If these are redundant with individual skill levels, they can be removed.

-- ============================================
-- 🟡 LEGACY: PROFILES TABLE CHARACTER CNFT SLOTS
-- ============================================

-- profiles table has:
--   - character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5
--   - active_character_slot

-- QUESTION: Are multiple character slots still a feature?
--   If YES → Keep
--   If NO → Simplify to single character_cnft column

-- ============================================
-- 🟡 LEGACY: PROFILES TABLE USER TYPE
-- ============================================

-- profiles.user_type DEFAULT 'WEB2'
-- QUESTION: What are the possible values?
--   - WEB2 (default)
--   - GUEST (referenced in RLS policies)
--   - WEB3?
--   - Others?

-- This might be legacy if you're moving to a unified auth system.

-- ============================================
-- 🟢 KEEP: CORE TABLES (Still Needed)
-- ============================================

-- ✅ profiles - User accounts
-- ✅ player_skill_experience - Player skill tracking (new system)
-- ✅ player_items - Inventory
-- ✅ nfts - Character NFTs
-- ✅ pda_creation_log - PDA creation tracking
-- ✅ chunks - World chunk data
-- ✅ map_saves - Map/world saves
-- ✅ quests - Quest system
-- ✅ experience_logs - Experience logging (if still used)
-- ✅ xp_award_events - Idempotent XP awards (if still used)

-- ============================================
-- 🟢 KEEP: CORE FUNCTIONS (Still Needed)
-- ============================================

-- ✅ calculate_total_level - Calculates total level from skills
-- ✅ handle_new_user - Creates profile on user signup
-- ✅ update_nft_total_level - Trigger function for total_level
-- ✅ update_updated_at_column - Generic updated_at trigger
-- ✅ set_updated_at - Generic updated_at trigger
-- ✅ get_pda_stats - Analytics
-- ✅ get_total_pda_costs - Analytics

-- ============================================
-- 🟢 KEEP: VIEWS (Still Useful)
-- ============================================

-- ✅ skill_categories - Categorizes skills
-- ✅ skill_leaderboards - Rankings
-- ✅ total_level_rankings - Total level rankings
-- ✅ cnft_minting_analytics - Item minting analytics
-- ✅ pda_cost_analytics - PDA creation analytics
-- ✅ player_pda_summary - Profile summary
-- ✅ view_map_save_interactions - Map interactions (if using map_saves)
-- ✅ view_map_save_npcs - Map NPCs (if using map_saves)

-- ============================================
-- SUMMARY OF RECOMMENDED CLEANUP
-- ============================================

-- HIGH PRIORITY:
--   1. Remove legacy skill fields from player_skill_experience
--   2. Drop duplicate indexes
--   3. Resolve virtual_balances/economy_transactions function issue
--   4. Consolidate skill tracking (nfts vs nft_skill_experience)

-- MEDIUM PRIORITY:
--   5. Evaluate if map_editor_* tables are needed for Unity
--   6. Consolidate experience logging tables (if possible)
--   7. Clarify NFT table abbreviated columns purpose

-- LOW PRIORITY:
--   8. Evaluate character slot system (still using 5 slots?)
--   9. Review user_type system (still needed?)

