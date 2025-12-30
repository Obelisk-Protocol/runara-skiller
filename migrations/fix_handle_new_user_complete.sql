-- ============================================
-- Migration: Improve handle_new_user Function and Ensure Trigger Exists
-- Date: 2025-11-04
-- Description: Updates the function to extract username from metadata and ensures trigger is set up
-- ============================================

-- First, update the function to extract username from metadata if available
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_username TEXT;
BEGIN
    -- Extract username from metadata (check both raw_user_meta_data and raw_app_meta_data)
    v_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        NEW.raw_app_meta_data->>'username'
    );
    
    -- Insert profile with username if available
    INSERT INTO public.profiles (id, username, user_type)
    VALUES (
        NEW.id,
        v_username,
        'WEB2'
    )
    ON CONFLICT (id) DO NOTHING; -- Prevent duplicate insert errors
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the user creation
        -- This ensures auth.users insert succeeds even if profile creation fails
        RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

-- Ensure trigger exists (drop and recreate to be safe)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Verify trigger was created
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgenabled as enabled,
    pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgname = 'on_auth_user_created'
AND tgrelid = 'auth.users'::regclass;

-- Verify function exists
SELECT 
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'handle_new_user'
AND n.nspname = 'public';

