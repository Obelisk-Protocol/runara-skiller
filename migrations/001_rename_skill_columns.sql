-- Migration: Rename _level columns to skill names and add missing columns
-- Run this in Supabase SQL Editor

-- Rename old abbreviated columns to full names (if they exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'att') THEN
    ALTER TABLE nfts RENAME COLUMN att TO attack;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'str') THEN
    ALTER TABLE nfts RENAME COLUMN str TO strength;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'def') THEN
    ALTER TABLE nfts RENAME COLUMN def TO defense;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'mag') THEN
    ALTER TABLE nfts RENAME COLUMN mag TO magic;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'pro') THEN
    ALTER TABLE nfts RENAME COLUMN pro TO projectiles;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'vit') THEN
    ALTER TABLE nfts RENAME COLUMN vit TO vitality;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'cra') THEN
    ALTER TABLE nfts RENAME COLUMN cra TO crafting;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'luc') THEN
    ALTER TABLE nfts RENAME COLUMN luc TO luck;
  END IF;
END $$;

-- Rename _level columns to skill names and add missing columns
DO $$
BEGIN
  -- Gathering Skills
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'mining') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'mining_level') THEN
      ALTER TABLE nfts RENAME COLUMN mining_level TO mining;
    ELSE
      ALTER TABLE nfts ADD COLUMN mining int NOT NULL DEFAULT 1;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'woodcutting') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'woodcutting_level') THEN
      ALTER TABLE nfts RENAME COLUMN woodcutting_level TO woodcutting;
    ELSE
      ALTER TABLE nfts ADD COLUMN woodcutting int NOT NULL DEFAULT 1;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'fishing') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'fishing_level') THEN
      ALTER TABLE nfts RENAME COLUMN fishing_level TO fishing;
    ELSE
      ALTER TABLE nfts ADD COLUMN fishing int NOT NULL DEFAULT 1;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'farming') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'farming_level') THEN
      ALTER TABLE nfts RENAME COLUMN farming_level TO farming;
    ELSE
      ALTER TABLE nfts ADD COLUMN farming int NOT NULL DEFAULT 1;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'hunting') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'hunting_level') THEN
      ALTER TABLE nfts RENAME COLUMN hunting_level TO hunting;
    ELSE
      ALTER TABLE nfts ADD COLUMN hunting int NOT NULL DEFAULT 1;
    END IF;
  END IF;
  
  -- Crafting Skills
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'smithing') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'smithing_level') THEN
      ALTER TABLE nfts RENAME COLUMN smithing_level TO smithing;
    ELSE
      ALTER TABLE nfts ADD COLUMN smithing int NOT NULL DEFAULT 1;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'cooking') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'cooking_level') THEN
      ALTER TABLE nfts RENAME COLUMN cooking_level TO cooking;
    ELSE
      ALTER TABLE nfts ADD COLUMN cooking int NOT NULL DEFAULT 1;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'alchemy') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'alchemy_level') THEN
      ALTER TABLE nfts RENAME COLUMN alchemy_level TO alchemy;
    ELSE
      ALTER TABLE nfts ADD COLUMN alchemy int NOT NULL DEFAULT 1;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'construction') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nfts' AND column_name = 'construction_level') THEN
      ALTER TABLE nfts RENAME COLUMN construction_level TO construction;
    ELSE
      ALTER TABLE nfts ADD COLUMN construction int NOT NULL DEFAULT 1;
    END IF;
  END IF;
END $$;

