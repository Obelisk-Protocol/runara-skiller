/**
 * Schema Verification Script
 * Compares Railway PostgreSQL schema with Supabase schema to ensure they match
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
// NOTE: cloudflare.env should NOT contain DATABASE_URL - use Railway env vars or .env file
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config(); // Also load from process.env (Railway sets these)

interface TableInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface IndexInfo {
  indexname: string;
  tablename: string;
  indexdef: string;
}

interface ConstraintInfo {
  constraint_name: string;
  table_name: string;
  constraint_type: string;
  constraint_definition: string;
}

async function getTableSchema(client: Client, schema: string = 'public'): Promise<Map<string, TableInfo[]>> {
  const result = await client.query<TableInfo>(`
    SELECT 
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = $1
    ORDER BY table_name, ordinal_position
  `, [schema]);

  const tables = new Map<string, TableInfo[]>();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) {
      tables.set(row.table_name, []);
    }
    tables.get(row.table_name)!.push(row);
  }

  return tables;
}

async function getIndexes(client: Client, schema: string = 'public'): Promise<IndexInfo[]> {
  const result = await client.query<IndexInfo>(`
    SELECT 
      indexname,
      tablename,
      indexdef
    FROM pg_indexes
    WHERE schemaname = $1
    ORDER BY tablename, indexname
  `, [schema]);

  return result.rows;
}

async function getConstraints(client: Client, schema: string = 'public'): Promise<ConstraintInfo[]> {
  const result = await client.query<ConstraintInfo>(`
    SELECT 
      tc.constraint_name,
      tc.table_name,
      tc.constraint_type,
      CASE 
        WHEN tc.constraint_type = 'FOREIGN KEY' THEN
          tc.table_name || ' -> ' || ccu.table_name || '(' || ccu.column_name || ')'
        WHEN tc.constraint_type = 'PRIMARY KEY' THEN
          string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
        ELSE tc.constraint_name
      END as constraint_definition
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = $1
    GROUP BY tc.constraint_name, tc.table_name, tc.constraint_type, ccu.table_name, ccu.column_name
    ORDER BY tc.table_name, tc.constraint_type
  `, [schema]);

  return result.rows;
}

async function compareSchemas() {
  const railwayUrl = process.env.DATABASE_URL;
  
  // Construct Supabase URL - need PostgreSQL connection string (not REST API URL)
  let supabaseUrl = process.env.SUPABASE_DB_URL;
  
  if (!supabaseUrl) {
    console.error('❌ SUPABASE_DB_URL not set');
    console.error('');
    console.error('   To get your FREE Session pooler connection string (IPv4 compatible):');
    console.error('   1. Go to Supabase Dashboard → Your Project');
    console.error('   2. Click the "Connect" button at the top of the Dashboard');
    console.error('   3. In the "Connection string" panel, click on "Session pooler" tab');
    console.error('   4. Copy the connection string (format: postgres://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres)');
    console.error('');
    console.error('   This is FREE and works with IPv4 networks (no need to enable IPv4).');
    console.error('   Do NOT use "Direct connection" - that requires IPv6.');
    console.error('');
    console.error('   Then set it:');
    console.error('   $env:SUPABASE_DB_URL="[Session pooler connection string]"');
    console.error('');
    throw new Error('SUPABASE_DB_URL not set');
  }

  if (!railwayUrl) {
    console.error('❌ DATABASE_URL not set in environment');
    console.error('   Set it with: $env:DATABASE_URL="postgresql://..."');
    throw new Error('DATABASE_URL not set');
  }

  // Validate URL format (must be postgresql:// not https://)
  if (!railwayUrl.startsWith('postgresql://') && !railwayUrl.startsWith('postgres://')) {
    console.error('❌ DATABASE_URL must be a PostgreSQL connection string');
    console.error('   Current value starts with:', railwayUrl.substring(0, 10));
    console.error('   Expected format: postgresql://user:password@host:port/database');
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  if (!supabaseUrl.startsWith('postgresql://') && !supabaseUrl.startsWith('postgres://')) {
    console.error('❌ SUPABASE_DB_URL must be a PostgreSQL connection string (not REST API URL)');
    console.error('   Current value starts with:', supabaseUrl.substring(0, 10));
    console.error('   You may have set SUPABASE_URL instead - that is the REST API URL.');
    console.error('   You need SUPABASE_DB_URL which is the PostgreSQL connection string.');
    console.error('   Format: postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres');
    throw new Error('SUPABASE_DB_URL must be a PostgreSQL connection string');
  }

  // Validate URL format
  try {
    new URL(railwayUrl);
    new URL(supabaseUrl);
  } catch (err) {
    console.error('❌ Invalid connection string format');
    console.error('   Railway URL:', railwayUrl ? railwayUrl.substring(0, 30) + '...' : 'not set');
    console.error('   Supabase URL:', supabaseUrl ? supabaseUrl.substring(0, 30).replace(/:[^:@]*@/, ':****@') + '...' : 'not set');
    throw new Error('Invalid connection string format - must be valid PostgreSQL URI');
  }

  console.log('🔍 Connecting to databases...\n');
  console.log(`   Railway: ${railwayUrl.replace(/:[^:@]*@/, ':****@')}`);
  console.log(`   Supabase: ${supabaseUrl.replace(/:[^:@]*@/, ':****@')}\n`);

  // Connect to Railway
  const railwayClient = new Client({
    connectionString: railwayUrl,
    ssl: { rejectUnauthorized: false }
  });

  // Connect to Supabase - try multiple connection attempts with different SSL settings
  const supabaseClient = new Client({
    connectionString: supabaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await railwayClient.connect();
    console.log('✅ Connected to Railway PostgreSQL');

    try {
      await supabaseClient.connect();
      console.log('✅ Connected to Supabase PostgreSQL\n');
    } catch (supaErr: any) {
      if (supaErr.code === 'ENOTFOUND' || supaErr.message?.includes('getaddrinfo')) {
        console.error('\n❌ Failed to resolve Supabase hostname');
        console.error('   This usually means:');
        console.error('   1. The direct connection (db.*.supabase.co) requires IPv6');
        console.error('   2. Your network doesn\'t support IPv6');
        console.error('');
        console.error('   SOLUTION: Use the FREE Session pooler connection string (no charge for IPv4):');
        console.error('   1. Go to Supabase Dashboard → Click "Connect" button');
        console.error('   2. Click on "Session pooler" tab (NOT "Direct connection")');
        console.error('   3. Copy the connection string');
        console.error('   4. It should look like: postgres://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres');
        console.error('');
        console.error('   The Session pooler is FREE and works with IPv4 networks.');
        console.error('   You do NOT need to pay for IPv4 - the pooler handles it!');
        throw new Error('Supabase connection failed - use Session pooler connection string (free, IPv4 compatible)');
      }
      throw supaErr;
    }

    // Get schemas
    console.log('📊 Comparing table schemas...\n');
    const railwayTables = await getTableSchema(railwayClient);
    const supabaseTables = await getTableSchema(supabaseClient);

    // Compare tables
    const railwayTableNames = Array.from(railwayTables.keys()).sort();
    const supabaseTableNames = Array.from(supabaseTables.keys()).sort();

    console.log(`Railway tables: ${railwayTableNames.length}`);
    console.log(`Supabase tables: ${supabaseTableNames.length}\n`);

    // Find missing tables
    const missingInRailway = supabaseTableNames.filter(t => !railwayTableNames.includes(t));
    const extraInRailway = railwayTableNames.filter(t => !supabaseTableNames.includes(t));

    if (missingInRailway.length > 0) {
      console.log(`⚠️  Tables in Supabase but not in Railway: ${missingInRailway.join(', ')}`);
    }

    if (extraInRailway.length > 0) {
      console.log(`ℹ️  Tables in Railway but not in Supabase: ${extraInRailway.join(', ')}`);
    }

    // Compare columns for each table
    const commonTables = railwayTableNames.filter(t => supabaseTableNames.includes(t));
    let differences = 0;

    for (const tableName of commonTables) {
      const railwayCols = railwayTables.get(tableName)!;
      const supabaseCols = supabaseTables.get(tableName)!;

      const railwayColMap = new Map(railwayCols.map(c => [c.column_name, c]));
      const supabaseColMap = new Map(supabaseCols.map(c => [c.column_name, c]));

      // Check for missing columns
      for (const col of supabaseCols) {
        if (!railwayColMap.has(col.column_name)) {
          console.log(`⚠️  ${tableName}.${col.column_name}: Missing in Railway`);
          differences++;
        }
      }

      // Check for extra columns
      for (const col of railwayCols) {
        if (!supabaseColMap.has(col.column_name)) {
          console.log(`ℹ️  ${tableName}.${col.column_name}: Extra in Railway`);
        }
      }

      // Check for type differences
      for (const col of supabaseCols) {
        const railwayCol = railwayColMap.get(col.column_name);
        if (railwayCol) {
          if (railwayCol.data_type !== col.data_type) {
            console.log(`⚠️  ${tableName}.${col.column_name}: Type mismatch (Railway: ${railwayCol.data_type}, Supabase: ${col.data_type})`);
            differences++;
          }
          if (railwayCol.is_nullable !== col.is_nullable) {
            console.log(`⚠️  ${tableName}.${col.column_name}: Nullable mismatch (Railway: ${railwayCol.is_nullable}, Supabase: ${col.is_nullable})`);
            differences++;
          }
        }
      }
    }

    // Compare indexes
    console.log('\n📊 Comparing indexes...\n');
    const railwayIndexes = await getIndexes(railwayClient);
    const supabaseIndexes = await getIndexes(supabaseClient);

    console.log(`Railway indexes: ${railwayIndexes.length}`);
    console.log(`Supabase indexes: ${supabaseIndexes.length}`);

    const railwayIndexNames = new Set(railwayIndexes.map(i => i.indexname));
    const missingIndexes = supabaseIndexes.filter(i => !railwayIndexNames.has(i.indexname));

    if (missingIndexes.length > 0) {
      console.log(`\n⚠️  Missing indexes in Railway:`);
      for (const idx of missingIndexes) {
        console.log(`   - ${idx.indexname} on ${idx.tablename}`);
      }
    }

    // Compare constraints
    console.log('\n📊 Comparing constraints...\n');
    const railwayConstraints = await getConstraints(railwayClient);
    const supabaseConstraints = await getConstraints(supabaseClient);

    console.log(`Railway constraints: ${railwayConstraints.length}`);
    console.log(`Supabase constraints: ${supabaseConstraints.length}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    if (differences === 0 && missingInRailway.length === 0 && missingIndexes.length === 0) {
      console.log('✅ Schema verification PASSED - Schemas match!');
    } else {
      console.log('⚠️  Schema verification found differences');
      console.log(`   - Column differences: ${differences}`);
      console.log(`   - Missing tables: ${missingInRailway.length}`);
      console.log(`   - Missing indexes: ${missingIndexes.length}`);
    }
    console.log('='.repeat(60) + '\n');

  } finally {
    await railwayClient.end();
    await supabaseClient.end();
  }
}

// Run verification
compareSchemas().catch(err => {
  console.error('❌ Schema verification failed:', err);
  process.exit(1);
});
