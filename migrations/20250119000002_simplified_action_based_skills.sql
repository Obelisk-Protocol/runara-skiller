-- Simplified Action-Based Skill System Migration
-- This creates a clean, simple system for action-based skill training

-- First, let's create a simple action_skills mapping table
CREATE TABLE IF NOT EXISTS action_skills (
    action VARCHAR(50) PRIMARY KEY,
    skill VARCHAR(20) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert the action-to-skill mappings
INSERT INTO action_skills (action, skill, description) VALUES
-- Combat Actions
('attack_enemy', 'attack', 'Attacking enemies with melee weapons'),
('strength_training', 'strength', 'Training physical strength'),
('defend', 'defense', 'Defending against attacks'),
('cast_spell', 'magic', 'Casting magical spells'),
('shoot_arrow', 'projectiles', 'Using ranged weapons'),
('heal', 'vitality', 'Healing and health management'),

-- Gathering Actions
('mine_rock', 'mining', 'Mining rocks and ores'),
('chop_tree', 'woodcutting', 'Cutting down trees'),
('fish', 'fishing', 'Fishing in water bodies'),
('farm_crop', 'farming', 'Growing and harvesting crops'),
('hunt_animal', 'hunting', 'Hunting wild animals'),

-- Crafting Actions
('smith_weapon', 'smithing', 'Smithing weapons and tools'),
('craft_item', 'crafting', 'Crafting various items'),
('cook_food', 'cooking', 'Cooking food and potions'),
('brew_potion', 'alchemy', 'Brewing potions and elixirs'),
('build_structure', 'construction', 'Building structures and buildings'),

-- Unique Actions
('gamble', 'luck', 'Gambling and luck-based activities')

ON CONFLICT (action) DO NOTHING;

-- Create a simplified skill training endpoint table for logging
CREATE TABLE IF NOT EXISTS skill_training_logs (
    id SERIAL PRIMARY KEY,
    asset_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    skill VARCHAR(20) NOT NULL,
    exp_gained INTEGER NOT NULL CHECK (exp_gained > 0),
    player_pda VARCHAR(255),
    session_id VARCHAR(255),
    game_mode VARCHAR(50),
    additional_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Foreign key to action_skills
    FOREIGN KEY (action) REFERENCES action_skills(action)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_skill_training_logs_asset_id ON skill_training_logs(asset_id);
CREATE INDEX IF NOT EXISTS idx_skill_training_logs_action ON skill_training_logs(action);
CREATE INDEX IF NOT EXISTS idx_skill_training_logs_skill ON skill_training_logs(skill);
CREATE INDEX IF NOT EXISTS idx_skill_training_logs_created_at ON skill_training_logs(created_at);

-- Create a simple view for action-skill mapping
CREATE OR REPLACE VIEW action_skill_mapping AS
SELECT 
    action,
    skill,
    description
FROM action_skills
ORDER BY skill, action;

-- Add comments for documentation
COMMENT ON TABLE action_skills IS 'Maps game actions to specific skills for training';
COMMENT ON TABLE skill_training_logs IS 'Logs all skill training activities with action-based tracking';
COMMENT ON VIEW action_skill_mapping IS 'Simple view for frontend to get action-skill mappings';

-- Migration complete
DO $$
BEGIN
    RAISE NOTICE 'Action-based skill system migration completed!';
    RAISE NOTICE 'Created action_skills table with 18 action-skill mappings';
    RAISE NOTICE 'Created skill_training_logs table for tracking training activities';
    RAISE NOTICE 'Ready for simple endpoint: POST /api/skills/train with action + exp_gained';
END $$;
