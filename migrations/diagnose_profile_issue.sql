-- ============================================
-- Complete Profile Creation Diagnostic
-- Run each section separately to diagnose the issue
-- ============================================

-- 1. Check if trigger exists
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgenabled as enabled,
    pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgname = 'on_auth_user_created'
AND tgrelid = 'auth.users'::regclass;

-- 2. Check function definition
SELECT 
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'handle_new_user'
AND n.nspname = 'public';

-- 3. Check recent auth.users vs profiles
SELECT 
    au.id as auth_user_id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'username', au.raw_app_meta_data->>'username') as username_from_metadata,
    au.created_at as auth_created_at,
    p.id as profile_id,
    p.username as profile_username,
    p.user_type,
    p.created_at as profile_created_at,
    CASE 
        WHEN p.id IS NULL THEN 'MISSING PROFILE'
        WHEN p.username IS NULL OR p.username = '' THEN 'PROFILE EXISTS BUT NO USERNAME'
        ELSE 'OK'
    END as status
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
ORDER BY au.created_at DESC
LIMIT 10;

-- 4. Check RLS policies on profiles table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'profiles';

-- 5. Test if we can manually insert into profiles (check permissions)
-- This will help identify if it's a permissions issue
-- Note: Only run this if you have a test user_id ready
-- INSERT INTO public.profiles (id, username, user_type) 
-- VALUES ('test-user-id-here', 'test_user', 'WEB2')
-- ON CONFLICT (id) DO NOTHING;

