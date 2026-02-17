-- ============================================
-- COMPLETE DATABASE SCHEMA EXPORT
-- Generated: 2025-11-04 10:08:26.069752+00
-- Database: postgres
-- ============================================

-- ============================================
-- TABLES
-- ============================================

-- Table: action_skills
CREATE TABLE IF NOT EXISTS action_skills (
    action VARCHAR(50) NOT NULL,
    skill VARCHAR(20) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE action_skills ADD PRIMARY KEY (action);


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

ALTER TABLE chunks ADD PRIMARY KEY (id);


-- Table: experience_logs
CREATE TABLE IF NOT EXISTS experience_logs (
    id INTEGER NOT NULL DEFAULT nextval('experience_logs_id_seq'::regclass),
    player_pda VARCHAR(44) NOT NULL,
    skill VARCHAR(20) NOT NULL,
    experience_gain INTEGER NOT NULL,
    source VARCHAR(50),
    timestamp TIMESTAMPTZ DEFAULT now(),
    session_id UUID,
    game_mode VARCHAR(30),
    additional_data JSONB,
    asset_id TEXT
);

ALTER TABLE experience_logs ADD PRIMARY KEY (id);


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

ALTER TABLE map_editor_animations ADD PRIMARY KEY (id);


-- Table: map_editor_collisions
CREATE TABLE IF NOT EXISTS map_editor_collisions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    object_id TEXT NOT NULL,
    placed_object_id TEXT NOT NULL,
    world_name TEXT NOT NULL,
    chunk_x INTEGER NOT NULL,
    chunk_y INTEGER NOT NULL,
    collision_tiles _text[] DEFAULT '{}'::text[],
    above_tiles _text[] DEFAULT '{}'::text[],
    below_tiles _text[] DEFAULT '{}'::text[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    version INTEGER NOT NULL DEFAULT 1,
    interaction_tiles _text[] DEFAULT '{}'::text[]
);

ALTER TABLE map_editor_collisions ADD PRIMARY KEY (id);


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
    scale FLOAT4 NOT NULL DEFAULT 1.0,
    placed_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_public BOOLEAN DEFAULT false,
    tags _text[] DEFAULT '{}'::text[],
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    animation_stats JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE map_saves ADD PRIMARY KEY (id);


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

ALTER TABLE nft_skill_experience ADD PRIMARY KEY (asset_id, skill);


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

ALTER TABLE nfts ADD PRIMARY KEY (asset_id);


-- Table: pda_creation_log
CREATE TABLE IF NOT EXISTS pda_creation_log (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL,
    pda_address TEXT NOT NULL,
    creation_cost NUMERIC NOT NULL,
    game_wallet_signature TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pda_creation_log ADD PRIMARY KEY (id);


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

ALTER TABLE player_items ADD PRIMARY KEY (id);


-- Table: player_skill_experience
CREATE TABLE IF NOT EXISTS player_skill_experience (
    player_pda VARCHAR(44) NOT NULL,
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

ALTER TABLE player_skill_experience ADD PRIMARY KEY (player_pda);


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

ALTER TABLE profiles ADD PRIMARY KEY (id);


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

ALTER TABLE quests ADD PRIMARY KEY (id);


-- Table: skill_training_logs
CREATE TABLE IF NOT EXISTS skill_training_logs (
    id INTEGER NOT NULL DEFAULT nextval('skill_training_logs_id_seq'::regclass),
    asset_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    skill VARCHAR(20) NOT NULL,
    exp_gained INTEGER NOT NULL,
    player_pda VARCHAR(255),
    session_id VARCHAR(255),
    game_mode VARCHAR(50),
    additional_data JSONB,
    created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE skill_training_logs ADD PRIMARY KEY (id);


-- Table: xp_award_events
CREATE TABLE IF NOT EXISTS xp_award_events (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    idempotency_key TEXT,
    asset_id TEXT NOT NULL,
    skill TEXT NOT NULL,
    experience_gain INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE xp_award_events ADD PRIMARY KEY (id);


-- ============================================
-- FOREIGN KEYS
-- ============================================

ALTER TABLE pda_creation_log ADD CONSTRAINT pda_creation_log_player_id_fkey FOREIGN KEY (player_id) REFERENCES profiles (id) ON DELETE CASCADE;
ALTER TABLE player_items ADD CONSTRAINT player_items_player_id_fkey FOREIGN KEY (player_id) REFERENCES profiles (id) ON DELETE CASCADE;
ALTER TABLE player_items ADD CONSTRAINT player_items_traded_to_player_fkey FOREIGN KEY (traded_to_player) REFERENCES profiles (id);
ALTER TABLE skill_training_logs ADD CONSTRAINT skill_training_logs_action_fkey FOREIGN KEY (action) REFERENCES action_skills (action);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_chunks_coordinates ON public.chunks USING btree (x, y);
CREATE INDEX idx_chunks_coords ON public.chunks USING btree (x, y);
CREATE INDEX idx_chunks_data_gin ON public.chunks USING gin (data);
CREATE INDEX idx_chunks_last_accessed ON public.chunks USING btree (last_accessed);
CREATE INDEX idx_chunks_updated_at ON public.chunks USING btree (updated_at DESC);
CREATE INDEX idx_experience_logs_asset ON public.experience_logs USING btree (asset_id);
CREATE INDEX idx_experience_logs_player ON public.experience_logs USING btree (player_pda);
CREATE INDEX idx_experience_logs_player_pda ON public.experience_logs USING btree (player_pda);
CREATE INDEX idx_experience_logs_session_id ON public.experience_logs USING btree (session_id);
CREATE INDEX idx_experience_logs_skill ON public.experience_logs USING btree (skill);
CREATE INDEX idx_experience_logs_source ON public.experience_logs USING btree (source);
CREATE INDEX idx_experience_logs_timestamp ON public.experience_logs USING btree ("timestamp");
CREATE UNIQUE INDEX map_editor_animations_asset_id_key ON public.map_editor_animations USING btree (asset_id);
CREATE INDEX idx_map_editor_collisions_chunk_coords ON public.map_editor_collisions USING btree (chunk_x, chunk_y);
CREATE INDEX idx_map_editor_collisions_object_id ON public.map_editor_collisions USING btree (object_id);
CREATE INDEX idx_map_editor_collisions_placed_object_id ON public.map_editor_collisions USING btree (placed_object_id);
CREATE INDEX idx_map_editor_collisions_world_name ON public.map_editor_collisions USING btree (world_name);
CREATE UNIQUE INDEX map_editor_collisions_placed_object_id_key ON public.map_editor_collisions USING btree (placed_object_id);
CREATE INDEX idx_map_saves_animation_stats ON public.map_saves USING gin (animation_stats);
CREATE INDEX idx_map_saves_base_chunk_id ON public.map_saves USING btree (base_chunk_id);
CREATE INDEX idx_map_saves_is_public ON public.map_saves USING btree (is_public);
CREATE INDEX idx_map_saves_public ON public.map_saves USING btree (is_public);
CREATE INDEX idx_map_saves_tags ON public.map_saves USING gin (tags);
CREATE INDEX idx_map_saves_updated_at ON public.map_saves USING btree (updated_at);
CREATE INDEX idx_map_saves_user_id ON public.map_saves USING btree (user_id);
CREATE INDEX idx_map_saves_world_name ON public.map_saves USING btree (world_name);
CREATE UNIQUE INDEX map_saves_user_id_world_name_map_name_key ON public.map_saves USING btree (user_id, world_name, map_name);
CREATE INDEX idx_nft_skill_exp_asset ON public.nft_skill_experience USING btree (asset_id);
CREATE INDEX idx_nft_skill_exp_pending ON public.nft_skill_experience USING btree (pending_onchain_update) WHERE (pending_onchain_update = true);
CREATE INDEX idx_nft_skill_pending_updated ON public.nft_skill_experience USING btree (updated_at) WHERE (pending_onchain_update = true);
CREATE INDEX idx_nfts_player_pda ON public.nfts USING btree (player_pda);
CREATE INDEX idx_pda_creation_log_cost ON public.pda_creation_log USING btree (creation_cost);
CREATE INDEX idx_pda_creation_log_created_at ON public.pda_creation_log USING btree (created_at DESC);
CREATE INDEX idx_pda_creation_log_player ON public.pda_creation_log USING btree (player_id);
CREATE INDEX idx_player_items_cnft ON public.player_items USING btree (cnft_address);
CREATE INDEX idx_player_items_cnft_address ON public.player_items USING btree (cnft_address);
CREATE INDEX idx_player_items_definition ON public.player_items USING btree (item_definition_id);
CREATE INDEX idx_player_items_minted_at ON public.player_items USING btree (minted_at DESC);
CREATE INDEX idx_player_items_player ON public.player_items USING btree (player_id);
CREATE INDEX idx_player_items_player_id ON public.player_items USING btree (player_id);
CREATE UNIQUE INDEX player_items_cnft_address_key ON public.player_items USING btree (cnft_address);
CREATE UNIQUE INDEX unique_cnft_per_player ON public.player_items USING btree (player_id, cnft_address);
CREATE INDEX idx_player_skill_experience_alchemy_level ON public.player_skill_experience USING btree (alchemy_level);
CREATE INDEX idx_player_skill_experience_attack_level ON public.player_skill_experience USING btree (attack_level);
CREATE INDEX idx_player_skill_experience_construction_level ON public.player_skill_experience USING btree (construction_level);
CREATE INDEX idx_player_skill_experience_cooking_level ON public.player_skill_experience USING btree (cooking_level);
CREATE INDEX idx_player_skill_experience_crafting_level ON public.player_skill_experience USING btree (crafting_level);
CREATE INDEX idx_player_skill_experience_defense_level ON public.player_skill_experience USING btree (defense_level);
CREATE INDEX idx_player_skill_experience_farming_level ON public.player_skill_experience USING btree (farming_level);
CREATE INDEX idx_player_skill_experience_fishing_level ON public.player_skill_experience USING btree (fishing_level);
CREATE INDEX idx_player_skill_experience_hunting_level ON public.player_skill_experience USING btree (hunting_level);
CREATE INDEX idx_player_skill_experience_luck_level ON public.player_skill_experience USING btree (luck_level);
CREATE INDEX idx_player_skill_experience_magic_level ON public.player_skill_experience USING btree (magic_level);
CREATE INDEX idx_player_skill_experience_mining_level ON public.player_skill_experience USING btree (mining_level);
CREATE INDEX idx_player_skill_experience_pda ON public.player_skill_experience USING btree (player_pda);
CREATE INDEX idx_player_skill_experience_pending ON public.player_skill_experience USING btree (pending_onchain_update) WHERE (pending_onchain_update = true);
CREATE INDEX idx_player_skill_experience_projectiles_level ON public.player_skill_experience USING btree (projectiles_level);
CREATE INDEX idx_player_skill_experience_smithing_level ON public.player_skill_experience USING btree (smithing_level);
CREATE INDEX idx_player_skill_experience_strength_level ON public.player_skill_experience USING btree (strength_level);
CREATE INDEX idx_player_skill_experience_vitality_level ON public.player_skill_experience USING btree (vitality_level);
CREATE INDEX idx_player_skill_experience_woodcutting_level ON public.player_skill_experience USING btree (woodcutting_level);
CREATE INDEX idx_profiles_active_character ON public.profiles USING btree (active_character_slot);
CREATE INDEX idx_profiles_character_cnfts ON public.profiles USING btree (character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5);
CREATE INDEX idx_profiles_cobx_token_account ON public.profiles USING btree (cobx_token_account);
CREATE INDEX profiles_username_idx ON public.profiles USING btree (username) WHERE (username IS NOT NULL);
CREATE UNIQUE INDEX profiles_wallet_address_key ON public.profiles USING btree (wallet_address);
CREATE INDEX idx_quests_type ON public.quests USING btree (quest_type);
CREATE INDEX idx_quests_world_name ON public.quests USING btree (world_name);
CREATE INDEX idx_skill_training_logs_action ON public.skill_training_logs USING btree (action);
CREATE INDEX idx_skill_training_logs_asset_id ON public.skill_training_logs USING btree (asset_id);
CREATE INDEX idx_skill_training_logs_created_at ON public.skill_training_logs USING btree (created_at);
CREATE INDEX idx_skill_training_logs_skill ON public.skill_training_logs USING btree (skill);
CREATE UNIQUE INDEX xp_award_events_idempotency_key_key ON public.xp_award_events USING btree (idempotency_key);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER trigger_update_chunks_updated_at BEFORE UPDATE ON chunks FOR EACH ROW EXECUTE FUNCTION update_chunks_updated_at();
CREATE TRIGGER trg_update_map_editor_animations_updated_at BEFORE UPDATE ON map_editor_animations FOR EACH ROW EXECUTE FUNCTION update_map_editor_animations_updated_at();
CREATE TRIGGER update_map_editor_collisions_updated_at BEFORE UPDATE ON map_editor_collisions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_update_map_saves_updated_at BEFORE UPDATE ON map_saves FOR EACH ROW EXECUTE FUNCTION update_map_saves_updated_at();
CREATE TRIGGER trigger_update_nft_total_level BEFORE INSERT ON nfts FOR EACH ROW EXECUTE FUNCTION update_nft_total_level();
CREATE TRIGGER trigger_update_nft_total_level BEFORE UPDATE ON nfts FOR EACH ROW EXECUTE FUNCTION update_nft_total_level();
CREATE TRIGGER update_player_skill_experience_updated_at BEFORE UPDATE ON player_skill_experience FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_quests_updated_at BEFORE UPDATE ON quests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function: calculate_total_level
CREATE OR REPLACE FUNCTION public.calculate_total_level(att integer, str integer, def integer, mag integer, pro integer, vit integer, cra integer, luc integer, gat integer, mining integer, woodcutting integer, fishing integer, farming integer, hunting integer, smithing integer, cooking integer, alchemy integer, construction integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN att + str + def + mag + pro + vit + cra + luc + gat +
           mining + woodcutting + fishing + farming + hunting +
           smithing + cooking + alchemy + construction;
END;
$function$
;

-- Function: get_pda_stats
CREATE OR REPLACE FUNCTION public.get_pda_stats(start_date timestamp with time zone DEFAULT (now() - '30 days'::interval), end_date timestamp with time zone DEFAULT now())
 RETURNS TABLE(period text, pdas_created bigint, total_cost numeric, avg_cost numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        'Last 30 days' as period,
        COUNT(*) as pdas_created,
        COALESCE(SUM(creation_cost), 0) as total_cost,
        COALESCE(AVG(creation_cost), 0) as avg_cost
    FROM pda_creation_log
    WHERE created_at BETWEEN start_date AND end_date;
END;
$function$
;

-- Function: get_total_pda_costs
CREATE OR REPLACE FUNCTION public.get_total_pda_costs()
 RETURNS TABLE(total_cost numeric, total_pdas bigint, avg_cost numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(creation_cost), 0) as total_cost,
        COUNT(*) as total_pdas,
        COALESCE(AVG(creation_cost), 0) as avg_cost
    FROM pda_creation_log;
END;
$function$
;

-- Function: handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$function$
;

-- Function: set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

-- Function: update_chunks_updated_at
CREATE OR REPLACE FUNCTION public.update_chunks_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- Function: update_map_editor_animations_updated_at
CREATE OR REPLACE FUNCTION public.update_map_editor_animations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$function$
;

-- Function: update_map_saves_updated_at
CREATE OR REPLACE FUNCTION public.update_map_saves_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- Function: update_nft_total_level
CREATE OR REPLACE FUNCTION public.update_nft_total_level()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- Function: update_virtual_balance
CREATE OR REPLACE FUNCTION public.update_virtual_balance(p_player_id uuid, p_amount bigint, p_transaction_type text, p_source text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    new_balance BIGINT;
BEGIN
    -- Insert or update balance atomically
    INSERT INTO public.virtual_balances (player_id, obx_balance, last_updated, version)
    VALUES (p_player_id, p_amount, NOW(), 1)
    ON CONFLICT (player_id) 
    DO UPDATE SET 
        obx_balance = virtual_balances.obx_balance + p_amount,
        last_updated = NOW(),
        version = virtual_balances.version + 1
    RETURNING obx_balance INTO new_balance;
    
    -- Record the transaction
    INSERT INTO public.economy_transactions (player_id, transaction_type, amount, source, metadata)
    VALUES (p_player_id, p_transaction_type, p_amount, p_source, p_metadata);
    
    RETURN new_balance;
END;
$function$
;


-- ============================================
-- RLS POLICIES
-- ============================================

CREATE POLICY Service role full access logs ON experience_logs FOR ALL TO {public} USING (true);
CREATE POLICY Users can manage their own collision data ON map_editor_collisions FOR ALL TO {public} USING (true);
CREATE POLICY Players can view own PDA logs ON pda_creation_log FOR SELECT TO {public} USING ((auth.uid() = player_id));
CREATE POLICY Service role full access to PDA logs ON pda_creation_log FOR ALL TO {public} USING ((auth.role() = 'service_role'::text));
CREATE POLICY Players can view own items ON player_items FOR SELECT TO {public} USING ((auth.uid() = player_id));
CREATE POLICY Service role full access to items ON player_items FOR ALL TO {public} USING ((auth.role() = 'service_role'::text));
CREATE POLICY Players can view own skill data ON player_skill_experience FOR SELECT TO {public} USING (true);
CREATE POLICY Service role full access ON player_skill_experience FOR ALL TO {public} USING (true);
CREATE POLICY Guest users can update their own profile ON profiles FOR UPDATE TO {public} USING (((auth.uid() = id) OR (user_type = 'GUEST'::text)));
CREATE POLICY Guest users can view their own profile ON profiles FOR SELECT TO {public} USING (((auth.uid() = id) OR (user_type = 'GUEST'::text)));
CREATE POLICY Public profiles are viewable by everyone. ON profiles FOR SELECT TO {public} USING (true);
CREATE POLICY Users can insert their own profile. ON profiles FOR INSERT TO {public} WITH CHECK ((auth.uid() = id));
CREATE POLICY Users can update own profile. ON profiles FOR UPDATE TO {public} USING ((auth.uid() = id));

-- ============================================
-- VIEWS
-- ============================================

CREATE VIEW action_skill_mapping AS  SELECT action,
    skill,
    description
   FROM action_skills
  ORDER BY skill, action;;

CREATE VIEW cnft_minting_analytics AS  SELECT date_trunc('day'::text, minted_at) AS date,
    item_definition_id,
    item_type,
    rarity,
    count(*) AS items_minted,
    sum(quantity) AS total_quantity,
    sum(mint_cost) AS total_cost,
    avg(mint_cost) AS avg_cost_per_item
   FROM player_items
  WHERE (minted_at IS NOT NULL)
  GROUP BY (date_trunc('day'::text, minted_at)), item_definition_id, item_type, rarity
  ORDER BY (date_trunc('day'::text, minted_at)) DESC, (sum(quantity)) DESC;;

CREATE VIEW pda_cost_analytics AS  SELECT date_trunc('day'::text, created_at) AS date,
    count(*) AS pdas_created,
    sum(creation_cost) AS total_cost,
    avg(creation_cost) AS avg_cost_per_pda,
    min(creation_cost) AS min_cost,
    max(creation_cost) AS max_cost
   FROM pda_creation_log
  GROUP BY (date_trunc('day'::text, created_at))
  ORDER BY (date_trunc('day'::text, created_at)) DESC;;

CREATE VIEW player_pda_summary AS  SELECT p.id,
    p.character_name,
    p.player_pda,
    p.pda_status,
    p.pda_created_at,
    p.pda_creation_cost,
    pcl.game_wallet_signature,
        CASE
            WHEN (p.player_pda IS NOT NULL) THEN 'Has PDA'::text
            ELSE 'No PDA'::text
        END AS pda_ownership_status
   FROM (profiles p
     LEFT JOIN pda_creation_log pcl ON ((p.id = pcl.player_id)));;

CREATE VIEW skill_categories AS  SELECT 'combat'::text AS category,
    ARRAY['attack'::text, 'strength'::text, 'defense'::text, 'magic'::text, 'projectiles'::text, 'vitality'::text] AS skills
UNION ALL
 SELECT 'gathering'::text AS category,
    ARRAY['mining'::text, 'woodcutting'::text, 'fishing'::text, 'farming'::text, 'hunting'::text] AS skills
UNION ALL
 SELECT 'crafting'::text AS category,
    ARRAY['smithing'::text, 'crafting'::text, 'cooking'::text, 'alchemy'::text, 'construction'::text] AS skills
UNION ALL
 SELECT 'unique'::text AS category,
    ARRAY['luck'::text] AS skills;;

CREATE VIEW skill_leaderboards AS  SELECT skills.skill,
    player_skill_experience.player_pda,
        CASE
            WHEN (skills.skill = 'attack'::text) THEN player_skill_experience.attack_level
            WHEN (skills.skill = 'strength'::text) THEN player_skill_experience.strength_level
            WHEN (skills.skill = 'defense'::text) THEN player_skill_experience.defense_level
            WHEN (skills.skill = 'magic'::text) THEN player_skill_experience.magic_level
            WHEN (skills.skill = 'projectiles'::text) THEN player_skill_experience.projectiles_level
            WHEN (skills.skill = 'vitality'::text) THEN player_skill_experience.vitality_level
            WHEN (skills.skill = 'mining'::text) THEN player_skill_experience.mining_level
            WHEN (skills.skill = 'woodcutting'::text) THEN player_skill_experience.woodcutting_level
            WHEN (skills.skill = 'fishing'::text) THEN player_skill_experience.fishing_level
            WHEN (skills.skill = 'farming'::text) THEN player_skill_experience.farming_level
            WHEN (skills.skill = 'hunting'::text) THEN player_skill_experience.hunting_level
            WHEN (skills.skill = 'smithing'::text) THEN player_skill_experience.smithing_level
            WHEN (skills.skill = 'crafting'::text) THEN player_skill_experience.crafting_level
            WHEN (skills.skill = 'cooking'::text) THEN player_skill_experience.cooking_level
            WHEN (skills.skill = 'alchemy'::text) THEN player_skill_experience.alchemy_level
            WHEN (skills.skill = 'construction'::text) THEN player_skill_experience.construction_level
            WHEN (skills.skill = 'luck'::text) THEN player_skill_experience.luck_level
            ELSE NULL::integer
        END AS level,
        CASE
            WHEN (skills.skill = 'attack'::text) THEN player_skill_experience.attack_xp
            WHEN (skills.skill = 'strength'::text) THEN player_skill_experience.strength_xp
            WHEN (skills.skill = 'defense'::text) THEN player_skill_experience.defense_xp
            WHEN (skills.skill = 'magic'::text) THEN player_skill_experience.magic_xp
            WHEN (skills.skill = 'projectiles'::text) THEN player_skill_experience.projectiles_xp
            WHEN (skills.skill = 'vitality'::text) THEN player_skill_experience.vitality_xp
            WHEN (skills.skill = 'mining'::text) THEN player_skill_experience.mining_xp
            WHEN (skills.skill = 'woodcutting'::text) THEN player_skill_experience.woodcutting_xp
            WHEN (skills.skill = 'fishing'::text) THEN player_skill_experience.fishing_xp
            WHEN (skills.skill = 'farming'::text) THEN player_skill_experience.farming_xp
            WHEN (skills.skill = 'hunting'::text) THEN player_skill_experience.hunting_xp
            WHEN (skills.skill = 'smithing'::text) THEN player_skill_experience.smithing_xp
            WHEN (skills.skill = 'crafting'::text) THEN player_skill_experience.crafting_xp
            WHEN (skills.skill = 'cooking'::text) THEN player_skill_experience.cooking_xp
            WHEN (skills.skill = 'alchemy'::text) THEN player_skill_experience.alchemy_xp
            WHEN (skills.skill = 'construction'::text) THEN player_skill_experience.construction_xp
            WHEN (skills.skill = 'luck'::text) THEN player_skill_experience.luck_xp
            ELSE NULL::bigint
        END AS experience
   FROM (player_skill_experience
     CROSS JOIN ( VALUES ('attack'::text), ('strength'::text), ('defense'::text), ('magic'::text), ('projectiles'::text), ('vitality'::text), ('mining'::text), ('woodcutting'::text), ('fishing'::text), ('farming'::text), ('hunting'::text), ('smithing'::text), ('crafting'::text), ('cooking'::text), ('alchemy'::text), ('construction'::text), ('luck'::text)) skills(skill))
  ORDER BY
        CASE
            WHEN (skills.skill = 'attack'::text) THEN player_skill_experience.attack_level
            WHEN (skills.skill = 'strength'::text) THEN player_skill_experience.strength_level
            WHEN (skills.skill = 'defense'::text) THEN player_skill_experience.defense_level
            WHEN (skills.skill = 'magic'::text) THEN player_skill_experience.magic_level
            WHEN (skills.skill = 'projectiles'::text) THEN player_skill_experience.projectiles_level
            WHEN (skills.skill = 'vitality'::text) THEN player_skill_experience.vitality_level
            WHEN (skills.skill = 'mining'::text) THEN player_skill_experience.mining_level
            WHEN (skills.skill = 'woodcutting'::text) THEN player_skill_experience.woodcutting_level
            WHEN (skills.skill = 'fishing'::text) THEN player_skill_experience.fishing_level
            WHEN (skills.skill = 'farming'::text) THEN player_skill_experience.farming_level
            WHEN (skills.skill = 'hunting'::text) THEN player_skill_experience.hunting_level
            WHEN (skills.skill = 'smithing'::text) THEN player_skill_experience.smithing_level
            WHEN (skills.skill = 'crafting'::text) THEN player_skill_experience.crafting_level
            WHEN (skills.skill = 'cooking'::text) THEN player_skill_experience.cooking_level
            WHEN (skills.skill = 'alchemy'::text) THEN player_skill_experience.alchemy_level
            WHEN (skills.skill = 'construction'::text) THEN player_skill_experience.construction_level
            WHEN (skills.skill = 'luck'::text) THEN player_skill_experience.luck_level
            ELSE NULL::integer
        END DESC,
        CASE
            WHEN (skills.skill = 'attack'::text) THEN player_skill_experience.attack_xp
            WHEN (skills.skill = 'strength'::text) THEN player_skill_experience.strength_xp
            WHEN (skills.skill = 'defense'::text) THEN player_skill_experience.defense_xp
            WHEN (skills.skill = 'magic'::text) THEN player_skill_experience.magic_xp
            WHEN (skills.skill = 'projectiles'::text) THEN player_skill_experience.projectiles_xp
            WHEN (skills.skill = 'vitality'::text) THEN player_skill_experience.vitality_xp
            WHEN (skills.skill = 'mining'::text) THEN player_skill_experience.mining_xp
            WHEN (skills.skill = 'woodcutting'::text) THEN player_skill_experience.woodcutting_xp
            WHEN (skills.skill = 'fishing'::text) THEN player_skill_experience.fishing_xp
            WHEN (skills.skill = 'farming'::text) THEN player_skill_experience.farming_xp
            WHEN (skills.skill = 'hunting'::text) THEN player_skill_experience.hunting_xp
            WHEN (skills.skill = 'smithing'::text) THEN player_skill_experience.smithing_xp
            WHEN (skills.skill = 'crafting'::text) THEN player_skill_experience.crafting_xp
            WHEN (skills.skill = 'cooking'::text) THEN player_skill_experience.cooking_xp
            WHEN (skills.skill = 'alchemy'::text) THEN player_skill_experience.alchemy_xp
            WHEN (skills.skill = 'construction'::text) THEN player_skill_experience.construction_xp
            WHEN (skills.skill = 'luck'::text) THEN player_skill_experience.luck_xp
            ELSE NULL::bigint
        END DESC;;

CREATE VIEW total_level_rankings AS  SELECT player_pda,
    ((((((((((((((((attack_level + strength_level) + defense_level) + magic_level) + projectiles_level) + vitality_level) + mining_level) + woodcutting_level) + fishing_level) + farming_level) + hunting_level) + smithing_level) + crafting_level) + cooking_level) + alchemy_level) + construction_level) + luck_level) AS total_level,
    ((((((((((((((((attack_xp + strength_xp) + defense_xp) + magic_xp) + projectiles_xp) + vitality_xp) + mining_xp) + woodcutting_xp) + fishing_xp) + farming_xp) + hunting_xp) + smithing_xp) + crafting_xp) + cooking_xp) + alchemy_xp) + construction_xp) + luck_xp) AS total_experience,
    last_onchain_sync
   FROM player_skill_experience
  ORDER BY ((((((((((((((((attack_level + strength_level) + defense_level) + magic_level) + projectiles_level) + vitality_level) + mining_level) + woodcutting_level) + fishing_level) + farming_level) + hunting_level) + smithing_level) + crafting_level) + cooking_level) + alchemy_level) + construction_level) + luck_level) DESC, ((((((((((((((((attack_xp + strength_xp) + defense_xp) + magic_xp) + projectiles_xp) + vitality_xp) + mining_xp) + woodcutting_xp) + fishing_xp) + farming_xp) + hunting_xp) + smithing_xp) + crafting_xp) + cooking_xp) + alchemy_xp) + construction_xp) + luck_xp) DESC;;

CREATE VIEW view_map_save_interactions AS  SELECT ms.id AS map_save_id,
    (obj.value ->> 'placedId'::text) AS placed_id,
    (it.value ->> 'id'::text) AS interaction_id,
    (it.value ->> 'type'::text) AS type,
    (it.value ->> 'name'::text) AS name,
    (it.value ->> 'dialogueId'::text) AS dialogue_id,
    COALESCE(((it.value ->> 'distance'::text))::integer, 0) AS distance,
    COALESCE(((it.value ->> 'autoTrigger'::text))::boolean, false) AS auto_trigger,
    COALESCE(((it.value ->> 'offsetX'::text))::integer, 0) AS offset_x,
    COALESCE(((it.value ->> 'offsetY'::text))::integer, 0) AS offset_y,
    ms.world_name,
    ms.map_name
   FROM ((map_saves ms
     CROSS JOIN LATERAL jsonb_array_elements(ms.placed_objects) obj(value))
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE((obj.value -> 'interactions'::text), '[]'::jsonb)) it(value));;

CREATE VIEW view_map_save_npcs AS  SELECT ms.id AS map_save_id,
    (obj.value ->> 'placedId'::text) AS placed_id,
    (obj.value ->> 'id'::text) AS asset_id,
    ((obj.value -> 'npcProfile'::text) ->> 'displayName'::text) AS display_name,
    ((obj.value -> 'npcProfile'::text) ->> 'role'::text) AS role,
    ((obj.value -> 'npcProfile'::text) ->> 'customRoleName'::text) AS custom_role_name,
    ((obj.value -> 'npcProfile'::text) ->> 'portraitImagePath'::text) AS portrait_image_path,
    ((obj.value -> 'npcProfile'::text) ->> 'faction'::text) AS faction,
    COALESCE((((obj.value -> 'npcProfile'::text) ->> 'level'::text))::integer, NULL::integer) AS level,
    ((obj.value -> 'npcProfile'::text) ->> 'defaultDialogueId'::text) AS default_dialogue_id,
    ((obj.value -> 'npcProfile'::text) -> 'behavior'::text) AS behavior,
    ((obj.value -> 'npcProfile'::text) -> 'hitbox'::text) AS hitbox,
    ms.world_name,
    ms.map_name,
    ms.updated_at
   FROM (map_saves ms
     CROSS JOIN LATERAL jsonb_array_elements(ms.placed_objects) obj(value))
  WHERE ((obj.value -> 'npcProfile'::text) IS NOT NULL);;

-- ============================================
-- SEQUENCES
-- ============================================

CREATE SEQUENCE experience_logs_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;
CREATE SEQUENCE skill_training_logs_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;
