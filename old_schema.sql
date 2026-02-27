--
-- PostgreSQL database dump
--

-- Dumped from database version 17.7 (Debian 17.7-3.pgdg13+1)
-- Dumped by pg_dump version 17.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: award_items_batch(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_items_batch(p_player_id uuid, p_items jsonb) RETURNS jsonb
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


--
-- Name: move_inventory_item(uuid, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_inventory_item(p_player_id uuid, p_from_slot integer, p_to_slot integer, p_quantity integer DEFAULT NULL::integer) RETURNS jsonb
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


--
-- Name: notify_inventory_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_inventory_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: update_animation_configs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_animation_configs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: action_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_skills (
    action character varying NOT NULL,
    skill character varying NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: animation_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.animation_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id text NOT NULL,
    frame_width integer NOT NULL,
    frame_height integer NOT NULL,
    margin integer DEFAULT 0,
    spacing integer DEFAULT 0,
    clips jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    category character varying NOT NULL,
    subcategory character varying,
    file_path character varying NOT NULL,
    public_url character varying NOT NULL,
    file_size bigint NOT NULL,
    file_type character varying NOT NULL,
    uploaded_by character varying DEFAULT 'map-editor'::character varying NOT NULL,
    description text,
    tags text[],
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    file_data bytea,
    default_skill_config jsonb
);


--
-- Name: assets_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.assets_view AS
 SELECT id,
    name,
    category,
    subcategory,
    file_path,
    public_url,
    file_size,
    file_type,
    uploaded_by,
    description,
    tags,
    metadata,
    created_at,
    updated_at,
    file_data,
    default_skill_config,
        CASE
            WHEN ((file_type)::text ~~ 'image/%'::text) THEN 'image'::text
            WHEN ((file_type)::text ~~ 'audio/%'::text) THEN 'audio'::text
            WHEN ((file_type)::text = 'application/json'::text) THEN 'json'::text
            ELSE 'other'::text
        END AS asset_type,
        CASE
            WHEN (file_size < 1024) THEN ((file_size)::text || ' B'::text)
            WHEN (file_size < (1024 * 1024)) THEN ((round(((file_size)::numeric / 1024.0), 1))::text || ' KB'::text)
            WHEN (file_size < ((1024 * 1024) * 1024)) THEN ((round(((file_size)::numeric / (1024.0 * (1024)::numeric)), 1))::text || ' MB'::text)
            ELSE ((round(((file_size)::numeric / ((1024.0 * (1024)::numeric) * (1024)::numeric)), 1))::text || ' GB'::text)
        END AS file_size_human
   FROM public.assets;


--
-- Name: chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chunks (
    id text NOT NULL,
    x integer NOT NULL,
    y integer NOT NULL,
    data jsonb NOT NULL,
    version integer NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    last_accessed timestamp without time zone
);


--
-- Name: cnft_minting_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cnft_minting_analytics (
    date timestamp with time zone,
    item_definition_id text,
    item_type text,
    rarity text,
    items_minted bigint,
    total_quantity bigint,
    total_cost numeric,
    avg_cost_per_item numeric
);


--
-- Name: experience_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.experience_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: experience_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experience_logs (
    id integer DEFAULT nextval('public.experience_logs_id_seq'::regclass) NOT NULL,
    player_pda character varying NOT NULL,
    skill character varying NOT NULL,
    experience_gain integer NOT NULL,
    source character varying,
    "timestamp" timestamp with time zone DEFAULT now(),
    session_id uuid,
    game_mode character varying,
    additional_data jsonb,
    asset_id text,
    CONSTRAINT experience_logs_experience_gain_check CHECK ((experience_gain > 0)),
    CONSTRAINT experience_logs_skill_check CHECK (((skill)::text = ANY (ARRAY[('attack'::character varying)::text, ('strength'::character varying)::text, ('defense'::character varying)::text, ('magic'::character varying)::text, ('projectiles'::character varying)::text, ('vitality'::character varying)::text, ('mining'::character varying)::text, ('woodcutting'::character varying)::text, ('fishing'::character varying)::text, ('hunting'::character varying)::text, ('smithing'::character varying)::text, ('crafting'::character varying)::text, ('cooking'::character varying)::text, ('alchemy'::character varying)::text, ('construction'::character varying)::text, ('luck'::character varying)::text])))
);


--
-- Name: item_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_definitions (
    item_id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    item_type text NOT NULL,
    rarity text NOT NULL,
    base_properties jsonb NOT NULL,
    image_url text,
    animation_url text,
    icon_url text,
    craft_recipe jsonb,
    max_floor_level integer,
    base_drop_rate numeric DEFAULT 0.0001 NOT NULL,
    is_craftable boolean DEFAULT false,
    max_stack_size integer DEFAULT 1,
    min_floor_level integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    mint_cost_cobx integer DEFAULT 0 NOT NULL,
    ground_sprite_url text,
    in_use_sprite_url text,
    in_use_animation_config jsonb,
    is_placeable boolean DEFAULT false NOT NULL,
    placeable_category text,
    placement_metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT item_definitions_item_type_check CHECK ((item_type = ANY (ARRAY['material'::text, 'equipment'::text, 'consumable'::text]))),
    CONSTRAINT item_definitions_placeable_category_check CHECK ((placeable_category = ANY (ARRAY['building'::text, 'crafting'::text, 'decoration'::text, 'storage'::text, 'furniture'::text, 'structure'::text]))),
    CONSTRAINT item_definitions_rarity_check CHECK ((rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text, 'legendary'::text])))
);


--
-- Name: map_editor_collisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.map_editor_collisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    object_id text NOT NULL,
    placed_object_id text NOT NULL,
    world_name text NOT NULL,
    chunk_x integer NOT NULL,
    chunk_y integer NOT NULL,
    collision_tiles text[] DEFAULT '{}'::text[],
    above_tiles text[] DEFAULT '{}'::text[],
    below_tiles text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    version integer DEFAULT 1 NOT NULL,
    interaction_tiles text[] DEFAULT '{}'::text[],
    collision_shapes jsonb DEFAULT '[]'::jsonb,
    above_shapes jsonb DEFAULT '[]'::jsonb,
    below_shapes jsonb DEFAULT '[]'::jsonb,
    interaction_shapes jsonb DEFAULT '[]'::jsonb,
    collision_mode text DEFAULT 'tiles'::text,
    biome_layer jsonb,
    biome_polygon_shapes jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT map_editor_collisions_collision_mode_check CHECK ((collision_mode = ANY (ARRAY['tiles'::text, 'polygons'::text, 'hybrid'::text])))
);


--
-- Name: TABLE map_editor_collisions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.map_editor_collisions IS 'Stores collision and interaction data for map editor objects. Supports both tile-based (legacy) and polygon-based (new) collision systems.';


--
-- Name: COLUMN map_editor_collisions.collision_shapes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.map_editor_collisions.collision_shapes IS 'Array of polygon shapes for collision areas. Each shape contains vertices array with {x, y} coordinates relative to object origin.';


--
-- Name: COLUMN map_editor_collisions.above_shapes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.map_editor_collisions.above_shapes IS 'Array of polygon shapes for areas above player. Each shape contains vertices array with {x, y} coordinates relative to object origin.';


--
-- Name: COLUMN map_editor_collisions.below_shapes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.map_editor_collisions.below_shapes IS 'Array of polygon shapes for areas below player. Each shape contains vertices array with {x, y} coordinates relative to object origin.';


--
-- Name: COLUMN map_editor_collisions.interaction_shapes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.map_editor_collisions.interaction_shapes IS 'Array of polygon shapes for interaction areas. Each shape contains vertices array with {x, y} coordinates relative to object origin.';


--
-- Name: COLUMN map_editor_collisions.collision_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.map_editor_collisions.collision_mode IS 'Collision system mode: "tiles" (legacy tile-based), "polygons" (new polygon-based), or "hybrid" (both). Defaults to "tiles" for backward compatibility.';


--
-- Name: COLUMN map_editor_collisions.biome_layer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.map_editor_collisions.biome_layer IS 'Per-tile biome grid [tileY][tileX] = biome id (water, land, lava, swamp, void). Used for rule-based walkability.';


--
-- Name: COLUMN map_editor_collisions.biome_polygon_shapes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.map_editor_collisions.biome_polygon_shapes IS 'Array of polygon shapes for biome regions (water, land). Each shape: { id, vertices: [{x,y}], biome, closed }. Enables precise polygon boundaries like collision shapes.';


--
-- Name: map_saves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.map_saves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text DEFAULT 'default-user'::text NOT NULL,
    world_name text DEFAULT 'obelisk_world'::text NOT NULL,
    map_name text NOT NULL,
    description text,
    base_chunk_id text,
    base_chunk_name text,
    base_chunk_image_path text,
    chunk_size integer DEFAULT 64 NOT NULL,
    world_width integer DEFAULT 2048 NOT NULL,
    world_height integer DEFAULT 2048 NOT NULL,
    camera_x integer DEFAULT 1024 NOT NULL,
    camera_y integer DEFAULT 1024 NOT NULL,
    scale real DEFAULT 1.0 NOT NULL,
    placed_objects jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_public boolean DEFAULT false,
    tags text[] DEFAULT '{}'::text[],
    version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    animation_stats jsonb DEFAULT '{}'::jsonb
);


--
-- Name: nft_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nft_metadata (
    asset_id text NOT NULL,
    metadata_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nft_skill_experience; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nft_skill_experience (
    asset_id text NOT NULL,
    skill text NOT NULL,
    experience bigint DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    pending_onchain_update boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nft_skill_experience_experience_check CHECK ((experience >= 0)),
    CONSTRAINT nft_skill_experience_level_check CHECK (((level >= 1) AND (level <= 99))),
    CONSTRAINT nft_skill_experience_skill_check CHECK ((skill = ANY (ARRAY['attack'::text, 'strength'::text, 'defense'::text, 'magic'::text, 'projectiles'::text, 'vitality'::text, 'mining'::text, 'woodcutting'::text, 'fishing'::text, 'hunting'::text, 'smithing'::text, 'crafting'::text, 'cooking'::text, 'alchemy'::text, 'construction'::text, 'luck'::text])))
);


--
-- Name: nfts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nfts (
    asset_id text NOT NULL,
    player_pda text,
    name text NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    combat_level integer DEFAULT 1 NOT NULL,
    total_level integer DEFAULT 9 NOT NULL,
    version text DEFAULT '2.0.0'::text NOT NULL,
    last_arweave_uri text,
    last_update_sig text,
    state_version integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    character_image_url text
);


--
-- Name: pda_creation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pda_creation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    pda_address text NOT NULL,
    creation_cost numeric NOT NULL,
    game_wallet_signature text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: player_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    item_definition_id text NOT NULL,
    cnft_address text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
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
    CONSTRAINT player_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: player_skill_experience; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_skill_experience (
    player_pda character varying NOT NULL,
    magic_xp bigint DEFAULT 0,
    crafting_xp bigint DEFAULT 0,
    magic_level integer DEFAULT 1,
    crafting_level integer DEFAULT 1,
    last_onchain_sync timestamp with time zone DEFAULT now(),
    pending_onchain_update boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    attack_xp bigint DEFAULT 0,
    strength_xp bigint DEFAULT 0,
    defense_xp bigint DEFAULT 0,
    projectiles_xp bigint DEFAULT 0,
    vitality_xp bigint DEFAULT 0,
    mining_xp bigint DEFAULT 0,
    woodcutting_xp bigint DEFAULT 0,
    fishing_xp bigint DEFAULT 0,
    hunting_xp bigint DEFAULT 0,
    smithing_xp bigint DEFAULT 0,
    cooking_xp bigint DEFAULT 0,
    alchemy_xp bigint DEFAULT 0,
    construction_xp bigint DEFAULT 0,
    luck_xp bigint DEFAULT 0,
    attack_level integer DEFAULT 1,
    strength_level integer DEFAULT 1,
    defense_level integer DEFAULT 1,
    projectiles_level integer DEFAULT 1,
    vitality_level integer DEFAULT 1,
    mining_level integer DEFAULT 1,
    woodcutting_level integer DEFAULT 1,
    fishing_level integer DEFAULT 1,
    hunting_level integer DEFAULT 1,
    smithing_level integer DEFAULT 1,
    cooking_level integer DEFAULT 1,
    alchemy_level integer DEFAULT 1,
    construction_level integer DEFAULT 1,
    luck_level integer DEFAULT 1,
    CONSTRAINT player_skill_experience_alchemy_level_check CHECK (((alchemy_level >= 1) AND (alchemy_level <= 99))),
    CONSTRAINT player_skill_experience_alchemy_xp_check CHECK ((alchemy_xp >= 0)),
    CONSTRAINT player_skill_experience_attack_level_check CHECK (((attack_level >= 1) AND (attack_level <= 99))),
    CONSTRAINT player_skill_experience_attack_xp_check CHECK ((attack_xp >= 0)),
    CONSTRAINT player_skill_experience_construction_level_check CHECK (((construction_level >= 1) AND (construction_level <= 99))),
    CONSTRAINT player_skill_experience_construction_xp_check CHECK ((construction_xp >= 0)),
    CONSTRAINT player_skill_experience_cooking_level_check CHECK (((cooking_level >= 1) AND (cooking_level <= 99))),
    CONSTRAINT player_skill_experience_cooking_xp_check CHECK ((cooking_xp >= 0)),
    CONSTRAINT player_skill_experience_crafting_level_check CHECK (((crafting_level >= 1) AND (crafting_level <= 120))),
    CONSTRAINT player_skill_experience_crafting_xp_check CHECK ((crafting_xp >= 0)),
    CONSTRAINT player_skill_experience_defense_level_check CHECK (((defense_level >= 1) AND (defense_level <= 99))),
    CONSTRAINT player_skill_experience_defense_xp_check CHECK ((defense_xp >= 0)),
    CONSTRAINT player_skill_experience_fishing_level_check CHECK (((fishing_level >= 1) AND (fishing_level <= 99))),
    CONSTRAINT player_skill_experience_fishing_xp_check CHECK ((fishing_xp >= 0)),
    CONSTRAINT player_skill_experience_hunting_level_check CHECK (((hunting_level >= 1) AND (hunting_level <= 99))),
    CONSTRAINT player_skill_experience_hunting_xp_check CHECK ((hunting_xp >= 0)),
    CONSTRAINT player_skill_experience_luck_level_check CHECK (((luck_level >= 1) AND (luck_level <= 99))),
    CONSTRAINT player_skill_experience_luck_xp_check CHECK ((luck_xp >= 0)),
    CONSTRAINT player_skill_experience_magic_level_check CHECK (((magic_level >= 1) AND (magic_level <= 120))),
    CONSTRAINT player_skill_experience_magic_xp_check CHECK ((magic_xp >= 0)),
    CONSTRAINT player_skill_experience_mining_level_check CHECK (((mining_level >= 1) AND (mining_level <= 99))),
    CONSTRAINT player_skill_experience_mining_xp_check CHECK ((mining_xp >= 0)),
    CONSTRAINT player_skill_experience_projectiles_level_check CHECK (((projectiles_level >= 1) AND (projectiles_level <= 99))),
    CONSTRAINT player_skill_experience_projectiles_xp_check CHECK ((projectiles_xp >= 0)),
    CONSTRAINT player_skill_experience_smithing_level_check CHECK (((smithing_level >= 1) AND (smithing_level <= 99))),
    CONSTRAINT player_skill_experience_smithing_xp_check CHECK ((smithing_xp >= 0)),
    CONSTRAINT player_skill_experience_strength_level_check CHECK (((strength_level >= 1) AND (strength_level <= 99))),
    CONSTRAINT player_skill_experience_strength_xp_check CHECK ((strength_xp >= 0)),
    CONSTRAINT player_skill_experience_vitality_level_check CHECK (((vitality_level >= 1) AND (vitality_level <= 99))),
    CONSTRAINT player_skill_experience_vitality_xp_check CHECK ((vitality_xp >= 0)),
    CONSTRAINT player_skill_experience_woodcutting_level_check CHECK (((woodcutting_level >= 1) AND (woodcutting_level <= 99))),
    CONSTRAINT player_skill_experience_woodcutting_xp_check CHECK ((woodcutting_xp >= 0))
);


--
-- Name: player_structures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_structures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chunk_x integer NOT NULL,
    chunk_y integer NOT NULL,
    x integer NOT NULL,
    y integer NOT NULL,
    item_definition_id text NOT NULL,
    structure_type text NOT NULL,
    rotation real DEFAULT 0,
    scale real DEFAULT 1,
    z_layer text DEFAULT 'mid'::text,
    z_offset integer DEFAULT 0,
    collision boolean DEFAULT true,
    collision_bounds jsonb,
    properties jsonb DEFAULT '{}'::jsonb,
    placed_at timestamp with time zone DEFAULT now() NOT NULL,
    destroyed_at timestamp with time zone,
    health integer DEFAULT 100,
    max_health integer DEFAULT 100,
    placed_by_player_id uuid,
    placed_by_name text,
    CONSTRAINT player_structures_health_check CHECK ((health >= 0)),
    CONSTRAINT player_structures_max_health_check CHECK ((max_health > 0)),
    CONSTRAINT player_structures_rotation_check CHECK (((rotation >= (0)::double precision) AND (rotation < (360)::double precision))),
    CONSTRAINT player_structures_scale_check CHECK (((scale > (0)::double precision) AND (scale <= (5)::double precision))),
    CONSTRAINT player_structures_x_check CHECK (((x >= 0) AND (x < 2048))),
    CONSTRAINT player_structures_y_check CHECK (((y >= 0) AND (y < 2048))),
    CONSTRAINT player_structures_z_layer_check CHECK ((z_layer = ANY (ARRAY['below'::text, 'mid'::text, 'above'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    player_pda text,
    wallet_address text,
    character_class integer DEFAULT 0,
    character_name text DEFAULT 'Unnamed Player'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pda_created_at timestamp with time zone,
    pda_creation_cost numeric DEFAULT 0,
    pda_status text DEFAULT 'pending'::text,
    cobx_token_account text,
    character_cnft_1 text,
    character_cnft_2 text,
    character_cnft_3 text,
    character_cnft_4 text,
    character_cnft_5 text,
    active_character_slot integer,
    username text,
    user_type text DEFAULT 'WEB2'::text,
    character_customization jsonb DEFAULT '{"outfit": "default"}'::jsonb,
    CONSTRAINT profiles_active_character_slot_check CHECK (((active_character_slot >= 1) AND (active_character_slot <= 5))),
    CONSTRAINT profiles_pda_status_check CHECK ((pda_status = ANY (ARRAY['pending'::text, 'creating'::text, 'active'::text, 'failed'::text]))),
    CONSTRAINT profiles_user_type_check CHECK ((user_type = ANY (ARRAY['WEB2'::text, 'WEB3'::text])))
);


--
-- Name: quests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: resource_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_states (
    interaction_id text NOT NULL,
    chunk_x integer NOT NULL,
    chunk_y integer NOT NULL,
    object_id text NOT NULL,
    current_health integer NOT NULL,
    max_health integer NOT NULL,
    is_depleted boolean NOT NULL,
    depleted_at timestamp with time zone,
    respawn_time_ms integer NOT NULL,
    last_harvested_by text,
    total_harvests integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: skill_training_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.skill_training_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: skill_training_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_training_logs (
    id integer DEFAULT nextval('public.skill_training_logs_id_seq'::regclass) NOT NULL,
    asset_id character varying NOT NULL,
    action character varying NOT NULL,
    skill character varying NOT NULL,
    exp_gained integer NOT NULL,
    player_pda character varying,
    session_id character varying,
    game_mode character varying,
    additional_data jsonb,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT skill_training_logs_exp_gained_check CHECK ((exp_gained > 0))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    username text,
    password_hash text
);


--
-- Name: view_map_save_interactions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.view_map_save_interactions AS
 SELECT ms.id AS map_save_id,
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
   FROM ((public.map_saves ms
     CROSS JOIN LATERAL jsonb_array_elements(ms.placed_objects) obj(value))
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE((obj.value -> 'interactions'::text), '[]'::jsonb)) it(value));


--
-- Name: view_map_save_npcs; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.view_map_save_npcs AS
 SELECT ms.id AS map_save_id,
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
   FROM (public.map_saves ms
     CROSS JOIN LATERAL jsonb_array_elements(ms.placed_objects) obj(value))
  WHERE ((obj.value -> 'npcProfile'::text) IS NOT NULL);


--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address text NOT NULL,
    referral_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    my_referral_code text
);


--
-- Name: xp_award_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xp_award_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text,
    asset_id text NOT NULL,
    skill text NOT NULL,
    experience_gain integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT xp_award_events_experience_gain_check CHECK ((experience_gain > 0))
);


--
-- Name: action_skills action_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_skills
    ADD CONSTRAINT action_skills_pkey PRIMARY KEY (action);


--
-- Name: animation_configs animation_configs_asset_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animation_configs
    ADD CONSTRAINT animation_configs_asset_id_key UNIQUE (asset_id);


--
-- Name: animation_configs animation_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animation_configs
    ADD CONSTRAINT animation_configs_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);


--
-- Name: experience_logs experience_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_logs
    ADD CONSTRAINT experience_logs_pkey PRIMARY KEY (id);


--
-- Name: item_definitions item_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_definitions
    ADD CONSTRAINT item_definitions_pkey PRIMARY KEY (item_id);


--
-- Name: map_editor_collisions map_editor_collisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.map_editor_collisions
    ADD CONSTRAINT map_editor_collisions_pkey PRIMARY KEY (id);


--
-- Name: map_editor_collisions map_editor_collisions_placed_object_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.map_editor_collisions
    ADD CONSTRAINT map_editor_collisions_placed_object_id_key UNIQUE (placed_object_id);


--
-- Name: map_saves map_saves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.map_saves
    ADD CONSTRAINT map_saves_pkey PRIMARY KEY (id);


--
-- Name: nft_metadata nft_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nft_metadata
    ADD CONSTRAINT nft_metadata_pkey PRIMARY KEY (asset_id);


--
-- Name: nft_skill_experience nft_skill_experience_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nft_skill_experience
    ADD CONSTRAINT nft_skill_experience_pkey PRIMARY KEY (asset_id, skill);


--
-- Name: nfts nfts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfts
    ADD CONSTRAINT nfts_pkey PRIMARY KEY (asset_id);


--
-- Name: pda_creation_log pda_creation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_creation_log
    ADD CONSTRAINT pda_creation_log_pkey PRIMARY KEY (id);


--
-- Name: player_items player_items_cnft_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_items
    ADD CONSTRAINT player_items_cnft_address_key UNIQUE (cnft_address);


--
-- Name: player_items player_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_items
    ADD CONSTRAINT player_items_pkey PRIMARY KEY (id);


--
-- Name: player_skill_experience player_skill_experience_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_skill_experience
    ADD CONSTRAINT player_skill_experience_pkey PRIMARY KEY (player_pda);


--
-- Name: player_structures player_structures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_structures
    ADD CONSTRAINT player_structures_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_wallet_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_wallet_address_key UNIQUE (wallet_address);


--
-- Name: quests quests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quests
    ADD CONSTRAINT quests_pkey PRIMARY KEY (id);


--
-- Name: resource_states resource_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_states
    ADD CONSTRAINT resource_states_pkey PRIMARY KEY (interaction_id);


--
-- Name: skill_training_logs skill_training_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_training_logs
    ADD CONSTRAINT skill_training_logs_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: waitlist waitlist_my_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_my_referral_code_key UNIQUE (my_referral_code);


--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);


--
-- Name: waitlist waitlist_wallet_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_wallet_address_key UNIQUE (wallet_address);


--
-- Name: xp_award_events xp_award_events_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xp_award_events
    ADD CONSTRAINT xp_award_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: xp_award_events xp_award_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xp_award_events
    ADD CONSTRAINT xp_award_events_pkey PRIMARY KEY (id);


--
-- Name: idx_animation_configs_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_animation_configs_asset_id ON public.animation_configs USING btree (asset_id);


--
-- Name: idx_assets_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_category ON public.assets USING btree (category);


--
-- Name: idx_assets_category_subcategory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_category_subcategory ON public.assets USING btree (category, subcategory);


--
-- Name: idx_assets_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_created_at ON public.assets USING btree (created_at DESC);


--
-- Name: idx_assets_file_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_file_type ON public.assets USING btree (file_type);


--
-- Name: idx_assets_skill_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_skill_config ON public.assets USING gin (default_skill_config) WHERE (default_skill_config IS NOT NULL);


--
-- Name: idx_assets_subcategory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_subcategory ON public.assets USING btree (subcategory);


--
-- Name: idx_assets_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_uploaded_by ON public.assets USING btree (uploaded_by);


--
-- Name: idx_chunks_coords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chunks_coords ON public.chunks USING btree (x, y);


--
-- Name: idx_chunks_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chunks_data_gin ON public.chunks USING gin (data);


--
-- Name: idx_chunks_last_accessed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chunks_last_accessed ON public.chunks USING btree (last_accessed DESC);


--
-- Name: idx_chunks_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chunks_updated_at ON public.chunks USING btree (updated_at DESC);


--
-- Name: idx_experience_logs_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_logs_asset ON public.experience_logs USING btree (asset_id) WHERE (asset_id IS NOT NULL);


--
-- Name: idx_experience_logs_player_pda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_logs_player_pda ON public.experience_logs USING btree (player_pda);


--
-- Name: idx_experience_logs_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_logs_session_id ON public.experience_logs USING btree (session_id) WHERE (session_id IS NOT NULL);


--
-- Name: idx_experience_logs_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_logs_skill ON public.experience_logs USING btree (skill);


--
-- Name: idx_experience_logs_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_logs_source ON public.experience_logs USING btree (source) WHERE (source IS NOT NULL);


--
-- Name: idx_experience_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_logs_timestamp ON public.experience_logs USING btree ("timestamp" DESC);


--
-- Name: idx_item_definitions_ground_sprite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_definitions_ground_sprite ON public.item_definitions USING btree (ground_sprite_url) WHERE (ground_sprite_url IS NOT NULL);


--
-- Name: idx_item_definitions_in_use_sprite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_definitions_in_use_sprite ON public.item_definitions USING btree (in_use_sprite_url) WHERE (in_use_sprite_url IS NOT NULL);


--
-- Name: idx_item_definitions_placeable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_definitions_placeable ON public.item_definitions USING btree (is_placeable);


--
-- Name: idx_item_definitions_placeable_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_definitions_placeable_category ON public.item_definitions USING btree (placeable_category) WHERE (placeable_category IS NOT NULL);


--
-- Name: idx_map_editor_collisions_chunk_coords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_editor_collisions_chunk_coords ON public.map_editor_collisions USING btree (chunk_x, chunk_y);


--
-- Name: idx_map_editor_collisions_object_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_editor_collisions_object_id ON public.map_editor_collisions USING btree (object_id);


--
-- Name: idx_map_editor_collisions_placed_object_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_editor_collisions_placed_object_id ON public.map_editor_collisions USING btree (placed_object_id) WHERE (placed_object_id IS NOT NULL);


--
-- Name: idx_map_editor_collisions_shapes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_editor_collisions_shapes ON public.map_editor_collisions USING gin (collision_shapes, above_shapes, below_shapes, interaction_shapes);


--
-- Name: idx_map_editor_collisions_world_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_editor_collisions_world_name ON public.map_editor_collisions USING btree (world_name);


--
-- Name: idx_map_saves_animation_stats; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_saves_animation_stats ON public.map_saves USING gin (animation_stats);


--
-- Name: idx_map_saves_base_chunk_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_saves_base_chunk_id ON public.map_saves USING btree (base_chunk_id) WHERE (base_chunk_id IS NOT NULL);


--
-- Name: idx_map_saves_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_saves_public ON public.map_saves USING btree (is_public);


--
-- Name: idx_map_saves_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_saves_tags ON public.map_saves USING gin (tags);


--
-- Name: idx_map_saves_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_saves_updated_at ON public.map_saves USING btree (updated_at DESC);


--
-- Name: idx_map_saves_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_saves_user_id ON public.map_saves USING btree (user_id);


--
-- Name: idx_map_saves_world_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_map_saves_world_name ON public.map_saves USING btree (world_name);


--
-- Name: idx_nft_metadata_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nft_metadata_asset_id ON public.nft_metadata USING btree (asset_id);


--
-- Name: idx_nft_skill_exp_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nft_skill_exp_asset ON public.nft_skill_experience USING btree (asset_id);


--
-- Name: idx_nft_skill_exp_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nft_skill_exp_pending ON public.nft_skill_experience USING btree (pending_onchain_update) WHERE (pending_onchain_update = true);


--
-- Name: idx_nft_skill_experience_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nft_skill_experience_asset_id ON public.nft_skill_experience USING btree (asset_id);


--
-- Name: idx_nft_skill_pending_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nft_skill_pending_updated ON public.nft_skill_experience USING btree (updated_at) WHERE (pending_onchain_update = true);


--
-- Name: idx_nfts_character_image_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nfts_character_image_url ON public.nfts USING btree (character_image_url) WHERE (character_image_url IS NOT NULL);


--
-- Name: idx_nfts_player_pda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nfts_player_pda ON public.nfts USING btree (player_pda);


--
-- Name: idx_pda_creation_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pda_creation_log_created_at ON public.pda_creation_log USING btree (created_at DESC);


--
-- Name: idx_player_items_cnft_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_items_cnft_address ON public.player_items USING btree (cnft_address);


--
-- Name: idx_player_items_definition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_items_definition ON public.player_items USING btree (item_definition_id);


--
-- Name: idx_player_items_minted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_items_minted_at ON public.player_items USING btree (minted_at DESC);


--
-- Name: idx_player_items_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_items_player_id ON public.player_items USING btree (player_id);


--
-- Name: idx_player_items_slot_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_items_slot_position ON public.player_items USING btree (slot_position);


--
-- Name: idx_player_skill_experience_alchemy_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_alchemy_level ON public.player_skill_experience USING btree (alchemy_level);


--
-- Name: idx_player_skill_experience_attack_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_attack_level ON public.player_skill_experience USING btree (attack_level);


--
-- Name: idx_player_skill_experience_construction_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_construction_level ON public.player_skill_experience USING btree (construction_level);


--
-- Name: idx_player_skill_experience_cooking_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_cooking_level ON public.player_skill_experience USING btree (cooking_level);


--
-- Name: idx_player_skill_experience_crafting_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_crafting_level ON public.player_skill_experience USING btree (crafting_level);


--
-- Name: idx_player_skill_experience_defense_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_defense_level ON public.player_skill_experience USING btree (defense_level);


--
-- Name: idx_player_skill_experience_fishing_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_fishing_level ON public.player_skill_experience USING btree (fishing_level);


--
-- Name: idx_player_skill_experience_hunting_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_hunting_level ON public.player_skill_experience USING btree (hunting_level);


--
-- Name: idx_player_skill_experience_luck_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_luck_level ON public.player_skill_experience USING btree (luck_level);


--
-- Name: idx_player_skill_experience_magic_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_magic_level ON public.player_skill_experience USING btree (magic_level);


--
-- Name: idx_player_skill_experience_mining_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_mining_level ON public.player_skill_experience USING btree (mining_level);


--
-- Name: idx_player_skill_experience_pda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_pda ON public.player_skill_experience USING btree (player_pda);


--
-- Name: idx_player_skill_experience_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_pending ON public.player_skill_experience USING btree (pending_onchain_update) WHERE (pending_onchain_update = true);


--
-- Name: idx_player_skill_experience_projectiles_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_projectiles_level ON public.player_skill_experience USING btree (projectiles_level);


--
-- Name: idx_player_skill_experience_smithing_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_smithing_level ON public.player_skill_experience USING btree (smithing_level);


--
-- Name: idx_player_skill_experience_strength_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_strength_level ON public.player_skill_experience USING btree (strength_level);


--
-- Name: idx_player_skill_experience_vitality_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_vitality_level ON public.player_skill_experience USING btree (vitality_level);


--
-- Name: idx_player_skill_experience_woodcutting_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_skill_experience_woodcutting_level ON public.player_skill_experience USING btree (woodcutting_level);


--
-- Name: idx_player_structures_chunk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_structures_chunk ON public.player_structures USING btree (chunk_x, chunk_y);


--
-- Name: idx_player_structures_item_def; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_structures_item_def ON public.player_structures USING btree (item_definition_id);


--
-- Name: idx_player_structures_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_structures_player ON public.player_structures USING btree (placed_by_player_id);


--
-- Name: idx_player_structures_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_structures_type ON public.player_structures USING btree (structure_type);


--
-- Name: idx_profiles_character_customization; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_character_customization ON public.profiles USING gin (character_customization);


--
-- Name: idx_profiles_cobx_token_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_cobx_token_account ON public.profiles USING btree (cobx_token_account) WHERE (cobx_token_account IS NOT NULL);


--
-- Name: idx_quests_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_type ON public.quests USING btree (quest_type);


--
-- Name: idx_quests_world_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_world_name ON public.quests USING btree (world_name);


--
-- Name: idx_resource_states_chunk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resource_states_chunk ON public.resource_states USING btree (chunk_x, chunk_y);


--
-- Name: idx_resource_states_depleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resource_states_depleted ON public.resource_states USING btree (is_depleted, depleted_at) WHERE (is_depleted = true);


--
-- Name: idx_skill_training_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_training_logs_action ON public.skill_training_logs USING btree (action) WHERE (action IS NOT NULL);


--
-- Name: idx_skill_training_logs_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_training_logs_asset_id ON public.skill_training_logs USING btree (asset_id) WHERE (asset_id IS NOT NULL);


--
-- Name: idx_skill_training_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_training_logs_created_at ON public.skill_training_logs USING btree (created_at DESC);


--
-- Name: idx_skill_training_logs_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_training_logs_skill ON public.skill_training_logs USING btree (skill);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username) WHERE (username IS NOT NULL);


--
-- Name: idx_waitlist_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_created ON public.waitlist USING btree (created_at);


--
-- Name: idx_waitlist_my_referral_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_waitlist_my_referral_code ON public.waitlist USING btree (my_referral_code) WHERE (my_referral_code IS NOT NULL);


--
-- Name: idx_waitlist_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_wallet ON public.waitlist USING btree (wallet_address);


--
-- Name: map_saves_user_id_world_name_map_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX map_saves_user_id_world_name_map_name_key ON public.map_saves USING btree (user_id, world_name, map_name);


--
-- Name: profiles_username_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_username_idx ON public.profiles USING btree (username) WHERE (username IS NOT NULL);


--
-- Name: profiles_username_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_username_unique ON public.profiles USING btree (username) WHERE (username IS NOT NULL);


--
-- Name: unique_cnft_per_player; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_cnft_per_player ON public.player_items USING btree (player_id, cnft_address) WHERE (cnft_address IS NOT NULL);


--
-- Name: player_items inventory_change_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_change_notify AFTER INSERT OR DELETE OR UPDATE ON public.player_items FOR EACH ROW EXECUTE FUNCTION public.notify_inventory_change();


--
-- Name: animation_configs trigger_update_animation_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_animation_configs_updated_at BEFORE UPDATE ON public.animation_configs FOR EACH ROW EXECUTE FUNCTION public.update_animation_configs_updated_at();


--
-- Name: pda_creation_log pda_creation_log_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_creation_log
    ADD CONSTRAINT pda_creation_log_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.profiles(id);


--
-- Name: player_items player_items_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_items
    ADD CONSTRAINT player_items_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.profiles(id);


--
-- Name: player_items player_items_traded_to_player_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_items
    ADD CONSTRAINT player_items_traded_to_player_fkey FOREIGN KEY (traded_to_player) REFERENCES public.profiles(id);


--
-- Name: player_structures player_structures_item_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_structures
    ADD CONSTRAINT player_structures_item_definition_id_fkey FOREIGN KEY (item_definition_id) REFERENCES public.item_definitions(item_id);


--
-- Name: player_structures player_structures_placed_by_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_structures
    ADD CONSTRAINT player_structures_placed_by_player_id_fkey FOREIGN KEY (placed_by_player_id) REFERENCES public.profiles(id);


--
-- Name: skill_training_logs skill_training_logs_action_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_training_logs
    ADD CONSTRAINT skill_training_logs_action_fkey FOREIGN KEY (action) REFERENCES public.action_skills(action);


--
-- PostgreSQL database dump complete
--

