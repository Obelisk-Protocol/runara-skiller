-- ============================================
-- COMPLETE DATABASE SCHEMA EXPORT
-- For Supabase PostgreSQL Database
-- Run these queries in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. ALL TABLES WITH COLUMNS AND CONSTRAINTS
-- ============================================
SELECT 
    t.table_schema,
    t.table_name,
    t.table_type,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    c.udt_name,
    -- Primary keys
    CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END as is_primary_key,
    -- Foreign keys
    fk.foreign_table_schema,
    fk.foreign_table_name,
    fk.foreign_column_name
FROM 
    information_schema.tables t
    LEFT JOIN information_schema.columns c ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    LEFT JOIN (
        SELECT ku.table_schema, ku.table_name, ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku 
            ON tc.constraint_name = ku.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
    ) pk ON c.table_schema = pk.table_schema 
        AND c.table_name = pk.table_name 
        AND c.column_name = pk.column_name
    LEFT JOIN (
        SELECT
            tc.table_schema,
            tc.table_name,
            kcu.column_name,
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
    ) fk ON c.table_schema = fk.table_schema 
        AND c.table_name = fk.table_name 
        AND c.column_name = fk.column_name
WHERE 
    t.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND t.table_type = 'BASE TABLE'
ORDER BY 
    t.table_schema, t.table_name, c.ordinal_position;

-- ============================================
-- 2. ALL INDEXES
-- ============================================
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM 
    pg_indexes
WHERE 
    schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY 
    schemaname, tablename, indexname;

-- ============================================
-- 3. ALL TRIGGERS
-- ============================================
SELECT 
    trigger_schema,
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing,
    action_orientation
FROM 
    information_schema.triggers
WHERE 
    trigger_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY 
    trigger_schema, event_object_table, trigger_name;

-- ============================================
-- 4. ALL FUNCTIONS/PROCEDURES
-- ============================================
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type,
    pg_get_functiondef(p.oid) as function_definition,
    CASE p.prokind
        WHEN 'f' THEN 'function'
        WHEN 'p' THEN 'procedure'
        WHEN 'a' THEN 'aggregate'
        WHEN 'w' THEN 'window'
    END as function_type
FROM 
    pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE 
    n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY 
    n.nspname, p.proname;

-- ============================================
-- 5. ALL VIEWS
-- ============================================
SELECT 
    table_schema,
    table_name,
    view_definition
FROM 
    information_schema.views
WHERE 
    table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY 
    table_schema, table_name;

-- ============================================
-- 6. ALL SEQUENCES
-- ============================================
SELECT 
    sequence_schema,
    sequence_name,
    data_type,
    numeric_precision,
    numeric_precision_radix,
    numeric_scale,
    start_value,
    minimum_value,
    maximum_value,
    increment,
    cycle_option
FROM 
    information_schema.sequences
WHERE 
    sequence_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY 
    sequence_schema, sequence_name;

-- ============================================
-- 7. ALL RLS POLICIES (Row Level Security)
-- ============================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM 
    pg_policies
WHERE 
    schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY 
    schemaname, tablename, policyname;

-- ============================================
-- 8. ALL CHECK CONSTRAINTS
-- ============================================
SELECT 
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM 
    information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc 
        ON tc.constraint_name = cc.constraint_name
WHERE 
    tc.constraint_type = 'CHECK'
    AND tc.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY 
    tc.table_schema, tc.table_name, tc.constraint_name;

-- ============================================
-- 9. ALL UNIQUE CONSTRAINTS
-- ============================================
SELECT 
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    kcu.column_name
FROM 
    information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
WHERE 
    tc.constraint_type = 'UNIQUE'
    AND tc.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY 
    tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- ============================================
-- 10. ALL CUSTOM TYPES/ENUMS
-- ============================================
SELECT 
    n.nspname as schema_name,
    t.typname as type_name,
    CASE t.typtype
        WHEN 'e' THEN 'enum'
        WHEN 'c' THEN 'composite'
        WHEN 'd' THEN 'domain'
        WHEN 'b' THEN 'base'
    END as type_type,
    pg_get_type_definition(t.oid) as type_definition
FROM 
    pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE 
    n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND t.typtype IN ('e', 'c', 'd')
ORDER BY 
    n.nspname, t.typname;

-- ============================================
-- 11. ALL FOREIGN KEY CONSTRAINTS
-- ============================================
SELECT
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.update_rule,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
WHERE 
    tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY 
    tc.table_schema, tc.table_name, tc.constraint_name;

-- ============================================
-- 12. COMPLETE EXPORT AS CREATE STATEMENTS
-- (This generates SQL you can run to recreate the schema)
-- ============================================

-- Get CREATE TABLE statements
SELECT 
    'CREATE TABLE ' || schemaname || '.' || tablename || ' (' || E'\n' ||
    string_agg(
        column_name || ' ' || 
        data_type || 
        CASE WHEN character_maximum_length IS NOT NULL 
            THEN '(' || character_maximum_length || ')' 
            ELSE '' 
        END ||
        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
        CASE WHEN column_default IS NOT NULL 
            THEN ' DEFAULT ' || column_default 
            ELSE '' 
        END,
        ',' || E'\n'
        ORDER BY ordinal_position
    ) || E'\n);'
FROM 
    information_schema.columns c
    JOIN information_schema.tables t 
        ON c.table_schema = t.table_schema 
        AND c.table_name = t.table_name
WHERE 
    t.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND t.table_type = 'BASE TABLE'
GROUP BY 
    schemaname, tablename
ORDER BY 
    schemaname, tablename;

-- ============================================
-- EXPORT TO FILE (Alternative - Run in psql)
-- ============================================
-- To export everything to a file, use pg_dump:
--
-- pg_dump -h <host> -U <user> -d <database> \
--   --schema-only \
--   --no-owner \
--   --no-privileges \
--   > schema_export.sql
--
-- For Supabase, you can get connection string from:
-- Project Settings > Database > Connection String

