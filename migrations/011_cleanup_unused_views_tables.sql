-- ============================================
-- CLEANUP UNUSED VIEWS AND TABLES
-- Date: January 2025
-- Purpose: Remove unused database objects based on review
-- ============================================

-- ============================================
-- PART 1: REMOVE UNUSED TABLE
-- ============================================

-- Remove map_editor_animations table (unused - animation data stored in chunk JSONB)
DROP TABLE IF EXISTS map_editor_animations CASCADE;

-- ============================================
-- PART 2: REMOVE UNUSED VIEWS
-- ============================================

-- Remove action_skill_mapping view (not queried - code uses action_skills table directly)
DROP VIEW IF EXISTS action_skill_mapping CASCADE;

-- Remove skill_categories view (not queried - categories hardcoded in application code)
DROP VIEW IF EXISTS skill_categories CASCADE;

-- Remove pda_cost_analytics view (redundant - user confirmed)
DROP VIEW IF EXISTS pda_cost_analytics CASCADE;

-- Remove player_pda_summary view (redundant - user confirmed)
DROP VIEW IF EXISTS player_pda_summary CASCADE;

-- Remove skill_leaderboards view (not used by client - can be computed on-demand)
-- Note: API endpoint was removed from obelisk-skiller/src/routes/skills.ts
DROP VIEW IF EXISTS skill_leaderboards CASCADE;

-- Remove total_level_rankings view (not used by client - can be computed on-demand)
-- Note: API endpoint was removed from obelisk-skiller/src/routes/skills.ts
DROP VIEW IF EXISTS total_level_rankings CASCADE;

