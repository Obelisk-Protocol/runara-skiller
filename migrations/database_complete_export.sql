-- ============================================
-- COMPLETE DATABASE SCHEMA EXPORT
-- Generated from db.json schema export
-- Includes: Tables, Indexes, Triggers, Functions, RLS Policies
-- ============================================

-- ============================================
-- PART 1: RUN THIS QUERY TO GET CREATE TABLE STATEMENTS
-- ============================================
SELECT 
    'CREATE TABLE ' || schemaname || '.' || tablename || ' (' || E'\n' ||
    string_agg(
        '  ' || column_name || ' ' || 
        CASE 
            WHEN data_type = 'character varying' THEN 'varchar(' || COALESCE(character_maximum_length::text, '255') || ')'
            WHEN data_type = 'ARRAY' THEN udt_name || '[]'
            WHEN udt_name = 'int4' THEN 'integer'
            WHEN udt_name = 'int8' THEN 'bigint'
            WHEN udt_name = 'bool' THEN 'boolean'
            WHEN udt_name = 'timestamp' THEN 'timestamp'
            WHEN udt_name = 'timestamptz' THEN 'timestamp with time zone'
            WHEN udt_name = 'uuid' THEN 'uuid'
            WHEN udt_name = 'jsonb' THEN 'jsonb'
            WHEN udt_name = 'text' THEN 'text'
            WHEN udt_name = 'numeric' THEN 'numeric'
            WHEN udt_name = 'real' THEN 'real'
            ELSE COALESCE(udt_name, data_type)
        END ||
        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
        CASE WHEN column_default IS NOT NULL 
            THEN ' DEFAULT ' || column_default 
            ELSE '' 
        END,
        ',' || E'\n'
        ORDER BY ordinal_position
    ) || E'\n);' as create_table_statement
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

-- ============================================
-- PART 2: GET ALL INDEXES
-- ============================================
SELECT 
    indexdef || ';' as create_index_statement
FROM 
    pg_indexes
WHERE 
    schemaname = 'public'
ORDER BY 
    tablename, indexname;

-- ============================================
-- PART 3: GET ALL FOREIGN KEY CONSTRAINTS
-- ============================================
SELECT
    'ALTER TABLE ' || tc.table_schema || '.' || tc.table_name ||
    ' ADD CONSTRAINT ' || tc.constraint_name ||
    ' FOREIGN KEY (' || string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) || ')' ||
    ' REFERENCES ' || ccu.table_schema || '.' || ccu.table_name ||
    ' (' || string_agg(ccu.column_name, ', ' ORDER BY kcu.ordinal_position) || ')' ||
    CASE WHEN rc.update_rule != 'NO ACTION' THEN ' ON UPDATE ' || rc.update_rule ELSE '' END ||
    CASE WHEN rc.delete_rule != 'NO ACTION' THEN ' ON DELETE ' || rc.delete_rule ELSE '' END ||
    ';' as create_foreign_key_statement
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
    AND tc.table_schema = 'public'
GROUP BY 
    tc.table_schema, tc.table_name, tc.constraint_name, 
    ccu.table_schema, ccu.table_name, rc.update_rule, rc.delete_rule
ORDER BY 
    tc.table_name, tc.constraint_name;

-- ============================================
-- PART 4: GET ALL TRIGGERS
-- ============================================
SELECT 
    'CREATE TRIGGER ' || trigger_name || 
    ' ' || action_timing || ' ' || event_manipulation ||
    ' ON ' || event_object_table ||
    ' FOR EACH ' || action_orientation ||
    ' EXECUTE FUNCTION ' || action_statement || ';' as create_trigger_statement
FROM 
    information_schema.triggers
WHERE 
    trigger_schema = 'public'
ORDER BY 
    event_object_table, trigger_name;

-- ============================================
-- PART 5: GET ALL FUNCTIONS
-- ============================================
SELECT 
    pg_get_functiondef(oid) as create_function_statement
FROM 
    pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE 
    n.nspname = 'public'
ORDER BY 
    p.proname;

-- ============================================
-- PART 6: GET ALL RLS POLICIES
-- ============================================
SELECT 
    'CREATE POLICY ' || policyname ||
    ' ON ' || schemaname || '.' || tablename ||
    ' FOR ' || cmd ||
    CASE WHEN permissive = 'PERMISSIVE' THEN '' ELSE ' AS ' || permissive END ||
    ' TO ' || COALESCE(string_agg(roles::text, ', '), 'public') ||
    CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END ||
    CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END ||
    ';' as create_policy_statement
FROM 
    pg_policies
WHERE 
    schemaname = 'public'
GROUP BY 
    schemaname, tablename, policyname, cmd, permissive, qual, with_check
ORDER BY 
    tablename, policyname;

-- ============================================
-- PART 7: GET ALL CHECK CONSTRAINTS
-- ============================================
SELECT 
    'ALTER TABLE ' || tc.table_schema || '.' || tc.table_name ||
    ' ADD CONSTRAINT ' || tc.constraint_name ||
    ' CHECK (' || cc.check_clause || ');' as create_check_constraint_statement
FROM 
    information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc 
        ON tc.constraint_name = cc.constraint_name
WHERE 
    tc.constraint_type = 'CHECK'
    AND tc.table_schema = 'public'
ORDER BY 
    tc.table_name, tc.constraint_name;

-- ============================================
-- PART 8: GET ALL UNIQUE CONSTRAINTS
-- ============================================
SELECT 
    'ALTER TABLE ' || tc.table_schema || '.' || tc.table_name ||
    ' ADD CONSTRAINT ' || tc.constraint_name ||
    ' UNIQUE (' || string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) || ');' as create_unique_constraint_statement
FROM 
    information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
WHERE 
    tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
GROUP BY 
    tc.table_schema, tc.table_name, tc.constraint_name
ORDER BY 
    tc.table_name, tc.constraint_name;

-- ============================================
-- PART 9: GET ALL SEQUENCES
-- ============================================
SELECT 
    'CREATE SEQUENCE ' || sequence_schema || '.' || sequence_name ||
    CASE WHEN start_value IS NOT NULL THEN ' START WITH ' || start_value ELSE '' END ||
    CASE WHEN increment IS NOT NULL THEN ' INCREMENT BY ' || increment ELSE '' END ||
    CASE WHEN minimum_value IS NOT NULL THEN ' MINVALUE ' || minimum_value ELSE '' END ||
    CASE WHEN maximum_value IS NOT NULL THEN ' MAXVALUE ' || maximum_value ELSE '' END ||
    CASE WHEN cycle_option = 'YES' THEN ' CYCLE' ELSE ' NO CYCLE' END ||
    ';' as create_sequence_statement
FROM 
    information_schema.sequences
WHERE 
    sequence_schema = 'public'
ORDER BY 
    sequence_name;

-- ============================================
-- PART 10: GET ALL VIEWS
-- ============================================
SELECT 
    'CREATE VIEW ' || table_schema || '.' || table_name ||
    ' AS ' || view_definition || ';' as create_view_statement
FROM 
    information_schema.views
WHERE 
    table_schema = 'public'
ORDER BY 
    table_name;

-- ============================================
-- EXPORT ALL TO JSON (Complete Schema)
-- ============================================
SELECT 
    jsonb_build_object(
        'database', current_database(),
        'exported_at', current_timestamp,
        'tables', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'name', tablename,
                    'columns', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'name', column_name,
                                'type', data_type,
                                'nullable', is_nullable = 'YES',
                                'default', column_default,
                                'udt_name', udt_name
                            ) ORDER BY ordinal_position
                        )
                        FROM information_schema.columns c2
                        WHERE c2.table_schema = 'public'
                            AND c2.table_name = t.table_name
                    ),
                    'indexes', (
                        SELECT jsonb_agg(indexname)
                        FROM pg_indexes i
                        WHERE i.schemaname = 'public'
                            AND i.tablename = t.table_name
                    ),
                    'foreign_keys', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'constraint_name', constraint_name,
                                'columns', (
                                    SELECT jsonb_agg(column_name ORDER BY ordinal_position)
                                    FROM information_schema.key_column_usage kcu2
                                    WHERE kcu2.constraint_name = tc.constraint_name
                                ),
                                'references_table', ccu.table_name,
                                'references_columns', (
                                    SELECT jsonb_agg(column_name ORDER BY ordinal_position)
                                    FROM information_schema.key_column_usage kcu3
                                    WHERE kcu3.constraint_name = tc.constraint_name
                                        AND kcu3.table_schema = ccu.table_schema
                                        AND kcu3.table_name = ccu.table_name
                                )
                            )
                        )
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.constraint_column_usage ccu
                            ON tc.constraint_name = ccu.constraint_name
                        WHERE tc.table_schema = 'public'
                            AND tc.table_name = t.table_name
                            AND tc.constraint_type = 'FOREIGN KEY'
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
                    'name', trigger_name,
                    'table', event_object_table,
                    'timing', action_timing,
                    'event', event_manipulation,
                    'statement', action_statement
                )
            )
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
        ),
        'policies', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'table', tablename,
                    'name', policyname,
                    'command', cmd,
                    'permissive', permissive
                )
            )
            FROM pg_policies
            WHERE schemaname = 'public'
        )
    ) as complete_schema_json;

