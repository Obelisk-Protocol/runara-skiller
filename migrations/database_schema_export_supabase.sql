-- ============================================
-- SUPABASE-SPECIFIC SCHEMA EXPORT
-- Optimized for Supabase PostgreSQL
-- Exports: Tables, RLS Policies, Functions, Triggers
-- ============================================

-- ============================================
-- OPTION 1: Complete SQL Dump (RECOMMENDED)
-- ============================================
-- Use Supabase Dashboard or pg_dump:
--
-- From Supabase Dashboard:
-- 1. Go to Database > Extensions
-- 2. Or use SQL Editor and run queries below
--
-- From Command Line:
-- pg_dump -h db.wejhmpfwttgcfmikznyp.supabase.co \
--   -p 5432 \
--   -U postgres \
--   -d postgres \
--   --schema-only \
--   --no-owner \
--   --no-privileges \
--   -f schema_export.sql

-- ============================================
-- OPTION 2: Schema-Only Export (No Data)
-- ============================================
SELECT 
    '-- Database Schema Export' as export_type,
    current_database() as database_name,
    current_timestamp as export_time;

-- All tables with full structure
SELECT 
    'TABLE: ' || schemaname || '.' || tablename as object_info,
    'CREATE TABLE ' || schemaname || '.' || tablename || ' (' || E'\n' ||
    string_agg(
        '  ' || column_name || ' ' || 
        CASE 
            WHEN udt_name = 'varchar' THEN 'varchar(' || COALESCE(character_maximum_length::text, '255') || ')'
            WHEN udt_name = 'text' THEN 'text'
            WHEN udt_name = 'int4' THEN 'integer'
            WHEN udt_name = 'int8' THEN 'bigint'
            WHEN udt_name = 'bool' THEN 'boolean'
            WHEN udt_name = 'timestamp' THEN 'timestamp'
            WHEN udt_name = 'timestamptz' THEN 'timestamptz'
            WHEN udt_name = 'uuid' THEN 'uuid'
            WHEN udt_name = 'jsonb' THEN 'jsonb'
            ELSE udt_name
        END ||
        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
        CASE WHEN column_default IS NOT NULL 
            THEN ' DEFAULT ' || column_default 
            ELSE '' 
        END,
        ',' || E'\n'
        ORDER BY ordinal_position
    ) || E'\n);' as create_statement
FROM 
    information_schema.columns c
    JOIN information_schema.tables t 
        ON c.table_schema = t.table_schema 
        AND c.table_name = t.table_name
WHERE 
    t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
GROUP BY 
    schemaname, tablename
ORDER BY 
    tablename;

-- All functions
SELECT 
    'FUNCTION: ' || n.nspname || '.' || p.proname as object_info,
    pg_get_functiondef(p.oid) as create_statement
FROM 
    pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE 
    n.nspname = 'public'
ORDER BY 
    p.proname;

-- All triggers
SELECT 
    'TRIGGER: ' || trigger_schema || '.' || trigger_name || ' ON ' || event_object_table as object_info,
    'CREATE TRIGGER ' || trigger_name || 
    ' ' || action_timing || ' ' || event_manipulation ||
    ' ON ' || event_object_table ||
    ' FOR EACH ' || action_orientation ||
    ' EXECUTE FUNCTION ' || action_statement || ';' as create_statement
FROM 
    information_schema.triggers
WHERE 
    trigger_schema = 'public'
ORDER BY 
    event_object_table, trigger_name;

-- All RLS policies
SELECT 
    'POLICY: ' || schemaname || '.' || tablename || '.' || policyname as object_info,
    'CREATE POLICY ' || policyname ||
    ' ON ' || schemaname || '.' || tablename ||
    ' FOR ' || cmd ||
    ' USING (' || COALESCE(qual, 'true') || ')' ||
    CASE WHEN with_check IS NOT NULL 
        THEN ' WITH CHECK (' || with_check || ')' 
        ELSE '' 
    END || ';' as create_statement
FROM 
    pg_policies
WHERE 
    schemaname = 'public'
ORDER BY 
    tablename, policyname;

-- All indexes
SELECT 
    'INDEX: ' || schemaname || '.' || tablename || '.' || indexname as object_info,
    indexdef || ';' as create_statement
FROM 
    pg_indexes
WHERE 
    schemaname = 'public'
ORDER BY 
    tablename, indexname;

-- ============================================
-- OPTION 3: Export to JSON (For Documentation)
-- ============================================
SELECT 
    jsonb_build_object(
        'database', current_database(),
        'exported_at', current_timestamp,
        'tables', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'schema', table_schema,
                    'name', table_name,
                    'columns', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'name', column_name,
                                'type', data_type,
                                'nullable', is_nullable = 'YES',
                                'default', column_default
                            ) ORDER BY ordinal_position
                        )
                        FROM information_schema.columns c2
                        WHERE c2.table_schema = t.table_schema
                            AND c2.table_name = t.table_name
                    )
                )
            )
            FROM information_schema.tables t
            WHERE t.table_schema = 'public'
                AND t.table_type = 'BASE TABLE'
        ),
        'functions', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'schema', n.nspname,
                    'name', p.proname,
                    'arguments', pg_get_function_arguments(p.oid),
                    'return_type', pg_get_function_result(p.oid)
                )
            )
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
        ),
        'triggers', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'schema', trigger_schema,
                    'name', trigger_name,
                    'table', event_object_table,
                    'timing', action_timing,
                    'event', event_manipulation
                )
            )
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
        ),
        'policies', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'schema', schemaname,
                    'table', tablename,
                    'name', policyname,
                    'command', cmd,
                    'permissive', permissive
                )
            )
            FROM pg_policies
            WHERE schemaname = 'public'
        )
    ) as complete_schema_export;

