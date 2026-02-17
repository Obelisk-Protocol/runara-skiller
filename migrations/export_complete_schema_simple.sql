-- ============================================
-- SIMPLIFIED COMPLETE EXPORT - ALL IN ONE QUERY
-- Copy the output from this query to get your complete schema
-- ============================================

WITH 
-- Tables with columns
tables_with_cols AS (
    SELECT 
        t.table_name,
        string_agg(
            '    ' || c.column_name || ' ' ||
            CASE 
                WHEN c.data_type = 'character varying' THEN 'VARCHAR' || COALESCE('(' || c.character_maximum_length::TEXT || ')', '')
                WHEN c.data_type = 'ARRAY' THEN COALESCE(c.udt_name, 'TEXT') || '[]'
                WHEN c.udt_name = 'int4' THEN 'INTEGER'
                WHEN c.udt_name = 'int8' THEN 'BIGINT'
                WHEN c.udt_name = 'bool' THEN 'BOOLEAN'
                WHEN c.udt_name = 'uuid' THEN 'UUID'
                WHEN c.udt_name = 'jsonb' THEN 'JSONB'
                WHEN c.udt_name = 'numeric' THEN 'NUMERIC'
                WHEN c.udt_name = 'real' THEN 'REAL'
                WHEN c.data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
                WHEN c.data_type = 'timestamp with time zone' THEN 'TIMESTAMPTZ'
                ELSE UPPER(COALESCE(c.udt_name, c.data_type, 'TEXT'))
            END ||
            CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
            CASE WHEN c.column_default IS NOT NULL THEN ' DEFAULT ' || c.column_default ELSE '' END,
            ',' || E'\n' ORDER BY c.ordinal_position
        ) as column_defs
    FROM information_schema.tables t
    LEFT JOIN information_schema.columns c 
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    GROUP BY t.table_name
),
-- Primary Keys
primary_keys AS (
    SELECT 
        tc.table_name,
        'ALTER TABLE ' || tc.table_name || ' ADD PRIMARY KEY (' || 
        string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) || ');' as pk_def
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name
),
-- Foreign Keys
foreign_keys AS (
    SELECT
        tc.table_name,
        'ALTER TABLE ' || tc.table_name ||
        ' ADD CONSTRAINT ' || tc.constraint_name ||
        ' FOREIGN KEY (' || string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) || ')' ||
        ' REFERENCES ' || ccu.table_name ||
        ' (' || string_agg(ccu.column_name, ', ' ORDER BY kcu.ordinal_position) || ')' ||
        CASE WHEN rc.update_rule != 'NO ACTION' THEN ' ON UPDATE ' || rc.update_rule ELSE '' END ||
        CASE WHEN rc.delete_rule != 'NO ACTION' THEN ' ON DELETE ' || rc.delete_rule ELSE '' END ||
        ';' as fk_def
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name, ccu.table_name, rc.update_rule, rc.delete_rule
)
SELECT 
    '-- ============================================' || E'\n' ||
    '-- COMPLETE DATABASE SCHEMA EXPORT' || E'\n' ||
    '-- Generated: ' || NOW()::TEXT || E'\n' ||
    '-- Database: ' || current_database() || E'\n' ||
    '-- ============================================' || E'\n\n' ||
    
    '-- ============================================' || E'\n' ||
    '-- TABLES' || E'\n' ||
    '-- ============================================' || E'\n\n' ||
    
    (SELECT string_agg(
        '-- Table: ' || twc.table_name || E'\n' ||
        'CREATE TABLE IF NOT EXISTS ' || twc.table_name || ' (' || E'\n' ||
        twc.column_defs || E'\n' ||
        ');' || E'\n\n' ||
        COALESCE(pk.pk_def || E'\n\n', ''),
        E'\n'
        ORDER BY twc.table_name
    )
    FROM tables_with_cols twc
    LEFT JOIN primary_keys pk ON twc.table_name = pk.table_name) ||
    
    COALESCE(
        E'\n-- ============================================' || E'\n' ||
        '-- FOREIGN KEYS' || E'\n' ||
        '-- ============================================' || E'\n\n' ||
        (SELECT string_agg(fk.fk_def, E'\n' ORDER BY fk.table_name)
         FROM foreign_keys fk) || E'\n\n',
        ''
    ) ||
    
    '-- ============================================' || E'\n' ||
    '-- INDEXES' || E'\n' ||
    '-- ============================================' || E'\n\n' ||
    COALESCE(
        (SELECT string_agg(indexdef || ';', E'\n' ORDER BY tablename, indexname)
         FROM pg_indexes WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey') || E'\n\n',
        ''
    ) ||
    
    '-- ============================================' || E'\n' ||
    '-- TRIGGERS' || E'\n' ||
    '-- ============================================' || E'\n\n' ||
    COALESCE(
        (SELECT string_agg(
            'CREATE TRIGGER ' || trigger_name ||
            ' ' || action_timing || ' ' || event_manipulation ||
            ' ON ' || event_object_table ||
            ' FOR EACH ' || action_orientation ||
            ' EXECUTE FUNCTION ' || action_statement || ';',
            E'\n' ORDER BY event_object_table, trigger_name
        )
        FROM information_schema.triggers WHERE trigger_schema = 'public') || E'\n\n',
        ''
    ) ||
    
    '-- ============================================' || E'\n' ||
    '-- FUNCTIONS' || E'\n' ||
    '-- ============================================' || E'\n\n' ||
    COALESCE(
        (SELECT string_agg(
            '-- Function: ' || p.proname || E'\n' ||
            pg_get_functiondef(p.oid) || ';' || E'\n',
            E'\n' ORDER BY p.proname
        )
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public') || E'\n\n',
        ''
    ) ||
    
    '-- ============================================' || E'\n' ||
    '-- RLS POLICIES' || E'\n' ||
    '-- ============================================' || E'\n\n' ||
    COALESCE(
        (SELECT string_agg(
            'CREATE POLICY ' || policyname ||
            ' ON ' || tablename ||
            ' FOR ' || cmd ||
            CASE WHEN permissive = 'RESTRICTIVE' THEN ' AS RESTRICTIVE' ELSE '' END ||
            CASE WHEN roles_list IS NOT NULL AND roles_list != '' THEN ' TO ' || roles_list ELSE '' END ||
            CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END ||
            CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END ||
            ';',
            E'\n' ORDER BY tablename, policyname
        )
        FROM (
            SELECT 
                tablename,
                policyname,
                cmd,
                permissive,
                string_agg(roles::TEXT, ', ') as roles_list,
                qual,
                with_check
            FROM pg_policies 
            WHERE schemaname = 'public'
            GROUP BY tablename, policyname, cmd, permissive, qual, with_check
        ) policies) || E'\n\n',
        ''
    ) ||
    
    '-- ============================================' || E'\n' ||
    '-- VIEWS' || E'\n' ||
    '-- ============================================' || E'\n\n' ||
    COALESCE(
        (SELECT string_agg(
            'CREATE VIEW ' || table_name ||
            ' AS ' || view_definition || ';',
            E'\n\n' ORDER BY table_name
        )
        FROM information_schema.views WHERE table_schema = 'public') || E'\n\n',
        ''
    ) ||
    
    '-- ============================================' || E'\n' ||
    '-- SEQUENCES' || E'\n' ||
    '-- ============================================' || E'\n\n' ||
    COALESCE(
        (SELECT string_agg(
            'CREATE SEQUENCE ' || sequence_name ||
            CASE WHEN start_value IS NOT NULL THEN ' START WITH ' || start_value ELSE '' END ||
            CASE WHEN increment IS NOT NULL THEN ' INCREMENT BY ' || increment ELSE '' END ||
            CASE WHEN minimum_value IS NOT NULL THEN ' MINVALUE ' || minimum_value ELSE '' END ||
            CASE WHEN maximum_value IS NOT NULL THEN ' MAXVALUE ' || maximum_value ELSE '' END ||
            CASE WHEN cycle_option = 'YES' THEN ' CYCLE' ELSE ' NO CYCLE' END ||
            ';',
            E'\n' ORDER BY sequence_name
        )
        FROM information_schema.sequences WHERE sequence_schema = 'public') || E'\n',
        ''
    );

