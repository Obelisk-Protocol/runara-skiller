-- Add skill experience tracking tables
-- This enables fast XP updates without blockchain transactions

-- Main skill experience table
CREATE TABLE IF NOT EXISTS player_skill_experience (
    player_pda VARCHAR(44) PRIMARY KEY,
    
    -- Experience points for each skill
    combat_xp BIGINT DEFAULT 0 CHECK (combat_xp >= 0),
    magic_xp BIGINT DEFAULT 0 CHECK (magic_xp >= 0),
    crafting_xp BIGINT DEFAULT 0 CHECK (crafting_xp >= 0),
    exploration_xp BIGINT DEFAULT 0 CHECK (exploration_xp >= 0),
    gambling_xp BIGINT DEFAULT 0 CHECK (gambling_xp >= 0),
    
    -- Cached levels (calculated from experience)
    combat_level INTEGER DEFAULT 1 CHECK (combat_level >= 1 AND combat_level <= 120),
    magic_level INTEGER DEFAULT 1 CHECK (magic_level >= 1 AND magic_level <= 120),
    crafting_level INTEGER DEFAULT 1 CHECK (crafting_level >= 1 AND crafting_level <= 120),
    exploration_level INTEGER DEFAULT 1 CHECK (exploration_level >= 1 AND exploration_level <= 120),
    gambling_level INTEGER DEFAULT 1 CHECK (gambling_level >= 1 AND gambling_level <= 120),
    
    -- Sync tracking
    last_onchain_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    pending_onchain_update BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Experience gain logs for analytics
CREATE TABLE IF NOT EXISTS experience_logs (
    id SERIAL PRIMARY KEY,
    player_pda VARCHAR(44) NOT NULL,
    skill VARCHAR(20) NOT NULL CHECK (skill IN ('combat', 'magic', 'crafting', 'exploration', 'gambling')),
    experience_gain INTEGER NOT NULL CHECK (experience_gain > 0),
    source VARCHAR(50), -- e.g., 'dungeon_kill', 'casino_win', 'crafting_success'
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Additional context
    session_id UUID,
    game_mode VARCHAR(30), -- e.g., 'dungeon', 'casino', 'crafting'
    additional_data JSONB -- flexible field for extra context
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_pda ON player_skill_experience(player_pda);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_pending ON player_skill_experience(pending_onchain_update) WHERE pending_onchain_update = true;
CREATE INDEX IF NOT EXISTS idx_experience_logs_player ON experience_logs(player_pda);
CREATE INDEX IF NOT EXISTS idx_experience_logs_timestamp ON experience_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_experience_logs_skill ON experience_logs(skill);
CREATE INDEX IF NOT EXISTS idx_experience_logs_source ON experience_logs(source);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_player_skill_experience_updated_at
    BEFORE UPDATE ON player_skill_experience
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (Row Level Security)
ALTER TABLE player_skill_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_logs ENABLE ROW LEVEL SECURITY;

-- Players can read their own data
CREATE POLICY "Players can view own skill data" ON player_skill_experience
    FOR SELECT USING (true); -- For now, allow all reads (can restrict later)

-- Service role can manage all data
CREATE POLICY "Service role full access" ON player_skill_experience
    FOR ALL USING (true);

CREATE POLICY "Service role full access logs" ON experience_logs
    FOR ALL USING (true);

-- Add some sample data for testing (optional)
-- INSERT INTO player_skill_experience (player_pda, combat_xp, combat_level) 
-- VALUES ('test_pda_123', 1154, 10) ON CONFLICT DO NOTHING;

-- Useful views for analytics
CREATE OR REPLACE VIEW skill_leaderboards AS
SELECT 
    skill,
    player_pda,
    CASE 
        WHEN skill = 'combat' THEN combat_level
        WHEN skill = 'magic' THEN magic_level
        WHEN skill = 'crafting' THEN crafting_level
        WHEN skill = 'exploration' THEN exploration_level
        WHEN skill = 'gambling' THEN gambling_level
    END as level,
    CASE 
        WHEN skill = 'combat' THEN combat_xp
        WHEN skill = 'magic' THEN magic_xp
        WHEN skill = 'crafting' THEN crafting_xp
        WHEN skill = 'exploration' THEN exploration_xp
        WHEN skill = 'gambling' THEN gambling_xp
    END as experience
FROM player_skill_experience
CROSS JOIN (VALUES ('combat'), ('magic'), ('crafting'), ('exploration'), ('gambling')) AS skills(skill)
ORDER BY level DESC, experience DESC;

-- View for total level rankings (like Runescape)
CREATE OR REPLACE VIEW total_level_rankings AS
SELECT 
    player_pda,
    combat_level + magic_level + crafting_level + exploration_level + gambling_level as total_level,
    combat_xp + magic_xp + crafting_xp + exploration_xp + gambling_xp as total_experience,
    last_onchain_sync
FROM player_skill_experience
ORDER BY total_level DESC, total_experience DESC;