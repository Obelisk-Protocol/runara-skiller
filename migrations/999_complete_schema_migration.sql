-- Complete Database Schema Migration for Railway PostgreSQL
-- This migration creates all tables from Supabase schema
-- Adapted for Railway PostgreSQL (no Supabase-specific features)

-- ========================================
-- STEP 1: Create users table (replaces auth.users)
-- ========================================
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- ========================================
-- STEP 2: Create profiles table (updated foreign key)
-- ========================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  player_pda text,
  wallet_address text UNIQUE,
  character_class integer DEFAULT 0,
  character_name text DEFAULT 'Unnamed Player'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pda_created_at timestamp with time zone,
  pda_creation_cost numeric DEFAULT 0,
  pda_status text DEFAULT 'pending'::text CHECK (pda_status = ANY (ARRAY['pending'::text, 'creating'::text, 'active'::text, 'failed'::text])),
  cobx_token_account text,
  character_cnft_1 text,
  character_cnft_2 text,
  character_cnft_3 text,
  character_cnft_4 text,
  character_cnft_5 text,
  active_character_slot integer CHECK (active_character_slot >= 1 AND active_character_slot <= 5),
  username text,
  user_type text DEFAULT 'WEB2'::text CHECK (user_type = ANY (ARRAY['WEB2'::text, 'WEB3'::text])),
  character_customization jsonb DEFAULT '{"outfit": "default"}'::jsonb,
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.users(id)
);

-- ========================================
-- STEP 3: Create action_skills table
-- ========================================
CREATE TABLE IF NOT EXISTS public.action_skills (
  action character varying NOT NULL,
  skill character varying NOT NULL,
  description text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT action_skills_pkey PRIMARY KEY (action)
);

-- ========================================
-- STEP 4: Create animation_configs table
-- ========================================
CREATE TABLE IF NOT EXISTS public.animation_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id text NOT NULL UNIQUE,
  frame_width integer NOT NULL,
  frame_height integer NOT NULL,
  margin integer DEFAULT 0,
  spacing integer DEFAULT 0,
  clips jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT animation_configs_pkey PRIMARY KEY (id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_animation_configs_asset_id ON public.animation_configs(asset_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_animation_configs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_animation_configs_updated_at ON public.animation_configs;
CREATE TRIGGER trigger_update_animation_configs_updated_at
  BEFORE UPDATE ON public.animation_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_animation_configs_updated_at();

-- ========================================
-- STEP 5: Create assets table
-- ========================================
CREATE TABLE IF NOT EXISTS public.assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  category character varying NOT NULL,
  subcategory character varying,
  file_path character varying NOT NULL,
  public_url character varying NOT NULL,
  file_size bigint NOT NULL,
  file_type character varying NOT NULL,
  uploaded_by character varying NOT NULL DEFAULT 'map-editor'::character varying,
  description text,
  tags text[],
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  file_data bytea,
  default_skill_config jsonb,
  CONSTRAINT assets_pkey PRIMARY KEY (id)
);

-- ========================================
-- STEP 6: Create chunks table
-- ========================================
CREATE TABLE IF NOT EXISTS public.chunks (
  id text NOT NULL,
  x integer NOT NULL,
  y integer NOT NULL,
  data jsonb NOT NULL,
  version integer NOT NULL,
  created_at timestamp without time zone,
  updated_at timestamp without time zone,
  last_accessed timestamp without time zone,
  CONSTRAINT chunks_pkey PRIMARY KEY (id)
);

-- ========================================
-- STEP 7: Create experience_logs table
-- ========================================
CREATE SEQUENCE IF NOT EXISTS public.experience_logs_id_seq;

CREATE TABLE IF NOT EXISTS public.experience_logs (
  id integer NOT NULL DEFAULT nextval('public.experience_logs_id_seq'),
  player_pda character varying NOT NULL,
  skill character varying NOT NULL CHECK (skill::text = ANY (ARRAY['attack'::character varying::text, 'strength'::character varying::text, 'defense'::character varying::text, 'magic'::character varying::text, 'projectiles'::character varying::text, 'vitality'::character varying::text, 'mining'::character varying::text, 'woodcutting'::character varying::text, 'fishing'::character varying::text, 'hunting'::character varying::text, 'smithing'::character varying::text, 'crafting'::character varying::text, 'cooking'::character varying::text, 'alchemy'::character varying::text, 'construction'::character varying::text, 'luck'::character varying::text])),
  experience_gain integer NOT NULL CHECK (experience_gain > 0),
  source character varying,
  timestamp timestamp with time zone DEFAULT now(),
  session_id uuid,
  game_mode character varying,
  additional_data jsonb,
  asset_id text,
  CONSTRAINT experience_logs_pkey PRIMARY KEY (id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_experience_logs_player_pda ON public.experience_logs(player_pda);
CREATE INDEX IF NOT EXISTS idx_experience_logs_timestamp ON public.experience_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_experience_logs_skill ON public.experience_logs(skill);

-- ========================================
-- STEP 8: Create item_definitions table
-- ========================================
CREATE TABLE IF NOT EXISTS public.item_definitions (
  item_id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  item_type text NOT NULL CHECK (item_type = ANY (ARRAY['material'::text, 'equipment'::text, 'consumable'::text])),
  rarity text NOT NULL CHECK (rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text, 'legendary'::text])),
  base_properties jsonb NOT NULL,
  image_url text,
  animation_url text,
  icon_url text,
  craft_recipe jsonb,
  max_floor_level integer,
  base_drop_rate numeric NOT NULL DEFAULT 0.0001,
  is_craftable boolean DEFAULT false,
  max_stack_size integer DEFAULT 1,
  min_floor_level integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  mint_cost_cobx integer NOT NULL DEFAULT 0,
  ground_sprite_url text,
  in_use_sprite_url text,
  in_use_animation_config jsonb,
  is_placeable boolean NOT NULL DEFAULT false,
  placeable_category text CHECK (placeable_category = ANY (ARRAY['building'::text, 'crafting'::text, 'decoration'::text, 'storage'::text, 'furniture'::text, 'structure'::text])),
  placement_metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT item_definitions_pkey PRIMARY KEY (item_id)
);

-- ========================================
-- STEP 9: Create map_editor_collisions table
-- ========================================
CREATE TABLE IF NOT EXISTS public.map_editor_collisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  object_id text NOT NULL,
  placed_object_id text NOT NULL UNIQUE,
  world_name text NOT NULL,
  chunk_x integer NOT NULL,
  chunk_y integer NOT NULL,
  collision_tiles text[] DEFAULT '{}'::text[],
  above_tiles text[] DEFAULT '{}'::text[],
  below_tiles text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  interaction_tiles text[] DEFAULT '{}'::text[],
  CONSTRAINT map_editor_collisions_pkey PRIMARY KEY (id)
);

-- ========================================
-- STEP 10: Create map_saves table
-- ========================================
CREATE TABLE IF NOT EXISTS public.map_saves (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default-user'::text,
  world_name text NOT NULL DEFAULT 'obelisk_world'::text,
  map_name text NOT NULL,
  description text,
  base_chunk_id text,
  base_chunk_name text,
  base_chunk_image_path text,
  chunk_size integer NOT NULL DEFAULT 64,
  world_width integer NOT NULL DEFAULT 2048,
  world_height integer NOT NULL DEFAULT 2048,
  camera_x integer NOT NULL DEFAULT 1024,
  camera_y integer NOT NULL DEFAULT 1024,
  scale real NOT NULL DEFAULT 1.0,
  placed_objects jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_public boolean DEFAULT false,
  tags text[] DEFAULT '{}'::text[],
  version integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  animation_stats jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT map_saves_pkey PRIMARY KEY (id)
);

-- ========================================
-- STEP 11: Create nft_metadata table
-- ========================================
CREATE TABLE IF NOT EXISTS public.nft_metadata (
  asset_id text NOT NULL,
  metadata_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT nft_metadata_pkey PRIMARY KEY (asset_id)
);

-- ========================================
-- STEP 12: Create nft_skill_experience table
-- ========================================
CREATE TABLE IF NOT EXISTS public.nft_skill_experience (
  asset_id text NOT NULL,
  skill text NOT NULL CHECK (skill = ANY (ARRAY['attack'::text, 'strength'::text, 'defense'::text, 'magic'::text, 'projectiles'::text, 'vitality'::text, 'mining'::text, 'woodcutting'::text, 'fishing'::text, 'hunting'::text, 'smithing'::text, 'crafting'::text, 'cooking'::text, 'alchemy'::text, 'construction'::text, 'luck'::text])),
  experience bigint NOT NULL DEFAULT 0 CHECK (experience >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 99),
  pending_onchain_update boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT nft_skill_experience_pkey PRIMARY KEY (asset_id, skill)
);

-- ========================================
-- STEP 13: Create nfts table
-- ========================================
CREATE TABLE IF NOT EXISTS public.nfts (
  asset_id text NOT NULL,
  player_pda text,
  name text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  combat_level integer NOT NULL DEFAULT 1,
  total_level integer NOT NULL DEFAULT 9,
  version text NOT NULL DEFAULT '2.0.0'::text,
  last_arweave_uri text,
  last_update_sig text,
  state_version integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  character_image_url text,
  CONSTRAINT nfts_pkey PRIMARY KEY (asset_id)
);

-- ========================================
-- STEP 14: Create pda_creation_log table
-- ========================================
CREATE TABLE IF NOT EXISTS public.pda_creation_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  pda_address text NOT NULL,
  creation_cost numeric NOT NULL,
  game_wallet_signature text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pda_creation_log_pkey PRIMARY KEY (id),
  CONSTRAINT pda_creation_log_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.profiles(id)
);

-- ========================================
-- STEP 15: Create player_items table
-- ========================================
CREATE TABLE IF NOT EXISTS public.player_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  item_definition_id text NOT NULL,
  cnft_address text NOT NULL UNIQUE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  minted_at timestamp with time zone DEFAULT now(),
  mint_cost numeric DEFAULT 0,
  mint_signature text NOT NULL,
  metadata_uri text,
  rarity text,
  item_type text,
  is_stacked boolean DEFAULT false,
  current_durability integer,
  acquisition_source text DEFAULT 'game_reward'::text,
  found_in_dungeon text,
  found_on_floor integer,
  last_traded_at timestamp with time zone,
  traded_to_player uuid,
  withdrawn_to_wallet text,
  withdrawn_at timestamp with time zone,
  slot_position integer,
  CONSTRAINT player_items_pkey PRIMARY KEY (id),
  CONSTRAINT player_items_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.profiles(id),
  CONSTRAINT player_items_traded_to_player_fkey FOREIGN KEY (traded_to_player) REFERENCES public.profiles(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_player_items_player_id ON public.player_items(player_id);
CREATE INDEX IF NOT EXISTS idx_player_items_cnft_address ON public.player_items(cnft_address);
CREATE INDEX IF NOT EXISTS idx_player_items_slot_position ON public.player_items(slot_position);

-- ========================================
-- STEP 16: Create player_skill_experience table
-- ========================================
CREATE TABLE IF NOT EXISTS public.player_skill_experience (
  player_pda character varying NOT NULL,
  magic_xp bigint DEFAULT 0 CHECK (magic_xp >= 0),
  crafting_xp bigint DEFAULT 0 CHECK (crafting_xp >= 0),
  magic_level integer DEFAULT 1 CHECK (magic_level >= 1 AND magic_level <= 120),
  crafting_level integer DEFAULT 1 CHECK (crafting_level >= 1 AND crafting_level <= 120),
  last_onchain_sync timestamp with time zone DEFAULT now(),
  pending_onchain_update boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  attack_xp bigint DEFAULT 0 CHECK (attack_xp >= 0),
  strength_xp bigint DEFAULT 0 CHECK (strength_xp >= 0),
  defense_xp bigint DEFAULT 0 CHECK (defense_xp >= 0),
  projectiles_xp bigint DEFAULT 0 CHECK (projectiles_xp >= 0),
  vitality_xp bigint DEFAULT 0 CHECK (vitality_xp >= 0),
  mining_xp bigint DEFAULT 0 CHECK (mining_xp >= 0),
  woodcutting_xp bigint DEFAULT 0 CHECK (woodcutting_xp >= 0),
  fishing_xp bigint DEFAULT 0 CHECK (fishing_xp >= 0),
  hunting_xp bigint DEFAULT 0 CHECK (hunting_xp >= 0),
  smithing_xp bigint DEFAULT 0 CHECK (smithing_xp >= 0),
  cooking_xp bigint DEFAULT 0 CHECK (cooking_xp >= 0),
  alchemy_xp bigint DEFAULT 0 CHECK (alchemy_xp >= 0),
  construction_xp bigint DEFAULT 0 CHECK (construction_xp >= 0),
  luck_xp bigint DEFAULT 0 CHECK (luck_xp >= 0),
  attack_level integer DEFAULT 1 CHECK (attack_level >= 1 AND attack_level <= 99),
  strength_level integer DEFAULT 1 CHECK (strength_level >= 1 AND strength_level <= 99),
  defense_level integer DEFAULT 1 CHECK (defense_level >= 1 AND defense_level <= 99),
  projectiles_level integer DEFAULT 1 CHECK (projectiles_level >= 1 AND projectiles_level <= 99),
  vitality_level integer DEFAULT 1 CHECK (vitality_level >= 1 AND vitality_level <= 99),
  mining_level integer DEFAULT 1 CHECK (mining_level >= 1 AND mining_level <= 99),
  woodcutting_level integer DEFAULT 1 CHECK (woodcutting_level >= 1 AND woodcutting_level <= 99),
  fishing_level integer DEFAULT 1 CHECK (fishing_level >= 1 AND fishing_level <= 99),
  hunting_level integer DEFAULT 1 CHECK (hunting_level >= 1 AND hunting_level <= 99),
  smithing_level integer DEFAULT 1 CHECK (smithing_level >= 1 AND smithing_level <= 99),
  cooking_level integer DEFAULT 1 CHECK (cooking_level >= 1 AND cooking_level <= 99),
  alchemy_level integer DEFAULT 1 CHECK (alchemy_level >= 1 AND alchemy_level <= 99),
  construction_level integer DEFAULT 1 CHECK (construction_level >= 1 AND construction_level <= 99),
  luck_level integer DEFAULT 1 CHECK (luck_level >= 1 AND luck_level <= 99),
  CONSTRAINT player_skill_experience_pkey PRIMARY KEY (player_pda)
);

-- ========================================
-- STEP 17: Create player_structures table
-- ========================================
CREATE TABLE IF NOT EXISTS public.player_structures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chunk_x integer NOT NULL,
  chunk_y integer NOT NULL,
  x integer NOT NULL CHECK (x >= 0 AND x < 2048),
  y integer NOT NULL CHECK (y >= 0 AND y < 2048),
  item_definition_id text NOT NULL,
  structure_type text NOT NULL,
  rotation real DEFAULT 0 CHECK (rotation >= 0::double precision AND rotation < 360::double precision),
  scale real DEFAULT 1 CHECK (scale > 0::double precision AND scale <= 5::double precision),
  z_layer text DEFAULT 'mid'::text CHECK (z_layer = ANY (ARRAY['below'::text, 'mid'::text, 'above'::text])),
  z_offset integer DEFAULT 0,
  collision boolean DEFAULT true,
  collision_bounds jsonb,
  properties jsonb DEFAULT '{}'::jsonb,
  placed_at timestamp with time zone NOT NULL DEFAULT now(),
  destroyed_at timestamp with time zone,
  health integer DEFAULT 100 CHECK (health >= 0),
  max_health integer DEFAULT 100 CHECK (max_health > 0),
  placed_by_player_id uuid,
  placed_by_name text,
  CONSTRAINT player_structures_pkey PRIMARY KEY (id),
  CONSTRAINT player_structures_item_definition_id_fkey FOREIGN KEY (item_definition_id) REFERENCES public.item_definitions(item_id),
  CONSTRAINT player_structures_placed_by_player_id_fkey FOREIGN KEY (placed_by_player_id) REFERENCES public.profiles(id)
);

-- Create indexes for player_structures
CREATE INDEX IF NOT EXISTS idx_player_structures_chunk ON public.player_structures(chunk_x, chunk_y);
CREATE INDEX IF NOT EXISTS idx_player_structures_player ON public.player_structures(placed_by_player_id);

-- ========================================
-- STEP 18: Create quests table
-- ========================================
CREATE TABLE IF NOT EXISTS public.quests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  world_name text NOT NULL,
  title text NOT NULL,
  description text,
  quest_type text NOT NULL,
  min_level integer DEFAULT 1,
  repeatable boolean DEFAULT false,
  time_limit_ms bigint,
  rewards jsonb,
  config jsonb NOT NULL,
  giver_npc_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quests_pkey PRIMARY KEY (id)
);

-- ========================================
-- STEP 19: Create skill_training_logs table
-- ========================================
CREATE SEQUENCE IF NOT EXISTS public.skill_training_logs_id_seq;

CREATE TABLE IF NOT EXISTS public.skill_training_logs (
  id integer NOT NULL DEFAULT nextval('public.skill_training_logs_id_seq'),
  asset_id character varying NOT NULL,
  action character varying NOT NULL,
  skill character varying NOT NULL,
  exp_gained integer NOT NULL CHECK (exp_gained > 0),
  player_pda character varying,
  session_id character varying,
  game_mode character varying,
  additional_data jsonb,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT skill_training_logs_pkey PRIMARY KEY (id),
  CONSTRAINT skill_training_logs_action_fkey FOREIGN KEY (action) REFERENCES public.action_skills(action)
);

-- ========================================
-- STEP 20: Create xp_award_events table
-- ========================================
CREATE TABLE IF NOT EXISTS public.xp_award_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text UNIQUE,
  asset_id text NOT NULL,
  skill text NOT NULL,
  experience_gain integer NOT NULL CHECK (experience_gain > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT xp_award_events_pkey PRIMARY KEY (id)
);

-- ========================================
-- STEP 21: Create functions for inventory management
-- ========================================

-- Function to move inventory items
CREATE OR REPLACE FUNCTION public.move_inventory_item(
  p_player_id uuid,
  p_from_slot integer,
  p_to_slot integer,
  p_quantity integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_from_item record;
  v_to_item record;
  v_move_quantity integer;
  v_result jsonb;
BEGIN
  -- Validate slot range
  IF p_from_slot < 0 OR p_from_slot > 29 OR p_to_slot < 0 OR p_to_slot > 29 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid slot range');
  END IF;

  -- Get from item
  SELECT * INTO v_from_item
  FROM public.player_items
  WHERE player_id = p_player_id AND slot_position = p_from_slot
  FOR UPDATE;

  -- If no item in from slot, return error
  IF v_from_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No item in source slot');
  END IF;

  -- Determine move quantity
  v_move_quantity := COALESCE(p_quantity, v_from_item.quantity);
  IF v_move_quantity > v_from_item.quantity THEN
    v_move_quantity := v_from_item.quantity;
  END IF;

  -- Get to item
  SELECT * INTO v_to_item
  FROM public.player_items
  WHERE player_id = p_player_id AND slot_position = p_to_slot
  FOR UPDATE;

  -- If destination is empty, just move
  IF v_to_item IS NULL THEN
    UPDATE public.player_items
    SET slot_position = p_to_slot
    WHERE id = v_from_item.id;
    
    RETURN jsonb_build_object('success', true, 'action', 'moved');
  END IF;

  -- If same item type and stackable, stack
  IF v_from_item.item_definition_id = v_to_item.item_definition_id 
     AND EXISTS (
       SELECT 1 FROM public.item_definitions 
       WHERE item_id = v_from_item.item_definition_id 
       AND max_stack_size > 1
     ) THEN
    
    -- Calculate how much we can add
    DECLARE
      v_max_stack integer;
      v_can_add integer;
    BEGIN
      SELECT max_stack_size INTO v_max_stack
      FROM public.item_definitions
      WHERE item_id = v_from_item.item_definition_id;
      
      v_can_add := LEAST(v_move_quantity, v_max_stack - v_to_item.quantity);
      
      IF v_can_add > 0 THEN
        -- Add to stack
        UPDATE public.player_items
        SET quantity = quantity + v_can_add
        WHERE id = v_to_item.id;
        
        -- Remove from source
        IF v_move_quantity >= v_from_item.quantity THEN
          DELETE FROM public.player_items WHERE id = v_from_item.id;
        ELSE
          UPDATE public.player_items
          SET quantity = quantity - v_can_add
          WHERE id = v_from_item.id;
        END IF;
        
        RETURN jsonb_build_object('success', true, 'action', 'stacked', 'amount', v_can_add);
      ELSE
        -- Can't stack, swap
        UPDATE public.player_items SET slot_position = p_from_slot WHERE id = v_to_item.id;
        UPDATE public.player_items SET slot_position = p_to_slot WHERE id = v_from_item.id;
        
        RETURN jsonb_build_object('success', true, 'action', 'swapped');
      END IF;
    END;
  ELSE
    -- Different items, swap
    UPDATE public.player_items SET slot_position = p_from_slot WHERE id = v_to_item.id;
    UPDATE public.player_items SET slot_position = p_to_slot WHERE id = v_from_item.id;
    
    RETURN jsonb_build_object('success', true, 'action', 'swapped');
  END IF;
END;
$$;

-- Function to award items to player
CREATE OR REPLACE FUNCTION public.award_items_batch(
  p_player_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_item jsonb;
  v_result jsonb := '[]'::jsonb;
  v_slot integer;
  v_item_def record;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Find empty slot (0-29)
    SELECT MIN(slot_position) INTO v_slot
    FROM (
      SELECT generate_series(0, 29) AS slot_position
      EXCEPT
      SELECT slot_position FROM public.player_items
      WHERE player_id = p_player_id AND slot_position IS NOT NULL
    ) available_slots;
    
    -- Insert item
    INSERT INTO public.player_items (
      player_id,
      item_definition_id,
      cnft_address,
      quantity,
      slot_position,
      mint_signature,
      acquisition_source
    ) VALUES (
      p_player_id,
      v_item->>'item_id',
      v_item->>'cnft_address',
      COALESCE((v_item->>'quantity')::integer, 1),
      v_slot,
      v_item->>'mint_signature',
      v_item->>'source'
    )
    RETURNING jsonb_build_object('id', id, 'slot', slot_position)
    INTO v_item;
    
    v_result := v_result || v_item;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'items', v_result);
END;
$$;

-- ========================================
-- STEP 22: Create trigger for inventory realtime (for Phase 6)
-- ========================================

-- Create function to notify on inventory changes
CREATE OR REPLACE FUNCTION notify_inventory_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'inventory_changes',
    json_build_object(
      'player_id', COALESCE(NEW.player_id, OLD.player_id),
      'event', TG_OP, -- INSERT, UPDATE, DELETE
      'item_id', COALESCE(NEW.id::text, OLD.id::text)
    )::text
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS inventory_change_notify ON public.player_items;
CREATE TRIGGER inventory_change_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.player_items
  FOR EACH ROW
  EXECUTE FUNCTION notify_inventory_change();

-- ========================================
-- STEP 23: Create indexes for performance
-- ========================================

CREATE INDEX IF NOT EXISTS idx_nfts_player_pda ON public.nfts(player_pda);
CREATE INDEX IF NOT EXISTS idx_nft_skill_experience_asset_id ON public.nft_skill_experience(asset_id);
CREATE INDEX IF NOT EXISTS idx_player_skill_experience_pda ON public.player_skill_experience(player_pda);

-- ========================================
-- COMPLETE!
-- ========================================
