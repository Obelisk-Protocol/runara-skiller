-- ============================================
-- SIMPLIFIED ONE-QUERY SCHEMA EXPORT
-- Run this single query to get everything at once
-- ============================================

WITH 
-- Tables
tables AS (
    SELECT 
        'TABLE' as object_type,
        t.table_schema as schema_name,
        t.table_name as object_name,
        jsonb_build_object(
            'columns', jsonb_agg(
                jsonb_build_object(
                    'name', c.column_name,
                    'type', c.data_type,
                    'nullable', c.is_nullable = 'YES',
                    'default', c.column_default
                ) ORDER BY c.ordinal_position
            )
        ) as definition
    FROM information_schema.tables t
    LEFT JOIN information_schema.columns c 
        ON t.table_schema = c.table_schema 
        AND t.table_name = c.table_name
    WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        AND t.table_type = 'BASE TABLE'
    GROUP BY t.table_schema, t.table_name
),
-- Functions
functions AS (
    SELECT 
        'FUNCTION' as object_type,
        n.nspname as schema_name,
        p.proname as object_name,
        jsonb_build_object(
            'arguments', pg_get_function_arguments(p.oid),
            'return_type', pg_get_function_result(p.oid),
            'definition', pg_get_functiondef(p.oid)
        ) as definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
),
-- Triggers
triggers AS (
    SELECT 
        'TRIGGER' as object_type,
        trigger_schema as schema_name,
        trigger_name as object_name,
        jsonb_build_object(
            'table', event_object_table,
            'timing', action_timing,
            'event', event_manipulation,
            'definition', action_statement
        ) as definition
    FROM information_schema.triggers
    WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
),
-- Views
views AS (
    SELECT 
        'VIEW' as object_type,
        table_schema as schema_name,
        table_name as object_name,
        jsonb_build_object(
            'definition', view_definition
        ) as definition
    FROM information_schema.views
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
),
-- RLS Policies
policies AS (
    SELECT 
        'POLICY' as object_type,
        schemaname as schema_name,
        policyname as object_name,
        jsonb_build_object(
            'table', tablename,
            'permissive', permissive,
            'roles', roles,
            'command', cmd,
            'using', qual,
            'with_check', with_check
        ) as definition
    FROM pg_policies
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
)
-- Combine all
SELECT 
    object_type,
    schema_name,
    object_name,
    definition
FROM tables
UNION ALL
SELECT object_type, schema_name, object_name, definition FROM functions
UNION ALL
SELECT object_type, schema_name, object_name, definition FROM triggers
UNION ALL
SELECT object_type, schema_name, object_name, definition FROM views
UNION ALL
SELECT object_type, schema_name, object_name, definition FROM policies
ORDER BY object_type, schema_name, object_name;

