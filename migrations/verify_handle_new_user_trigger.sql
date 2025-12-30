-- ============================================
-- Migration: Verify and Create handle_new_user Trigger
-- Date: 2025-11-04
-- Description: Ensures trigger exists to automatically create profiles when users sign up
-- ============================================

-- Check if trigger already exists
DO $$
BEGIN
    -- Check if the trigger exists
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_trigger 
        WHERE tgname = 'on_auth_user_created'
        AND tgrelid = 'auth.users'::regclass
    ) THEN
        -- Create the trigger if it doesn't exist
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_new_user();
        
        RAISE NOTICE 'Trigger on_auth_user_created created successfully';
    ELSE
        RAISE NOTICE 'Trigger on_auth_user_created already exists';
    END IF;
END $$;

-- Verify the trigger is set up correctly
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgenabled as enabled,
    pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgname = 'on_auth_user_created'
AND tgrelid = 'auth.users'::regclass;

