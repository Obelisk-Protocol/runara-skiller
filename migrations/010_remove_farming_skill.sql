-- ============================================
-- REMOVE FARMING SKILL MIGRATION
-- Date: January 2025
-- Purpose: Remove farming skill entirely from the system
-- Impact: Reduces total skills from 18 to 17 (6 combat + 4 gathering + 5 crafting + 1 unique)
-- ============================================

-- ============================================
-- PART 1: REMOVE FARMING COLUMNS FROM nfts TABLE
-- ============================================

-- Drop farming column from nfts table
ALTER TABLE nfts 
DROP COLUMN IF EXISTS farming;

-- ============================================
-- PART 2: DROP DEPENDENT VIEWS
-- ============================================

-- Drop views that depend on farming columns
DROP VIEW IF EXISTS skill_leaderboards CASCADE;
DROP VIEW IF EXISTS total_level_rankings CASCADE;

-- ============================================
-- PART 3: REMOVE FARMING COLUMNS FROM player_skill_experience TABLE
-- ============================================

-- Drop farming_xp and farming_level columns
ALTER TABLE player_skill_experience 
DROP COLUMN IF EXISTS farming_xp;

ALTER TABLE player_skill_experience 
DROP COLUMN IF EXISTS farming_level;

-- Drop farming level index
DROP INDEX IF EXISTS idx_player_skill_experience_farming_level;

-- ============================================
-- PART 4: UPDATE CHECK CONSTRAINTS
-- ============================================

-- Note: player_skill_experience table does NOT have a 'skill' column
-- It uses separate columns (attack_xp, strength_xp, etc.) which are already handled in PART 3

-- Remove 'farming' from experience_logs.skill CHECK constraint
ALTER TABLE experience_logs
DROP CONSTRAINT IF EXISTS experience_logs_skill_check;

ALTER TABLE experience_logs
ADD CONSTRAINT experience_logs_skill_check 
CHECK (skill::text = ANY (ARRAY[
  'attack'::character varying, 'strength'::character varying, 'defense'::character varying, 
  'magic'::character varying, 'projectiles'::character varying, 'vitality'::character varying, 
  'mining'::character varying, 'woodcutting'::character varying, 'fishing'::character varying, 
  'hunting'::character varying, 'smithing'::character varying, 'crafting'::character varying, 
  'cooking'::character varying, 'alchemy'::character varying, 'construction'::character varying, 
  'luck'::character varying
]::text[]));

-- Remove 'farming' from nft_skill_experience.skill CHECK constraint (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'nft_skill_experience' 
    AND constraint_name = 'nft_skill_experience_skill_check'
  ) THEN
    ALTER TABLE nft_skill_experience
    DROP CONSTRAINT nft_skill_experience_skill_check;
    
    ALTER TABLE nft_skill_experience
    ADD CONSTRAINT nft_skill_experience_skill_check 
    CHECK (skill = ANY (ARRAY[
      'attack'::text, 'strength'::text, 'defense'::text, 'magic'::text, 
      'projectiles'::text, 'vitality'::text, 'mining'::text, 
      'woodcutting'::text, 'fishing'::text, 'hunting'::text, 
      'smithing'::text, 'crafting'::text, 'cooking'::text, 
      'alchemy'::text, 'construction'::text, 'luck'::text
    ]));
  END IF;
END $$;

-- ============================================
-- PART 5: RECREATE VIEWS WITHOUT FARMING
-- ============================================

-- Recreate skill_leaderboards view without farming
CREATE OR REPLACE VIEW skill_leaderboards AS
SELECT 
    skills.skill,
    player_skill_experience.player_pda,
    CASE
        WHEN skills.skill = 'attack' THEN player_skill_experience.attack_level
        WHEN skills.skill = 'strength' THEN player_skill_experience.strength_level
        WHEN skills.skill = 'defense' THEN player_skill_experience.defense_level
        WHEN skills.skill = 'magic' THEN player_skill_experience.magic_level
        WHEN skills.skill = 'projectiles' THEN player_skill_experience.projectiles_level
        WHEN skills.skill = 'vitality' THEN player_skill_experience.vitality_level
        WHEN skills.skill = 'mining' THEN player_skill_experience.mining_level
        WHEN skills.skill = 'woodcutting' THEN player_skill_experience.woodcutting_level
        WHEN skills.skill = 'fishing' THEN player_skill_experience.fishing_level
        WHEN skills.skill = 'hunting' THEN player_skill_experience.hunting_level
        WHEN skills.skill = 'smithing' THEN player_skill_experience.smithing_level
        WHEN skills.skill = 'crafting' THEN player_skill_experience.crafting_level
        WHEN skills.skill = 'cooking' THEN player_skill_experience.cooking_level
        WHEN skills.skill = 'alchemy' THEN player_skill_experience.alchemy_level
        WHEN skills.skill = 'construction' THEN player_skill_experience.construction_level
        WHEN skills.skill = 'luck' THEN player_skill_experience.luck_level
        ELSE NULL::integer
    END AS level,
    CASE
        WHEN skills.skill = 'attack' THEN player_skill_experience.attack_xp
        WHEN skills.skill = 'strength' THEN player_skill_experience.strength_xp
        WHEN skills.skill = 'defense' THEN player_skill_experience.defense_xp
        WHEN skills.skill = 'magic' THEN player_skill_experience.magic_xp
        WHEN skills.skill = 'projectiles' THEN player_skill_experience.projectiles_xp
        WHEN skills.skill = 'vitality' THEN player_skill_experience.vitality_xp
        WHEN skills.skill = 'mining' THEN player_skill_experience.mining_xp
        WHEN skills.skill = 'woodcutting' THEN player_skill_experience.woodcutting_xp
        WHEN skills.skill = 'fishing' THEN player_skill_experience.fishing_xp
        WHEN skills.skill = 'hunting' THEN player_skill_experience.hunting_xp
        WHEN skills.skill = 'smithing' THEN player_skill_experience.smithing_xp
        WHEN skills.skill = 'crafting' THEN player_skill_experience.crafting_xp
        WHEN skills.skill = 'cooking' THEN player_skill_experience.cooking_xp
        WHEN skills.skill = 'alchemy' THEN player_skill_experience.alchemy_xp
        WHEN skills.skill = 'construction' THEN player_skill_experience.construction_xp
        WHEN skills.skill = 'luck' THEN player_skill_experience.luck_xp
        ELSE NULL::bigint
    END AS experience
FROM player_skill_experience
CROSS JOIN (VALUES 
    ('attack'), ('strength'), ('defense'), ('magic'), ('projectiles'), ('vitality'),
    ('mining'), ('woodcutting'), ('fishing'), ('hunting'),
    ('smithing'), ('crafting'), ('cooking'), ('alchemy'), ('construction'),
    ('luck')
) AS skills(skill)
ORDER BY level DESC, experience DESC;

-- Recreate total_level_rankings view without farming
CREATE OR REPLACE VIEW total_level_rankings AS
SELECT 
    player_pda,
    attack_level + strength_level + defense_level + magic_level + projectiles_level + vitality_level +
    mining_level + woodcutting_level + fishing_level + hunting_level +
    smithing_level + crafting_level + cooking_level + alchemy_level + construction_level + luck_level AS total_level,
    attack_xp + strength_xp + defense_xp + magic_xp + projectiles_xp + vitality_xp +
    mining_xp + woodcutting_xp + fishing_xp + hunting_xp +
    smithing_xp + crafting_xp + cooking_xp + alchemy_xp + construction_xp + luck_xp AS total_experience,
    last_onchain_sync
FROM player_skill_experience
ORDER BY total_level DESC, total_experience DESC;

-- ============================================
-- PART 6: CLEANUP EXISTING FARMING DATA
-- ============================================

-- Delete any existing farming skill experience records from nft_skill_experience
-- Note: player_skill_experience doesn't have a 'skill' column - it uses separate columns
-- (farming_xp and farming_level) which are already dropped in PART 3
DELETE FROM nft_skill_experience 
WHERE skill = 'farming';

-- ============================================
-- VERIFICATION QUERIES (for manual checking)
-- ============================================

-- Verify farming columns are removed
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'nfts' AND column_name LIKE '%farming%';
-- Should return 0 rows

-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'player_skill_experience' AND column_name LIKE '%farming%';
-- Should return 0 rows

-- Verify no farming skill records exist
-- SELECT COUNT(*) FROM player_skill_experience WHERE skill = 'farming';
-- Should return 0

-- SELECT COUNT(*) FROM nft_skill_experience WHERE skill = 'farming';
-- Should return 0

