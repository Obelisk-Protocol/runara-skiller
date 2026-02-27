-- ============================================
-- AUTO-GENERATED SQL CREATE STATEMENTS
-- Generated from db.json export
-- ============================================

-- Table: action_skill_mapping
CREATE TABLE IF NOT EXISTS action_skill_mapping (
    action VARCHAR,
    skill VARCHAR,
    description TEXT
);

-- Table: action_skills
CREATE TABLE IF NOT EXISTS action_skills (
    action VARCHAR NOT NULL,
    skill VARCHAR NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT now()
);

-- Table: chunks
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    data JSONB NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    last_accessed TIMESTAMP
);

-- Table: cnft_minting_analytics
CREATE TABLE IF NOT EXISTS cnft_minting_analytics (
    date TIMESTAMPTZ,
    item_definition_id TEXT,
    item_type TEXT,
    rarity TEXT,
    items_minted BIGINT,
    total_quantity BIGINT,
    total_cost NUMERIC,
    avg_cost_per_item NUMERIC
);

-- Table: experience_logs
CREATE TABLE IF NOT EXISTS experience_logs (
    id INTEGER NOT NULL DEFAULT nextval('experience_logs_id_seq'::regclass),
    player_pda VARCHAR NOT NULL,
    skill VARCHAR NOT NULL,
    experience_gain INTEGER NOT NULL,
    source VARCHAR,
    timestamp TIMESTAMPTZ DEFAULT now(),
    session_id UUID,
    game_mode VARCHAR,
    additional_data JSONB,
    asset_id TEXT
);

-- Table: map_editor_animations
CREATE TABLE IF NOT EXISTS map_editor_animations (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    asset_id TEXT NOT NULL,
    frame_width INTEGER NOT NULL,
    frame_height INTEGER NOT NULL,
    margin INTEGER NOT NULL DEFAULT 0,
    spacing INTEGER NOT NULL DEFAULT 0,
    clips JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version INTEGER NOT NULL DEFAULT 1
);

-- Table: map_editor_collisions
CREATE TABLE IF NOT EXISTS map_editor_collisions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    object_id TEXT NOT NULL,
    placed_object_id TEXT NOT NULL,
    world_name TEXT NOT NULL,
    chunk_x INTEGER NOT NULL,
    chunk_y INTEGER NOT NULL,
    collision_tiles TEXT[] DEFAULT '{}'::text[],
    above_tiles TEXT[] DEFAULT '{}'::text[],
    below_tiles TEXT[] DEFAULT '{}'::text[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    version INTEGER NOT NULL DEFAULT 1,
    interaction_tiles TEXT[] DEFAULT '{}'::text[]
);

-- Table: map_saves
CREATE TABLE IF NOT EXISTS map_saves (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default-user'::text,
    world_name TEXT NOT NULL DEFAULT 'obelisk_world'::text,
    map_name TEXT NOT NULL,
    description TEXT,
    base_chunk_id TEXT,
    base_chunk_name TEXT,
    base_chunk_image_path TEXT,
    chunk_size INTEGER NOT NULL DEFAULT 64,
    world_width INTEGER NOT NULL DEFAULT 2048,
    world_height INTEGER NOT NULL DEFAULT 2048,
    camera_x INTEGER NOT NULL DEFAULT 1024,
    camera_y INTEGER NOT NULL DEFAULT 1024,
    scale REAL NOT NULL DEFAULT 1.0,
    placed_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_public BOOLEAN DEFAULT false,
    tags TEXT[] DEFAULT '{}'::text[],
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    animation_stats JSONB DEFAULT '{}'::jsonb
);

-- Table: nft_skill_experience
CREATE TABLE IF NOT EXISTS nft_skill_experience (
    asset_id TEXT NOT NULL,
    skill TEXT NOT NULL,
    experience BIGINT NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    pending_onchain_update BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: nfts
CREATE TABLE IF NOT EXISTS nfts (
    asset_id TEXT NOT NULL,
    player_pda TEXT,
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    combat_level INTEGER NOT NULL DEFAULT 1,
    total_level INTEGER NOT NULL DEFAULT 9,
    version TEXT NOT NULL DEFAULT '2.0.0'::text,
    att INTEGER NOT NULL DEFAULT 1,
    str INTEGER NOT NULL DEFAULT 1,
    def INTEGER NOT NULL DEFAULT 1,
    mag INTEGER NOT NULL DEFAULT 1,
    pro INTEGER NOT NULL DEFAULT 1,
    vit INTEGER NOT NULL DEFAULT 1,
    cra INTEGER NOT NULL DEFAULT 1,
    luc INTEGER NOT NULL DEFAULT 1,
    gat INTEGER NOT NULL DEFAULT 1,
    last_arweave_uri TEXT,
    last_update_sig TEXT,
    state_version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    mining_level INTEGER DEFAULT 1,
    woodcutting_level INTEGER DEFAULT 1,
    fishing_level INTEGER DEFAULT 1,
    farming_level INTEGER DEFAULT 1,
    hunting_level INTEGER DEFAULT 1,
    smithing_level INTEGER DEFAULT 1,
    cooking_level INTEGER DEFAULT 1,
    alchemy_level INTEGER DEFAULT 1,
    construction_level INTEGER DEFAULT 1
);

-- Table: pda_cost_analytics
CREATE TABLE IF NOT EXISTS pda_cost_analytics (
    date TIMESTAMPTZ,
    pdas_created BIGINT,
    total_cost NUMERIC,
    avg_cost_per_pda NUMERIC,
    min_cost NUMERIC,
    max_cost NUMERIC
);

-- Table: pda_creation_log
CREATE TABLE IF NOT EXISTS pda_creation_log (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL,
    pda_address TEXT NOT NULL,
    creation_cost NUMERIC NOT NULL,
    game_wallet_signature TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: player_items
CREATE TABLE IF NOT EXISTS player_items (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL,
    item_definition_id TEXT NOT NULL,
    cnft_address TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    minted_at TIMESTAMPTZ DEFAULT now(),
    mint_cost NUMERIC DEFAULT 0,
    mint_signature TEXT NOT NULL,
    metadata_uri TEXT,
    rarity TEXT,
    item_type TEXT,
    is_stacked BOOLEAN DEFAULT false,
    current_durability INTEGER,
    acquisition_source TEXT DEFAULT 'game_reward'::text,
    found_in_dungeon TEXT,
    found_on_floor INTEGER,
    last_traded_at TIMESTAMPTZ,
    traded_to_player UUID,
    withdrawn_to_wallet TEXT,
    withdrawn_at TIMESTAMPTZ
);

-- Table: player_pda_summary
CREATE TABLE IF NOT EXISTS player_pda_summary (
    id UUID,
    character_name TEXT,
    player_pda TEXT,
    pda_status TEXT,
    pda_created_at TIMESTAMPTZ,
    pda_creation_cost NUMERIC,
    game_wallet_signature TEXT,
    pda_ownership_status TEXT
);

-- Table: player_skill_experience
CREATE TABLE IF NOT EXISTS player_skill_experience (
    player_pda VARCHAR NOT NULL,
    combat_xp BIGINT DEFAULT 0,
    magic_xp BIGINT DEFAULT 0,
    crafting_xp BIGINT DEFAULT 0,
    exploration_xp BIGINT DEFAULT 0,
    gambling_xp BIGINT DEFAULT 0,
    combat_level INTEGER DEFAULT 1,
    magic_level INTEGER DEFAULT 1,
    crafting_level INTEGER DEFAULT 1,
    exploration_level INTEGER DEFAULT 1,
    gambling_level INTEGER DEFAULT 1,
    last_onchain_sync TIMESTAMPTZ DEFAULT now(),
    pending_onchain_update BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    attack_xp BIGINT DEFAULT 0,
    strength_xp BIGINT DEFAULT 0,
    defense_xp BIGINT DEFAULT 0,
    projectiles_xp BIGINT DEFAULT 0,
    vitality_xp BIGINT DEFAULT 0,
    mining_xp BIGINT DEFAULT 0,
    woodcutting_xp BIGINT DEFAULT 0,
    fishing_xp BIGINT DEFAULT 0,
    farming_xp BIGINT DEFAULT 0,
    hunting_xp BIGINT DEFAULT 0,
    smithing_xp BIGINT DEFAULT 0,
    cooking_xp BIGINT DEFAULT 0,
    alchemy_xp BIGINT DEFAULT 0,
    construction_xp BIGINT DEFAULT 0,
    luck_xp BIGINT DEFAULT 0,
    attack_level INTEGER DEFAULT 1,
    strength_level INTEGER DEFAULT 1,
    defense_level INTEGER DEFAULT 1,
    projectiles_level INTEGER DEFAULT 1,
    vitality_level INTEGER DEFAULT 1,
    mining_level INTEGER DEFAULT 1,
    woodcutting_level INTEGER DEFAULT 1,
    fishing_level INTEGER DEFAULT 1,
    farming_level INTEGER DEFAULT 1,
    hunting_level INTEGER DEFAULT 1,
    smithing_level INTEGER DEFAULT 1,
    cooking_level INTEGER DEFAULT 1,
    alchemy_level INTEGER DEFAULT 1,
    construction_level INTEGER DEFAULT 1,
    luck_level INTEGER DEFAULT 1
);

-- Table: profiles
CREATE TABLE IF NOT EXISTS profiles (
    id UUID NOT NULL,
    player_pda TEXT,
    wallet_address TEXT,
    character_class INTEGER DEFAULT 0,
    character_name TEXT DEFAULT 'Unnamed Player'::text,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    pda_created_at TIMESTAMPTZ,
    pda_creation_cost NUMERIC DEFAULT 0,
    pda_status TEXT DEFAULT 'pending'::text,
    cobx_token_account TEXT,
    character_cnft_1 TEXT,
    character_cnft_2 TEXT,
    character_cnft_3 TEXT,
    character_cnft_4 TEXT,
    character_cnft_5 TEXT,
    active_character_slot INTEGER,
    username TEXT,
    user_type TEXT DEFAULT 'WEB2'::text
);

-- Table: quests
CREATE TABLE IF NOT EXISTS quests (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    world_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    quest_type TEXT NOT NULL,
    min_level INTEGER DEFAULT 1,
    repeatable BOOLEAN DEFAULT false,
    time_limit_ms BIGINT,
    rewards JSONB,
    config JSONB NOT NULL,
    giver_npc_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: skill_categories
CREATE TABLE IF NOT EXISTS skill_categories (
    category TEXT,
    skills TEXT[]
);

-- Table: skill_leaderboards
CREATE TABLE IF NOT EXISTS skill_leaderboards (
    skill TEXT,
    player_pda VARCHAR,
    level INTEGER,
    experience BIGINT
);

-- Table: skill_training_logs
CREATE TABLE IF NOT EXISTS skill_training_logs (
    id INTEGER NOT NULL DEFAULT nextval('skill_training_logs_id_seq'::regclass),
    asset_id VARCHAR NOT NULL,
    action VARCHAR NOT NULL,
    skill VARCHAR NOT NULL,
    exp_gained INTEGER NOT NULL,
    player_pda VARCHAR,
    session_id VARCHAR,
    game_mode VARCHAR,
    additional_data JSONB,
    created_at TIMESTAMP DEFAULT now()
);

-- Table: total_level_rankings
CREATE TABLE IF NOT EXISTS total_level_rankings (
    player_pda VARCHAR,
    total_level INTEGER,
    total_experience BIGINT,
    last_onchain_sync TIMESTAMPTZ
);

-- Table: view_map_save_interactions
CREATE TABLE IF NOT EXISTS view_map_save_interactions (
    map_save_id UUID,
    placed_id TEXT,
    interaction_id TEXT,
    type TEXT,
    name TEXT,
    dialogue_id TEXT,
    distance INTEGER,
    auto_trigger BOOLEAN,
    offset_x INTEGER,
    offset_y INTEGER,
    world_name TEXT,
    map_name TEXT
);

-- Table: view_map_save_npcs
CREATE TABLE IF NOT EXISTS view_map_save_npcs (
    map_save_id UUID,
    placed_id TEXT,
    asset_id TEXT,
    display_name TEXT,
    role TEXT,
    custom_role_name TEXT,
    portrait_image_path TEXT,
    faction TEXT,
    level INTEGER,
    default_dialogue_id TEXT,
    behavior JSONB,
    hitbox JSONB,
    world_name TEXT,
    map_name TEXT,
    updated_at TIMESTAMPTZ
);

-- Table: xp_award_events
CREATE TABLE IF NOT EXISTS xp_award_events (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    idempotency_key TEXT,
    asset_id TEXT NOT NULL,
    skill TEXT NOT NULL,
    experience_gain INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

