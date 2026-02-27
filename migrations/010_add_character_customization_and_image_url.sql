-- Migration: Add character customization and image URL support
-- This migration adds support for storing character customization and generated image URLs

-- Add character_customization column to profiles table (JSONB for flexibility)
-- This will store outfit, hair, eyes, and future customization options
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS character_customization JSONB DEFAULT '{"outfit": "default"}'::jsonb;

-- Add index for faster queries on customization
CREATE INDEX IF NOT EXISTS idx_profiles_character_customization 
ON profiles USING gin (character_customization);

-- Add character_image_url column to nfts table
-- This stores the URL of the generated character portrait image
ALTER TABLE nfts 
ADD COLUMN IF NOT EXISTS character_image_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_nfts_character_image_url 
ON nfts (character_image_url) 
WHERE character_image_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.character_customization IS 'Character customization settings (outfit, hair, eyes, etc.) stored as JSONB';
COMMENT ON COLUMN nfts.character_image_url IS 'URL of the generated character portrait image (800x800px PNG)';

