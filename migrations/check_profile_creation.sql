-- ============================================
-- Verify Profile Creation Issue
-- Run this to check if profiles are being created
-- ============================================

-- Check if trigger exists
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgenabled as enabled,
    pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgname = 'on_auth_user_created'
AND tgrelid = 'auth.users'::regclass;

-- Check recent auth.users entries
SELECT 
    id,
    email,
    created_at,
    raw_user_meta_data->>'username' as username_from_metadata,
    raw_app_meta_data->>'username' as username_from_app_metadata
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;

-- Check if profiles exist for recent users
SELECT 
    au.id as auth_user_id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'username', au.raw_app_meta_data->>'username') as username_from_metadata,
    au.created_at as auth_created_at,
    p.id as profile_id,
    p.username as profile_username,
    p.user_type,
    p.created_at as profile_created_at
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
ORDER BY au.created_at DESC
LIMIT 10;

-- Check if handle_new_user function exists
SELECT 
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'handle_new_user'
AND n.nspname = 'public';

