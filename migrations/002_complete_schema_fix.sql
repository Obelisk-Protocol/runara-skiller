-- Comprehensive Schema Migration: Fix All Column Name Misalignments
-- This migration fixes the schema to use full skill names consistently
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: Drop existing trigger and function (will recreate with correct names)
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_update_nft_total_level ON nfts;
DROP TRIGGER IF EXISTS trigger_update_nft_total_level_update ON nfts;
DROP FUNCTION IF EXISTS update_nft_total_level();
DROP FUNCTION IF EXISTS calculate_total_level(integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer);

-- ============================================================================
-- STEP 2: Rename old abbreviated columns to full names (if they exist)
-- Handle case where both old and new columns might exist
-- ============================================================================
DO $$
BEGIN
  -- Rename combat skill abbreviations
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'att') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'attack') THEN
      -- Both exist: merge data (take max), then drop old
      UPDATE nfts SET attack = GREATEST(attack, att) WHERE att IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS att;
    ELSE
      -- Only old exists: rename it
      ALTER TABLE nfts RENAME COLUMN att TO attack;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'str') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'strength') THEN
      UPDATE nfts SET strength = GREATEST(strength, str) WHERE str IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS str;
    ELSE
      ALTER TABLE nfts RENAME COLUMN str TO strength;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'def') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'defense') THEN
      UPDATE nfts SET defense = GREATEST(defense, def) WHERE def IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS def;
    ELSE
      ALTER TABLE nfts RENAME COLUMN def TO defense;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'mag') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'magic') THEN
      UPDATE nfts SET magic = GREATEST(magic, mag) WHERE mag IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS mag;
    ELSE
      ALTER TABLE nfts RENAME COLUMN mag TO magic;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'pro') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'projectiles') THEN
      UPDATE nfts SET projectiles = GREATEST(projectiles, pro) WHERE pro IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS pro;
    ELSE
      ALTER TABLE nfts RENAME COLUMN pro TO projectiles;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'vit') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'vitality') THEN
      UPDATE nfts SET vitality = GREATEST(vitality, vit) WHERE vit IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS vit;
    ELSE
      ALTER TABLE nfts RENAME COLUMN vit TO vitality;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'cra') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'crafting') THEN
      UPDATE nfts SET crafting = GREATEST(crafting, cra) WHERE cra IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS cra;
    ELSE
      ALTER TABLE nfts RENAME COLUMN cra TO crafting;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'luc') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'luck') THEN
      UPDATE nfts SET luck = GREATEST(luck, luc) WHERE luc IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS luc;
    ELSE
      ALTER TABLE nfts RENAME COLUMN luc TO luck;
    END IF;
  END IF;

  -- Remove obsolete "gat" column (old gathering abbreviation, no longer used)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'gat') THEN
    ALTER TABLE nfts DROP COLUMN IF EXISTS gat;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Rename _level columns to skill names (if they exist)
-- ============================================================================
DO $$
BEGIN
  -- Gathering skills
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'mining_level') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'mining') THEN
      -- Both exist: merge data, then drop _level
      UPDATE nfts SET mining = GREATEST(COALESCE(mining, 1), COALESCE(mining_level, 1)) WHERE mining_level IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS mining_level;
    ELSE
      ALTER TABLE nfts RENAME COLUMN mining_level TO mining;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'woodcutting_level') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'woodcutting') THEN
      UPDATE nfts SET woodcutting = GREATEST(COALESCE(woodcutting, 1), COALESCE(woodcutting_level, 1)) WHERE woodcutting_level IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS woodcutting_level;
    ELSE
      ALTER TABLE nfts RENAME COLUMN woodcutting_level TO woodcutting;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'fishing_level') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'fishing') THEN
      UPDATE nfts SET fishing = GREATEST(COALESCE(fishing, 1), COALESCE(fishing_level, 1)) WHERE fishing_level IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS fishing_level;
    ELSE
      ALTER TABLE nfts RENAME COLUMN fishing_level TO fishing;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'farming_level') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'farming') THEN
      UPDATE nfts SET farming = GREATEST(COALESCE(farming, 1), COALESCE(farming_level, 1)) WHERE farming_level IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS farming_level;
    ELSE
      ALTER TABLE nfts RENAME COLUMN farming_level TO farming;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'hunting_level') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'hunting') THEN
      UPDATE nfts SET hunting = GREATEST(COALESCE(hunting, 1), COALESCE(hunting_level, 1)) WHERE hunting_level IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS hunting_level;
    ELSE
      ALTER TABLE nfts RENAME COLUMN hunting_level TO hunting;
    END IF;
  END IF;

  -- Crafting skills
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'smithing_level') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'smithing') THEN
      UPDATE nfts SET smithing = GREATEST(COALESCE(smithing, 1), COALESCE(smithing_level, 1)) WHERE smithing_level IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS smithing_level;
    ELSE
      ALTER TABLE nfts RENAME COLUMN smithing_level TO smithing;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'cooking_level') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'cooking') THEN
      UPDATE nfts SET cooking = GREATEST(COALESCE(cooking, 1), COALESCE(cooking_level, 1)) WHERE cooking_level IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS cooking_level;
    ELSE
      ALTER TABLE nfts RENAME COLUMN cooking_level TO cooking;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'alchemy_level') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'alchemy') THEN
      UPDATE nfts SET alchemy = GREATEST(COALESCE(alchemy, 1), COALESCE(alchemy_level, 1)) WHERE alchemy_level IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS alchemy_level;
    ELSE
      ALTER TABLE nfts RENAME COLUMN alchemy_level TO alchemy;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'construction_level') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'construction') THEN
      UPDATE nfts SET construction = GREATEST(COALESCE(construction, 1), COALESCE(construction_level, 1)) WHERE construction_level IS NOT NULL;
      ALTER TABLE nfts DROP COLUMN IF EXISTS construction_level;
    ELSE
      ALTER TABLE nfts RENAME COLUMN construction_level TO construction;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Ensure all required columns exist with correct names and constraints
-- ============================================================================
DO $$
BEGIN
  -- Combat skills (ensure they exist and are NOT NULL)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'attack') THEN
    ALTER TABLE nfts ADD COLUMN attack integer NOT NULL DEFAULT 1;
  ELSE
    ALTER TABLE nfts ALTER COLUMN attack SET DEFAULT 1;
    ALTER TABLE nfts ALTER COLUMN attack SET NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'strength') THEN
    ALTER TABLE nfts ADD COLUMN strength integer NOT NULL DEFAULT 1;
  ELSE
    ALTER TABLE nfts ALTER COLUMN strength SET DEFAULT 1;
    ALTER TABLE nfts ALTER COLUMN strength SET NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'defense') THEN
    ALTER TABLE nfts ADD COLUMN defense integer NOT NULL DEFAULT 1;
  ELSE
    ALTER TABLE nfts ALTER COLUMN defense SET DEFAULT 1;
    ALTER TABLE nfts ALTER COLUMN defense SET NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'magic') THEN
    ALTER TABLE nfts ADD COLUMN magic integer NOT NULL DEFAULT 1;
  ELSE
    ALTER TABLE nfts ALTER COLUMN magic SET DEFAULT 1;
    ALTER TABLE nfts ALTER COLUMN magic SET NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'projectiles') THEN
    ALTER TABLE nfts ADD COLUMN projectiles integer NOT NULL DEFAULT 1;
  ELSE
    ALTER TABLE nfts ALTER COLUMN projectiles SET DEFAULT 1;
    ALTER TABLE nfts ALTER COLUMN projectiles SET NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'vitality') THEN
    ALTER TABLE nfts ADD COLUMN vitality integer NOT NULL DEFAULT 1;
  ELSE
    ALTER TABLE nfts ALTER COLUMN vitality SET DEFAULT 1;
    ALTER TABLE nfts ALTER COLUMN vitality SET NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'crafting') THEN
    ALTER TABLE nfts ADD COLUMN crafting integer NOT NULL DEFAULT 1;
  ELSE
    ALTER TABLE nfts ALTER COLUMN crafting SET DEFAULT 1;
    ALTER TABLE nfts ALTER COLUMN crafting SET NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'luck') THEN
    ALTER TABLE nfts ADD COLUMN luck integer NOT NULL DEFAULT 1;
  ELSE
    ALTER TABLE nfts ALTER COLUMN luck SET DEFAULT 1;
    ALTER TABLE nfts ALTER COLUMN luck SET NOT NULL;
  END IF;

  -- Gathering skills
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'mining') THEN
    ALTER TABLE nfts ADD COLUMN mining integer NOT NULL DEFAULT 1 CHECK (mining >= 1 AND mining <= 99);
  ELSE
    ALTER TABLE nfts ALTER COLUMN mining SET DEFAULT 1;
    -- Add check constraint if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'nfts_mining_check'
    ) THEN
      ALTER TABLE nfts ADD CONSTRAINT nfts_mining_check CHECK (mining >= 1 AND mining <= 99);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'woodcutting') THEN
    ALTER TABLE nfts ADD COLUMN woodcutting integer NOT NULL DEFAULT 1 CHECK (woodcutting >= 1 AND woodcutting <= 99);
  ELSE
    ALTER TABLE nfts ALTER COLUMN woodcutting SET DEFAULT 1;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfts_woodcutting_check') THEN
      ALTER TABLE nfts ADD CONSTRAINT nfts_woodcutting_check CHECK (woodcutting >= 1 AND woodcutting <= 99);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'fishing') THEN
    ALTER TABLE nfts ADD COLUMN fishing integer NOT NULL DEFAULT 1 CHECK (fishing >= 1 AND fishing <= 99);
  ELSE
    ALTER TABLE nfts ALTER COLUMN fishing SET DEFAULT 1;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfts_fishing_check') THEN
      ALTER TABLE nfts ADD CONSTRAINT nfts_fishing_check CHECK (fishing >= 1 AND fishing <= 99);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'farming') THEN
    ALTER TABLE nfts ADD COLUMN farming integer NOT NULL DEFAULT 1 CHECK (farming >= 1 AND farming <= 99);
  ELSE
    ALTER TABLE nfts ALTER COLUMN farming SET DEFAULT 1;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfts_farming_check') THEN
      ALTER TABLE nfts ADD CONSTRAINT nfts_farming_check CHECK (farming >= 1 AND farming <= 99);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'hunting') THEN
    ALTER TABLE nfts ADD COLUMN hunting integer NOT NULL DEFAULT 1 CHECK (hunting >= 1 AND hunting <= 99);
  ELSE
    ALTER TABLE nfts ALTER COLUMN hunting SET DEFAULT 1;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfts_hunting_check') THEN
      ALTER TABLE nfts ADD CONSTRAINT nfts_hunting_check CHECK (hunting >= 1 AND hunting <= 99);
    END IF;
  END IF;

  -- Crafting skills
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'smithing') THEN
    ALTER TABLE nfts ADD COLUMN smithing integer NOT NULL DEFAULT 1 CHECK (smithing >= 1 AND smithing <= 99);
  ELSE
    ALTER TABLE nfts ALTER COLUMN smithing SET DEFAULT 1;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfts_smithing_check') THEN
      ALTER TABLE nfts ADD CONSTRAINT nfts_smithing_check CHECK (smithing >= 1 AND smithing <= 99);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'cooking') THEN
    ALTER TABLE nfts ADD COLUMN cooking integer NOT NULL DEFAULT 1 CHECK (cooking >= 1 AND cooking <= 99);
  ELSE
    ALTER TABLE nfts ALTER COLUMN cooking SET DEFAULT 1;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfts_cooking_check') THEN
      ALTER TABLE nfts ADD CONSTRAINT nfts_cooking_check CHECK (cooking >= 1 AND cooking <= 99);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'alchemy') THEN
    ALTER TABLE nfts ADD COLUMN alchemy integer NOT NULL DEFAULT 1 CHECK (alchemy >= 1 AND alchemy <= 99);
  ELSE
    ALTER TABLE nfts ALTER COLUMN alchemy SET DEFAULT 1;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfts_alchemy_check') THEN
      ALTER TABLE nfts ADD CONSTRAINT nfts_alchemy_check CHECK (alchemy >= 1 AND alchemy <= 99);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'construction') THEN
    ALTER TABLE nfts ADD COLUMN construction integer NOT NULL DEFAULT 1 CHECK (construction >= 1 AND construction <= 99);
  ELSE
    ALTER TABLE nfts ALTER COLUMN construction SET DEFAULT 1;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfts_construction_check') THEN
      ALTER TABLE nfts ADD CONSTRAINT nfts_construction_check CHECK (construction >= 1 AND construction <= 99);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Recreate trigger function with correct column names
-- ============================================================================

-- Helper function to calculate total level (using full column names)
CREATE OR REPLACE FUNCTION calculate_total_level(
    attack INTEGER, strength INTEGER, defense INTEGER, magic INTEGER, 
    projectiles INTEGER, vitality INTEGER, crafting INTEGER, luck INTEGER,
    mining INTEGER, woodcutting INTEGER, fishing INTEGER, farming INTEGER, 
    hunting INTEGER, smithing INTEGER, cooking INTEGER, alchemy INTEGER, 
    construction INTEGER
) RETURNS INTEGER AS $$
BEGIN
    RETURN attack + strength + defense + magic + projectiles + vitality + 
           crafting + luck + mining + woodcutting + fishing + farming + 
           hunting + smithing + cooking + alchemy + construction;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically update total_level
CREATE OR REPLACE FUNCTION update_nft_total_level()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_level = calculate_total_level(
        COALESCE(NEW.attack, 1),
        COALESCE(NEW.strength, 1),
        COALESCE(NEW.defense, 1),
        COALESCE(NEW.magic, 1),
        COALESCE(NEW.projectiles, 1),
        COALESCE(NEW.vitality, 1),
        COALESCE(NEW.crafting, 1),
        COALESCE(NEW.luck, 1),
        COALESCE(NEW.mining, 1),
        COALESCE(NEW.woodcutting, 1),
        COALESCE(NEW.fishing, 1),
        COALESCE(NEW.farming, 1),
        COALESCE(NEW.hunting, 1),
        COALESCE(NEW.smithing, 1),
        COALESCE(NEW.cooking, 1),
        COALESCE(NEW.alchemy, 1),
        COALESCE(NEW.construction, 1)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate triggers
CREATE TRIGGER trigger_update_nft_total_level
    BEFORE INSERT OR UPDATE ON nfts
    FOR EACH ROW
    EXECUTE FUNCTION update_nft_total_level();

-- ============================================================================
-- STEP 6: Update existing records to fix total_level
-- ============================================================================
UPDATE nfts SET total_level = calculate_total_level(
    COALESCE(attack, 1),
    COALESCE(strength, 1),
    COALESCE(defense, 1),
    COALESCE(magic, 1),
    COALESCE(projectiles, 1),
    COALESCE(vitality, 1),
    COALESCE(crafting, 1),
    COALESCE(luck, 1),
    COALESCE(mining, 1),
    COALESCE(woodcutting, 1),
    COALESCE(fishing, 1),
    COALESCE(farming, 1),
    COALESCE(hunting, 1),
    COALESCE(smithing, 1),
    COALESCE(cooking, 1),
    COALESCE(alchemy, 1),
    COALESCE(construction, 1)
);

-- ============================================================================
-- Migration Complete
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE '✅ All columns renamed to full names (attack, strength, etc.)';
    RAISE NOTICE '✅ All _level columns renamed to skill names';
    RAISE NOTICE '✅ Trigger function updated to use correct column names';
    RAISE NOTICE '✅ All existing records updated';
END $$;

