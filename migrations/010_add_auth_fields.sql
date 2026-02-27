-- Add authentication fields to users table
-- This migration adds password_hash and username fields for custom auth

-- Ensure users table exists first
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Add auth fields
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS password_hash text;

-- Add unique constraint on username (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;

-- Create index on username for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username) WHERE username IS NOT NULL;

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email) WHERE email IS NOT NULL;
