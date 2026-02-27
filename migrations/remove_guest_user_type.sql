-- Migration: Remove GUEST from user_type and enforce username constraints
-- Run this migration to update the database schema

-- Step 1: Update any existing GUEST users to WEB2 FIRST (before changing constraint)
UPDATE profiles SET user_type = 'WEB2' WHERE user_type = 'GUEST';

-- Step 2: Drop the old constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;

-- Step 3: Add new constraint without GUEST option
ALTER TABLE profiles ADD CONSTRAINT profiles_user_type_check 
  CHECK (user_type = ANY (ARRAY['WEB2'::text, 'WEB3'::text]));

-- Step 4: Add unique constraint on username (allows NULL for existing records)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique 
  ON profiles(username) 
  WHERE username IS NOT NULL;

-- Step 5: Add index for fast username lookups
CREATE INDEX IF NOT EXISTS profiles_username_idx ON profiles(username);

-- Note: We don't make username NOT NULL yet to avoid breaking existing records
-- New accounts will be required to have username via application logic

