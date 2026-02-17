-- ============================================
-- COMPLETE DATABASE SCHEMA EXPORT
-- Run this in Supabase SQL Editor
-- This will generate ALL CREATE statements for:
-- - Tables (with constraints)
-- - Indexes
-- - Foreign Keys
-- - Triggers
-- - Functions
-- - RLS Policies
-- - Views
-- - Sequences
-- ============================================

-- ============================================
-- SETUP: Create a temporary function to format output
-- ============================================
DO $$
DECLARE
    result TEXT := '';
BEGIN
    -- Export header
    result := result || '-- ============================================' || E'\n';
    result := result || '-- COMPLETE DATABASE SCHEMA EXPORT' || E'\n';
    result := result || '-- Generated: ' || NOW()::TEXT || E'\n';
    result := result || '-- Database: ' || current_database() || E'\n';
    result := result || '-- ============================================' || E'\n\n';
    
    RAISE NOTICE '%', result;
END $$;

-- ============================================
-- PART 1: ALL TABLES WITH FULL DEFINITIONS
-- ============================================
DO $$
DECLARE
    result TEXT := '';
    tbl RECORD;
    col RECORD;
    col_defs TEXT[];
    pk_cols TEXT[];
    fk_defs TEXT[];
    unique_defs TEXT[];
    check_defs TEXT[];
BEGIN
    result := result || '-- ============================================' || E'\n';
    result := result || '-- TABLES' || E'\n';
    result := result || '-- ============================================' || E'\n\n';
    
    FOR tbl IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        ORDER BY table_name
    LOOP
        result := result || '-- Table: ' || tbl.table_name || E'\n';
        result := result || 'CREATE TABLE IF NOT EXISTS ' || tbl.table_name || ' (' || E'\n';
        
        -- Get all columns
        col_defs := ARRAY[]::TEXT[];
        FOR col IN 
            SELECT 
                c.column_name,
                c.data_type,
                c.udt_name,
                c.character_maximum_length,
                c.is_nullable,
                c.column_default,
                c.ordinal_position
            FROM information_schema.columns c
            WHERE c.table_schema = 'public' 
                AND c.table_name = tbl.table_name
            ORDER BY c.ordinal_position
        LOOP
            DECLARE
                col_def TEXT := '    ' || col.column_name || ' ';
                type_def TEXT;
            BEGIN
                -- Map data types
                IF col.data_type = 'character varying' THEN
                    type_def := 'VARCHAR' || COALESCE('(' || col.character_maximum_length::TEXT || ')', '');
                ELSIF col.data_type = 'ARRAY' THEN
                    type_def := COALESCE(col.udt_name, 'TEXT') || '[]';
                ELSIF col.udt_name = 'int4' THEN
                    type_def := 'INTEGER';
                ELSIF col.udt_name = 'int8' THEN
                    type_def := 'BIGINT';
                ELSIF col.udt_name = 'bool' THEN
                    type_def := 'BOOLEAN';
                ELSIF col.udt_name = 'uuid' THEN
                    type_def := 'UUID';
                ELSIF col.udt_name = 'jsonb' THEN
                    type_def := 'JSONB';
                ELSIF col.udt_name = 'numeric' THEN
                    type_def := 'NUMERIC';
                ELSIF col.udt_name = 'real' THEN
                    type_def := 'REAL';
                ELSIF col.data_type = 'timestamp without time zone' THEN
                    type_def := 'TIMESTAMP';
                ELSIF col.data_type = 'timestamp with time zone' THEN
                    type_def := 'TIMESTAMPTZ';
                ELSE
                    type_def := UPPER(COALESCE(col.udt_name, col.data_type, 'TEXT'));
                END IF;
                
                col_def := col_def || type_def;
                
                IF col.is_nullable = 'NO' THEN
                    col_def := col_def || ' NOT NULL';
                END IF;
                
                IF col.column_default IS NOT NULL THEN
                    col_def := col_def || ' DEFAULT ' || col.column_default;
                END IF;
                
                col_defs := array_append(col_defs, col_def);
            END;
        END LOOP;
        
        result := result || array_to_string(col_defs, ',' || E'\n');
        result := result || E'\n);' || E'\n\n';
        
        -- Get Primary Key
        SELECT string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
        INTO pk_cols
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public'
            AND tc.table_name = tbl.table_name
            AND tc.constraint_type = 'PRIMARY KEY';
        
        IF pk_cols IS NOT NULL THEN
            result := result || 'ALTER TABLE ' || tbl.table_name || 
                     ' ADD PRIMARY KEY (' || pk_cols || ');' || E'\n\n';
        END IF;
        
        -- Get Unique Constraints
        FOR unique_defs IN
            SELECT array_agg(
                'ALTER TABLE ' || tc.table_name || 
                ' ADD CONSTRAINT ' || tc.constraint_name ||
                ' UNIQUE (' || string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) || ');'
            )
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = 'public'
                AND tc.table_name = tbl.table_name
                AND tc.constraint_type = 'UNIQUE'
            GROUP BY tc.table_name, tc.constraint_name
        LOOP
            IF array_length(unique_defs, 1) > 0 THEN
                result := result || array_to_string(unique_defs, E'\n') || E'\n\n';
            END IF;
        END LOOP;
        
        -- Get Check Constraints
        SELECT array_agg(
            'ALTER TABLE ' || tc.table_name || 
            ' ADD CONSTRAINT ' || tc.constraint_name ||
            ' CHECK (' || cc.check_clause || ');'
        )
        INTO check_defs
        FROM information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc
            ON tc.constraint_name = cc.constraint_name
        WHERE tc.table_schema = 'public'
            AND tc.table_name = tbl.table_name
            AND tc.constraint_type = 'CHECK';
        
        IF check_defs IS NOT NULL THEN
            result := result || array_to_string(check_defs, E'\n') || E'\n\n';
        END IF;
    END LOOP;
    
    RAISE NOTICE '%', result;
END $$;

-- ============================================
-- PART 2: ALL FOREIGN KEYS
-- ============================================
DO $$
DECLARE
    result TEXT := '';
    fk_rec RECORD;
BEGIN
    result := result || '-- ============================================' || E'\n';
    result := result || '-- FOREIGN KEY CONSTRAINTS' || E'\n';
    result := result || '-- ============================================' || E'\n\n';
    
    FOR fk_rec IN
        SELECT
            tc.table_name,
            tc.constraint_name,
            string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns,
            ccu.table_name as ref_table,
            string_agg(ccu.column_name, ', ' ORDER BY kcu.ordinal_position) as ref_columns,
            rc.update_rule,
            rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
        GROUP BY tc.table_name, tc.constraint_name, ccu.table_name, rc.update_rule, rc.delete_rule
        ORDER BY tc.table_name, tc.constraint_name
    LOOP
        result := result || 'ALTER TABLE ' || fk_rec.table_name ||
                 ' ADD CONSTRAINT ' || fk_rec.constraint_name ||
                 ' FOREIGN KEY (' || fk_rec.columns || ')' ||
                 ' REFERENCES ' || fk_rec.ref_table || ' (' || fk_rec.ref_columns || ')';
        
        IF fk_rec.update_rule != 'NO ACTION' THEN
            result := result || ' ON UPDATE ' || fk_rec.update_rule;
        END IF;
        
        IF fk_rec.delete_rule != 'NO ACTION' THEN
            result := result || ' ON DELETE ' || fk_rec.delete_rule;
        END IF;
        
        result := result || ';' || E'\n';
    END LOOP;
    
    RAISE NOTICE '%', result;
END $$;

-- ============================================
-- PART 3: ALL INDEXES
-- ============================================
DO $$
DECLARE
    result TEXT := '';
    idx_rec RECORD;
BEGIN
    result := result || '-- ============================================' || E'\n';
    result := result || '-- INDEXES' || E'\n';
    result := result || '-- ============================================' || E'\n\n';
    
    FOR idx_rec IN
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
            AND indexname NOT LIKE '%_pkey'
        ORDER BY tablename, indexname
    LOOP
        result := result || idx_rec.indexdef || ';' || E'\n';
    END LOOP;
    
    RAISE NOTICE '%', result;
END $$;

-- ============================================
-- PART 4: ALL TRIGGERS
-- ============================================
DO $$
DECLARE
    result TEXT := '';
    trig_rec RECORD;
BEGIN
    result := result || '-- ============================================' || E'\n';
    result := result || '-- TRIGGERS' || E'\n';
    result := result || '-- ============================================' || E'\n\n';
    
    FOR trig_rec IN
        SELECT 
            trigger_name,
            event_object_table,
            action_timing,
            event_manipulation,
            action_orientation,
            action_statement
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
        ORDER BY event_object_table, trigger_name
    LOOP
        result := result || 'CREATE TRIGGER ' || trig_rec.trigger_name ||
                 ' ' || trig_rec.action_timing || ' ' || trig_rec.event_manipulation ||
                 ' ON ' || trig_rec.event_object_table ||
                 ' FOR EACH ' || trig_rec.action_orientation ||
                 ' EXECUTE FUNCTION ' || trig_rec.action_statement || ';' || E'\n';
    END LOOP;
    
    RAISE NOTICE '%', result;
END $$;

-- ============================================
-- PART 5: ALL FUNCTIONS
-- ============================================
DO $$
DECLARE
    result TEXT := '';
    func_rec RECORD;
BEGIN
    result := result || '-- ============================================' || E'\n';
    result := result || '-- FUNCTIONS' || E'\n';
    result := result || '-- ============================================' || E'\n\n';
    
    FOR func_rec IN
        SELECT 
            p.proname,
            pg_get_functiondef(p.oid) as func_def
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        ORDER BY p.proname
    LOOP
        result := result || '-- Function: ' || func_rec.proname || E'\n';
        result := result || func_rec.func_def || ';' || E'\n\n';
    END LOOP;
    
    RAISE NOTICE '%', result;
END $$;

-- ============================================
-- PART 6: ALL RLS POLICIES
-- ============================================
DO $$
DECLARE
    result TEXT := '';
    pol_rec RECORD;
BEGIN
    result := result || '-- ============================================' || E'\n';
    result := result || '-- ROW LEVEL SECURITY POLICIES' || E'\n';
    result := result || '-- ============================================' || E'\n\n';
    
    FOR pol_rec IN
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
        ORDER BY tablename, policyname
    LOOP
        result := result || 'CREATE POLICY ' || pol_rec.policyname ||
                 ' ON ' || pol_rec.tablename ||
                 ' FOR ' || pol_rec.cmd;
        
        IF pol_rec.permissive = 'RESTRICTIVE' THEN
            result := result || ' AS RESTRICTIVE';
        END IF;
        
        IF pol_rec.roles_list IS NOT NULL THEN
            result := result || ' TO ' || pol_rec.roles_list;
        END IF;
        
        IF pol_rec.qual IS NOT NULL THEN
            result := result || ' USING (' || pol_rec.qual || ')';
        END IF;
        
        IF pol_rec.with_check IS NOT NULL THEN
            result := result || ' WITH CHECK (' || pol_rec.with_check || ')';
        END IF;
        
        result := result || ';' || E'\n';
    END LOOP;
    
    RAISE NOTICE '%', result;
END $$;

-- ============================================
-- PART 7: ALL VIEWS
-- ============================================
DO $$
DECLARE
    result TEXT := '';
    view_rec RECORD;
BEGIN
    result := result || '-- ============================================' || E'\n';
    result := result || '-- VIEWS' || E'\n';
    result := result || '-- ============================================' || E'\n\n';
    
    FOR view_rec IN
        SELECT 
            table_name,
            view_definition
        FROM information_schema.views
        WHERE table_schema = 'public'
        ORDER BY table_name
    LOOP
        result := result || 'CREATE VIEW ' || view_rec.table_name ||
                 ' AS ' || view_rec.view_definition || ';' || E'\n\n';
    END LOOP;
    
    RAISE NOTICE '%', result;
END $$;

-- ============================================
-- PART 8: ALL SEQUENCES
-- ============================================
DO $$
DECLARE
    result TEXT := '';
    seq_rec RECORD;
BEGIN
    result := result || '-- ============================================' || E'\n';
    result := result || '-- SEQUENCES' || E'\n';
    result := result || '-- ============================================' || E'\n\n';
    
    FOR seq_rec IN
        SELECT 
            sequence_name,
            start_value,
            increment,
            minimum_value,
            maximum_value,
            cycle_option
        FROM information_schema.sequences
        WHERE sequence_schema = 'public'
        ORDER BY sequence_name
    LOOP
        result := result || 'CREATE SEQUENCE ' || seq_rec.sequence_name;
        
        IF seq_rec.start_value IS NOT NULL THEN
            result := result || ' START WITH ' || seq_rec.start_value;
        END IF;
        
        IF seq_rec.increment IS NOT NULL THEN
            result := result || ' INCREMENT BY ' || seq_rec.increment;
        END IF;
        
        IF seq_rec.minimum_value IS NOT NULL THEN
            result := result || ' MINVALUE ' || seq_rec.minimum_value;
        END IF;
        
        IF seq_rec.maximum_value IS NOT NULL THEN
            result := result || ' MAXVALUE ' || seq_rec.maximum_value;
        END IF;
        
        IF seq_rec.cycle_option = 'YES' THEN
            result := result || ' CYCLE';
        ELSE
            result := result || ' NO CYCLE';
        END IF;
        
        result := result || ';' || E'\n';
    END LOOP;
    
    RAISE NOTICE '%', result;
END $$;

-- ============================================
-- PART 9: ENABLE RLS ON TABLES (if needed)
-- ============================================
DO $$
DECLARE
    result TEXT := '';
    tbl_rec RECORD;
BEGIN
    result := result || '-- ============================================' || E'\n';
    result := result || '-- ENABLE ROW LEVEL SECURITY' || E'\n';
    result := result || '-- ============================================' || E'\n\n';
    
    FOR tbl_rec IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
            AND rowsecurity = true
        ORDER BY tablename
    LOOP
        result := result || 'ALTER TABLE ' || tbl_rec.tablename || 
                 ' ENABLE ROW LEVEL SECURITY;' || E'\n';
    END LOOP;
    
    RAISE NOTICE '%', result;
END $$;

