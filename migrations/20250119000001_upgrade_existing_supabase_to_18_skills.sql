-- Migration to upgrade existing Supabase schema to 18-skill system
-- This migration updates the existing tables to support all 18 individual skills

-- First, drop the existing constraint to allow data updates
ALTER TABLE experience_logs 
DROP CONSTRAINT IF EXISTS experience_logs_skill_check;

-- Now let's check what skill values exist in experience_logs
-- and update them to match our new 18-skill system
DO $$
DECLARE
    old_skill_count INTEGER;
BEGIN
    -- Check if there are any old skill values
    SELECT COUNT(*) INTO old_skill_count 
    FROM experience_logs 
    WHERE skill NOT IN (
        'attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality',
        'mining', 'woodcutting', 'fishing', 'farming', 'hunting',
        'smithing', 'crafting', 'cooking', 'alchemy', 'construction',
        'luck'
    );
    
    IF old_skill_count > 0 THEN
        RAISE NOTICE 'Found % rows with old skill values. Updating them...', old_skill_count;
        
        -- Update old skill values to new ones
        UPDATE experience_logs 
        SET skill = CASE 
            WHEN skill = 'combat' THEN 'attack'
            WHEN skill = 'magic' THEN 'magic'
            WHEN skill = 'crafting' THEN 'crafting'
            WHEN skill = 'exploration' THEN 'mining'
            WHEN skill = 'gambling' THEN 'luck'
            ELSE skill
        END
        WHERE skill IN ('combat', 'magic', 'crafting', 'exploration', 'gambling');
        
        RAISE NOTICE 'Updated old skill values to new 18-skill format.';
    ELSE
        RAISE NOTICE 'No old skill values found. Proceeding with migration.';
    END IF;
END $$;

-- Now update the nft_skill_experience table to support all 18 skills
-- Drop the existing constraint and add the new one
ALTER TABLE nft_skill_experience 
DROP CONSTRAINT IF EXISTS nft_skill_experience_skill_check;

ALTER TABLE nft_skill_experience 
ADD CONSTRAINT nft_skill_experience_skill_check 
CHECK (skill IN (
    'attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality',
    'mining', 'woodcutting', 'fishing', 'farming', 'hunting',
    'smithing', 'crafting', 'cooking', 'alchemy', 'construction',
    'luck'
));

-- Update the experience_logs table to support all 18 skills
-- (Constraint was already dropped above, now we add it back)
ALTER TABLE experience_logs 
ADD CONSTRAINT experience_logs_skill_check 
CHECK (skill IN (
    'attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality',
    'mining', 'woodcutting', 'fishing', 'farming', 'hunting',
    'smithing', 'crafting', 'cooking', 'alchemy', 'construction',
    'luck'
));

-- Add new columns to player_skill_experience for individual skills
-- Add XP columns for all 18 skills
ALTER TABLE player_skill_experience 
ADD COLUMN IF NOT EXISTS attack_xp BIGINT DEFAULT 0 CHECK (attack_xp >= 0),
ADD COLUMN IF NOT EXISTS strength_xp BIGINT DEFAULT 0 CHECK (strength_xp >= 0),
ADD COLUMN IF NOT EXISTS defense_xp BIGINT DEFAULT 0 CHECK (defense_xp >= 0),
ADD COLUMN IF NOT EXISTS magic_xp BIGINT DEFAULT 0 CHECK (magic_xp >= 0),
ADD COLUMN IF NOT EXISTS projectiles_xp BIGINT DEFAULT 0 CHECK (projectiles_xp >= 0),
ADD COLUMN IF NOT EXISTS vitality_xp BIGINT DEFAULT 0 CHECK (vitality_xp >= 0),
ADD COLUMN IF NOT EXISTS mining_xp BIGINT DEFAULT 0 CHECK (mining_xp >= 0),
ADD COLUMN IF NOT EXISTS woodcutting_xp BIGINT DEFAULT 0 CHECK (woodcutting_xp >= 0),
ADD COLUMN IF NOT EXISTS fishing_xp BIGINT DEFAULT 0 CHECK (fishing_xp >= 0),
ADD COLUMN IF NOT EXISTS farming_xp BIGINT DEFAULT 0 CHECK (farming_xp >= 0),
ADD COLUMN IF NOT EXISTS hunting_xp BIGINT DEFAULT 0 CHECK (hunting_xp >= 0),
ADD COLUMN IF NOT EXISTS smithing_xp BIGINT DEFAULT 0 CHECK (smithing_xp >= 0),
ADD COLUMN IF NOT EXISTS crafting_xp BIGINT DEFAULT 0 CHECK (crafting_xp >= 0),
ADD COLUMN IF NOT EXISTS cooking_xp BIGINT DEFAULT 0 CHECK (cooking_xp >= 0),
ADD COLUMN IF NOT EXISTS alchemy_xp BIGINT DEFAULT 0 CHECK (alchemy_xp >= 0),
ADD COLUMN IF NOT EXISTS construction_xp BIGINT DEFAULT 0 CHECK (construction_xp >= 0),
ADD COLUMN IF NOT EXISTS luck_xp BIGINT DEFAULT 0 CHECK (luck_xp >= 0);

-- Add level columns for all 18 skills
ALTER TABLE player_skill_experience 
ADD COLUMN IF NOT EXISTS attack_level INTEGER DEFAULT 1 CHECK (attack_level >= 1 AND attack_level <= 99),
ADD COLUMN IF NOT EXISTS strength_level INTEGER DEFAULT 1 CHECK (strength_level >= 1 AND strength_level <= 99),
ADD COLUMN IF NOT EXISTS defense_level INTEGER DEFAULT 1 CHECK (defense_level >= 1 AND defense_level <= 99),
ADD COLUMN IF NOT EXISTS magic_level INTEGER DEFAULT 1 CHECK (magic_level >= 1 AND magic_level <= 99),
ADD COLUMN IF NOT EXISTS projectiles_level INTEGER DEFAULT 1 CHECK (projectiles_level >= 1 AND projectiles_level <= 99),
ADD COLUMN IF NOT EXISTS vitality_level INTEGER DEFAULT 1 CHECK (vitality_level >= 1 AND vitality_level <= 99),
ADD COLUMN IF NOT EXISTS mining_level INTEGER DEFAULT 1 CHECK (mining_level >= 1 AND mining_level <= 99),
ADD COLUMN IF NOT EXISTS woodcutting_level INTEGER DEFAULT 1 CHECK (woodcutting_level >= 1 AND woodcutting_level <= 99),
ADD COLUMN IF NOT EXISTS fishing_level INTEGER DEFAULT 1 CHECK (fishing_level >= 1 AND fishing_level <= 99),
ADD COLUMN IF NOT EXISTS farming_level INTEGER DEFAULT 1 CHECK (farming_level >= 1 AND farming_level <= 99),
ADD COLUMN IF NOT EXISTS hunting_level INTEGER DEFAULT 1 CHECK (hunting_level >= 1 AND hunting_level <= 99),
ADD COLUMN IF NOT EXISTS smithing_level INTEGER DEFAULT 1 CHECK (smithing_level >= 1 AND smithing_level <= 99),
ADD COLUMN IF NOT EXISTS crafting_level INTEGER DEFAULT 1 CHECK (crafting_level >= 1 AND crafting_level <= 99),
ADD COLUMN IF NOT EXISTS cooking_level INTEGER DEFAULT 1 CHECK (cooking_level >= 1 AND cooking_level <= 99),
ADD COLUMN IF NOT EXISTS alchemy_level INTEGER DEFAULT 1 CHECK (alchemy_level >= 1 AND alchemy_level <= 99),
ADD COLUMN IF NOT EXISTS construction_level INTEGER DEFAULT 1 CHECK (construction_level >= 1 AND construction_level <= 99),
ADD COLUMN IF NOT EXISTS luck_level INTEGER DEFAULT 1 CHECK (luck_level >= 1 AND luck_level <= 99);

-- Update the nfts table to support the new skill structure
-- Add columns for individual skill levels (matching the character stats structure)
ALTER TABLE nfts 
ADD COLUMN IF NOT EXISTS mining_level INTEGER DEFAULT 1 CHECK (mining_level >= 1 AND mining_level <= 99),
ADD COLUMN IF NOT EXISTS woodcutting_level INTEGER DEFAULT 1 CHECK (woodcutting_level >= 1 AND woodcutting_level <= 99),
ADD COLUMN IF NOT EXISTS fishing_level INTEGER DEFAULT 1 CHECK (fishing_level >= 1 AND fishing_level <= 99),
ADD COLUMN IF NOT EXISTS farming_level INTEGER DEFAULT 1 CHECK (farming_level >= 1 AND farming_level <= 99),
ADD COLUMN IF NOT EXISTS hunting_level INTEGER DEFAULT 1 CHECK (hunting_level >= 1 AND hunting_level <= 99),
ADD COLUMN IF NOT EXISTS smithing_level INTEGER DEFAULT 1 CHECK (smithing_level >= 1 AND smithing_level <= 99),
ADD COLUMN IF NOT EXISTS cooking_level INTEGER DEFAULT 1 CHECK (cooking_level >= 1 AND cooking_level <= 99),
ADD COLUMN IF NOT EXISTS alchemy_level INTEGER DEFAULT 1 CHECK (alchemy_level >= 1 AND alchemy_level <= 99),
ADD COLUMN IF NOT EXISTS construction_level INTEGER DEFAULT 1 CHECK (construction_level >= 1 AND construction_level <= 99);

-- Update the total_level calculation to include all 18 skills
-- First, let's create a function to calculate total level
CREATE OR REPLACE FUNCTION calculate_total_level(
    att INTEGER, str INTEGER, def INTEGER, mag INTEGER, pro INTEGER, vit INTEGER,
    cra INTEGER, luc INTEGER, gat INTEGER,
    mining INTEGER, woodcutting INTEGER, fishing INTEGER, farming INTEGER, hunting INTEGER,
    smithing INTEGER, cooking INTEGER, alchemy INTEGER, construction INTEGER
) RETURNS INTEGER AS $$
BEGIN
    RETURN att + str + def + mag + pro + vit + cra + luc + gat +
           mining + woodcutting + fishing + farming + hunting +
           smithing + cooking + alchemy + construction;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically update total_level when skill levels change
CREATE OR REPLACE FUNCTION update_nft_total_level()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_level = calculate_total_level(
        NEW.att, NEW.str, NEW.def, NEW.mag, NEW.pro, NEW.vit,
        NEW.cra, NEW.luc, NEW.gat,
        NEW.mining_level, NEW.woodcutting_level, NEW.fishing_level, 
        NEW.farming_level, NEW.hunting_level,
        NEW.smithing_level, NEW.cooking_level, NEW.alchemy_level, NEW.construction_level
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_nft_total_level ON nfts;
CREATE TRIGGER trigger_update_nft_total_level
    BEFORE INSERT OR UPDATE ON nfts
    FOR EACH ROW
    EXECUTE FUNCTION update_nft_total_level();

-- Update existing records to have the new skill levels
-- Set all new skill levels to 1 for existing records
UPDATE nfts SET 
    mining_level = 1,
    woodcutting_level = 1,
    fishing_level = 1,
    farming_level = 1,
    hunting_level = 1,
    smithing_level = 1,
    cooking_level = 1,
    alchemy_level = 1,
    construction_level = 1
WHERE mining_level IS NULL;

-- Update total_level for existing records
UPDATE nfts SET total_level = calculate_total_level(
    att, str, def, mag, pro, vit, cra, luc, gat,
    mining_level, woodcutting_level, fishing_level, farming_level, hunting_level,
    smithing_level, cooking_level, alchemy_level, construction_level
);

-- Create updated skill leaderboards view
CREATE OR REPLACE VIEW skill_leaderboards AS
SELECT 
    skill,
    player_pda,
    CASE 
        WHEN skill = 'attack' THEN attack_level
        WHEN skill = 'strength' THEN strength_level
        WHEN skill = 'defense' THEN defense_level
        WHEN skill = 'magic' THEN magic_level
        WHEN skill = 'projectiles' THEN projectiles_level
        WHEN skill = 'vitality' THEN vitality_level
        WHEN skill = 'mining' THEN mining_level
        WHEN skill = 'woodcutting' THEN woodcutting_level
        WHEN skill = 'fishing' THEN fishing_level
        WHEN skill = 'farming' THEN farming_level
        WHEN skill = 'hunting' THEN hunting_level
        WHEN skill = 'smithing' THEN smithing_level
        WHEN skill = 'crafting' THEN crafting_level
        WHEN skill = 'cooking' THEN cooking_level
        WHEN skill = 'alchemy' THEN alchemy_level
        WHEN skill = 'construction' THEN construction_level
        WHEN skill = 'luck' THEN luck_level
    END as level,
    CASE 
        WHEN skill = 'attack' THEN attack_xp
        WHEN skill = 'strength' THEN strength_xp
        WHEN skill = 'defense' THEN defense_xp
        WHEN skill = 'magic' THEN magic_xp
        WHEN skill = 'projectiles' THEN projectiles_xp
        WHEN skill = 'vitality' THEN vitality_xp
        WHEN skill = 'mining' THEN mining_xp
        WHEN skill = 'woodcutting' THEN woodcutting_xp
        WHEN skill = 'fishing' THEN fishing_xp
        WHEN skill = 'farming' THEN farming_xp
        WHEN skill = 'hunting' THEN hunting_xp
        WHEN skill = 'smithing' THEN smithing_xp
        WHEN skill = 'crafting' THEN crafting_xp
        WHEN skill = 'cooking' THEN cooking_xp
        WHEN skill = 'alchemy' THEN alchemy_xp
        WHEN skill = 'construction' THEN construction_xp
        WHEN skill = 'luck' THEN luck_xp
    END as experience
FROM player_skill_experience
CROSS JOIN (VALUES 
    ('attack'), ('strength'), ('defense'), ('magic'), ('projectiles'), ('vitality'),
    ('mining'), ('woodcutting'), ('fishing'), ('farming'), ('hunting'),
    ('smithing'), ('crafting'), ('cooking'), ('alchemy'), ('construction'),
    ('luck')
) AS skills(skill)
ORDER BY level DESC, experience DESC;

-- Create updated total level rankings view
CREATE OR REPLACE VIEW total_level_rankings AS
SELECT 
    player_pda,
    attack_level + strength_level + defense_level + magic_level + projectiles_level + vitality_level +
    mining_level + woodcutting_level + fishing_level + farming_level + hunting_level +
    smithing_level + crafting_level + cooking_level + alchemy_level + construction_level + luck_level as total_level,
    attack_xp + strength_xp + defense_xp + magic_xp + projectiles_xp + vitality_xp +
    mining_xp + woodcutting_xp + fishing_xp + farming_xp + hunting_xp +
    smithing_xp + crafting_xp + cooking_xp + alchemy_xp + construction_xp + luck_xp as total_experience,
    last_onchain_sync
FROM player_skill_experience
ORDER BY total_level DESC, total_experience DESC;

-- Create skill categories view for better organization
CREATE OR REPLACE VIEW skill_categories AS
SELECT 
    'combat' as category,
    ARRAY['attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality'] as skills
UNION ALL
SELECT 
    'gathering' as category,
    ARRAY['mining', 'woodcutting', 'fishing', 'farming', 'hunting'] as skills
UNION ALL
SELECT 
    'crafting' as category,
    ARRAY['smithing', 'crafting', 'cooking', 'alchemy', 'construction'] as skills
UNION ALL
SELECT 
    'unique' as category,
    ARRAY['luck'] as skills;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_attack_level ON player_skill_experience(attack_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_strength_level ON player_skill_experience(strength_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_defense_level ON player_skill_experience(defense_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_magic_level ON player_skill_experience(magic_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_projectiles_level ON player_skill_experience(projectiles_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_vitality_level ON player_skill_experience(vitality_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_mining_level ON player_skill_experience(mining_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_woodcutting_level ON player_skill_experience(woodcutting_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_fishing_level ON player_skill_experience(fishing_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_farming_level ON player_skill_experience(farming_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_hunting_level ON player_skill_experience(hunting_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_smithing_level ON player_skill_experience(smithing_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_crafting_level ON player_skill_experience(crafting_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_cooking_level ON player_skill_experience(cooking_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_alchemy_level ON player_skill_experience(alchemy_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_construction_level ON player_skill_experience(construction_level);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_luck_level ON player_skill_experience(luck_level);

-- Add comments for documentation
COMMENT ON TABLE nft_skill_experience IS 'Individual skill experience tracking for each cNFT asset - now supports all 18 skills';
COMMENT ON TABLE player_skill_experience IS 'Player skill experience tracking - now supports all 18 individual skills';
COMMENT ON VIEW skill_leaderboards IS 'Leaderboards for all 18 individual skills';
COMMENT ON VIEW total_level_rankings IS 'Total level rankings across all 18 skills';
COMMENT ON VIEW skill_categories IS 'Skill categorization for UI organization';

-- Migration complete message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully! Database now supports all 18 skills.';
    RAISE NOTICE 'New skills added: mining, woodcutting, fishing, farming, hunting, smithing, cooking, alchemy, construction';
    RAISE NOTICE 'All existing data has been preserved and new skill columns initialized to level 1.';
END $$;
