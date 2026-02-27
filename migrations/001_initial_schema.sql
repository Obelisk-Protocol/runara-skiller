-- Create initial schema for obelisk-skiller service
-- Based on Supabase schema from DB.txt

-- Characters table (not in original DB.txt but needed for character service)
CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_cnft_id TEXT NOT NULL UNIQUE,
    player_id UUID NOT NULL,
    character_name TEXT NOT NULL DEFAULT 'Unnamed Player',
    character_level INTEGER NOT NULL DEFAULT 1,
    character_class TEXT NOT NULL DEFAULT 'warrior',
    combat_level INTEGER NOT NULL DEFAULT 1,
    total_level INTEGER NOT NULL DEFAULT 5,
    experience BIGINT NOT NULL DEFAULT 0,
    version TEXT NOT NULL DEFAULT '2.0',
    
    -- Primary stats
    strength INTEGER NOT NULL DEFAULT 10,
    agility INTEGER NOT NULL DEFAULT 10,
    intelligence INTEGER NOT NULL DEFAULT 10,
    vitality INTEGER NOT NULL DEFAULT 10,
    luck INTEGER NOT NULL DEFAULT 10,
    
    -- Equipment
    equipped_weapon TEXT,
    equipped_armor TEXT,
    equipped_accessory TEXT,
    
    -- Achievements
    achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_synced_to_cnft TIMESTAMPTZ
);

-- Experience logs table (from DB.txt)
CREATE TABLE IF NOT EXISTS experience_logs (
    id SERIAL PRIMARY KEY,
    player_pda CHARACTER VARYING NOT NULL,
    skill CHARACTER VARYING NOT NULL CHECK (skill IN ('combat', 'magic', 'crafting', 'exploration', 'gambling')),
    experience_gain INTEGER NOT NULL CHECK (experience_gain > 0),
    source CHARACTER VARYING,
    session_id UUID,
    game_mode CHARACTER VARYING,
    additional_data JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Player skill experience table (from DB.txt)
CREATE TABLE IF NOT EXISTS player_skill_experience (
    player_pda CHARACTER VARYING PRIMARY KEY,
    combat_xp BIGINT DEFAULT 0 CHECK (combat_xp >= 0),
    magic_xp BIGINT DEFAULT 0 CHECK (magic_xp >= 0),
    crafting_xp BIGINT DEFAULT 0 CHECK (crafting_xp >= 0),
    exploration_xp BIGINT DEFAULT 0 CHECK (exploration_xp >= 0),
    gambling_xp BIGINT DEFAULT 0 CHECK (gambling_xp >= 0),
    combat_level INTEGER DEFAULT 1 CHECK (combat_level >= 1 AND combat_level <= 120),
    magic_level INTEGER DEFAULT 1 CHECK (magic_level >= 1 AND magic_level <= 120),
    crafting_level INTEGER DEFAULT 1 CHECK (crafting_level >= 1 AND crafting_level <= 120),
    exploration_level INTEGER DEFAULT 1 CHECK (exploration_level >= 1 AND exploration_level <= 120),
    gambling_level INTEGER DEFAULT 1 CHECK (gambling_level >= 1 AND gambling_level <= 120),
    last_onchain_sync TIMESTAMPTZ DEFAULT NOW(),
    pending_onchain_update BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- cNFT sync records table (for tracking blockchain sync status)
CREATE TABLE IF NOT EXISTS cnft_sync_records (
    cnft_address TEXT PRIMARY KEY,
    player_id UUID NOT NULL,
    last_sync_attempt TIMESTAMPTZ,
    last_successful_sync TIMESTAMPTZ,
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed', 'out_of_date')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    metadata_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Item definitions table (from DB.txt)
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

-- Player items table (from DB.txt)
CREATE TABLE IF NOT EXISTS player_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL,
    item_definition_id TEXT NOT NULL REFERENCES item_definitions(item_id),
    cnft_address TEXT NOT NULL UNIQUE,
    mint_signature TEXT NOT NULL,
    metadata_uri TEXT,
    rarity TEXT,
    item_type TEXT,
    current_durability INTEGER,
    found_in_dungeon TEXT,
    found_on_floor INTEGER,
    last_traded_at TIMESTAMPTZ,
    traded_to_player UUID,
    withdrawn_to_wallet TEXT,
    withdrawn_at TIMESTAMPTZ,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    minted_at TIMESTAMPTZ DEFAULT NOW(),
    mint_cost NUMERIC DEFAULT 0,
    is_stacked BOOLEAN DEFAULT FALSE,
    acquisition_source TEXT DEFAULT 'game_reward'
);

-- Dungeon completions table (from DB.txt)
CREATE TABLE IF NOT EXISTS dungeon_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    dungeon_level INTEGER NOT NULL CHECK (dungeon_level >= 1 AND dungeon_level <= 10),
    time_elapsed INTEGER NOT NULL,
    max_health INTEGER NOT NULL,
    points_earned INTEGER NOT NULL DEFAULT 0,
    enemies_killed INTEGER NOT NULL DEFAULT 0,
    orbs_collected INTEGER NOT NULL DEFAULT 0,
    health_lost INTEGER NOT NULL DEFAULT 0,
    floors_completed INTEGER NOT NULL DEFAULT 0,
    perfect_clear BOOLEAN NOT NULL DEFAULT FALSE,
    tokens_minted INTEGER NOT NULL DEFAULT 0,
    points_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tokens_earned INTEGER NOT NULL DEFAULT 0,
    is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_at TIMESTAMPTZ,
    claim_transaction_id TEXT,
    previous_best_score INTEGER DEFAULT 0,
    is_new_best BOOLEAN DEFAULT FALSE,
    star_rating INTEGER DEFAULT 0,
    max_points_possible INTEGER DEFAULT 0
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_experience_logs_player_pda ON experience_logs(player_pda);
CREATE INDEX IF NOT EXISTS idx_experience_logs_timestamp ON experience_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_experience_logs_skill ON experience_logs(skill);
CREATE INDEX IF NOT EXISTS idx_experience_logs_session_id ON experience_logs(session_id);

CREATE INDEX IF NOT EXISTS idx_characters_player_id ON characters(player_id);
CREATE INDEX IF NOT EXISTS idx_characters_cnft_id ON characters(character_cnft_id);

CREATE INDEX IF NOT EXISTS idx_cnft_sync_records_status ON cnft_sync_records(sync_status);
CREATE INDEX IF NOT EXISTS idx_cnft_sync_records_player_id ON cnft_sync_records(player_id);

CREATE INDEX IF NOT EXISTS idx_player_items_player_id ON player_items(player_id);
CREATE INDEX IF NOT EXISTS idx_player_items_cnft_address ON player_items(cnft_address);

CREATE INDEX IF NOT EXISTS idx_dungeon_completions_wallet ON dungeon_completions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_dungeon_completions_level ON dungeon_completions(dungeon_level);