/**
 * Data Migration Script
 * Migrates data from Supabase PostgreSQL to Railway PostgreSQL
 * 
 * IMPORTANT: Run schema verification first to ensure schemas match!
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
// NOTE: cloudflare.env should NOT contain DATABASE_URL - use Railway env vars or .env file
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config(); // Also load from process.env (Railway sets these)

interface MigrationStats {
  table: string;
  rowsMigrated: number;
  errors: number;
}

async function migrateTable(
  sourceClient: Client,
  targetClient: Client,
  tableName: string,
  batchSize: number = 1000
): Promise<{ rowsMigrated: number; errors: number }> {
  let rowsMigrated = 0;
  let errors = 0;
  let offset = 0;

  try {
    // Get total row count
    const countResult = await sourceClient.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const totalRows = parseInt(countResult.rows[0].count, 10);

    if (totalRows === 0) {
      console.log(`   ℹ️  ${tableName}: No rows to migrate`);
      return { rowsMigrated: 0, errors: 0 };
    }

    console.log(`   📦 ${tableName}: Migrating ${totalRows} rows...`);

    // Get column names (excluding generated columns)
    const columnsResult = await sourceClient.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 
      AND table_schema = 'public'
      AND is_generated = 'NEVER'
      ORDER BY ordinal_position
    `, [tableName]);

    const columns = columnsResult.rows.map(r => r.column_name);
    const columnList = columns.join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    // Migrate in batches
    while (offset < totalRows) {
      try {
        // Fetch batch from source
        const sourceResult = await sourceClient.query(
          `SELECT ${columnList} FROM ${tableName} ORDER BY ${columns[0]} LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );

        if (sourceResult.rows.length === 0) {
          break;
        }

        // Insert batch into target (using ON CONFLICT for idempotency)
        // Try to find primary key for conflict resolution
        const pkResult = await targetClient.query(`
          SELECT column_name 
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = $1 
          AND tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
          ORDER BY kcu.ordinal_position
        `, [tableName]);

        const primaryKeys = pkResult.rows.map(r => r.column_name);
        const conflictClause = primaryKeys.length > 0
          ? `ON CONFLICT (${primaryKeys.join(', ')}) DO UPDATE SET ${columns.filter(c => !primaryKeys.includes(c)).map(c => `${c} = EXCLUDED.${c}`).join(', ')}`
          : '';

        for (const row of sourceResult.rows) {
          try {
            const values = columns.map(col => row[col]);
            await targetClient.query(
              `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders}) ${conflictClause}`,
              values
            );
            rowsMigrated++;
          } catch (err: any) {
            if (err.code === '23505') { // Unique violation - already exists
              // Skip duplicate
              rowsMigrated++;
            } else {
              console.error(`     ⚠️  Error inserting row: ${err.message}`);
              errors++;
            }
          }
        }

        offset += batchSize;
        process.stdout.write(`     Progress: ${Math.min(offset, totalRows)}/${totalRows} rows\r`);
      } catch (err: any) {
        console.error(`     ❌ Batch error: ${err.message}`);
        errors++;
        offset += batchSize; // Skip this batch and continue
      }
    }

    console.log(`     ✅ ${tableName}: Migrated ${rowsMigrated} rows${errors > 0 ? ` (${errors} errors)` : ''}`);
    return { rowsMigrated, errors };
  } catch (err: any) {
    console.error(`   ❌ ${tableName}: Migration failed - ${err.message}`);
    return { rowsMigrated, errors: errors + 1 };
  }
}

async function migrateData() {
  const railwayUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_DB_URL;

  if (!railwayUrl) {
    throw new Error('DATABASE_URL not set');
  }

  if (!supabaseUrl) {
    console.error('❌ SUPABASE_DB_URL not set');
    console.error('');
    console.error('   To get your PostgreSQL connection string:');
    console.error('   1. Go to Supabase Dashboard → Your Project');
    console.error('   2. Click the "Connect" button at the top of the Dashboard');
    console.error('   3. Copy the "Session pooler" connection string (recommended for IPv4)');
    console.error('      OR "Transaction pooler" connection string');
    console.error('');
    throw new Error('SUPABASE_DB_URL not set');
  }

  console.log('🚀 Starting data migration from Supabase to Railway...\n');

  // Connect to databases
  const sourceClient = new Client({
    connectionString: supabaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  const targetClient = new Client({
    connectionString: railwayUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    try {
      await sourceClient.connect();
      console.log('✅ Connected to Supabase (source)');
    } catch (supaErr: any) {
      if (supaErr.code === 'ENOTFOUND' || supaErr.message?.includes('getaddrinfo')) {
        console.error('\n❌ Failed to connect to Supabase');
        console.error('   The direct connection (db.*.supabase.co) requires IPv6.');
        console.error('   Use the FREE Session pooler instead (no charge for IPv4):');
        console.error('   Supabase Dashboard → Connect → Session pooler tab');
        console.error('   The pooler uses IPv4 and is FREE - no need to pay for IPv4!');
        throw new Error('Supabase connection failed - use Session pooler connection string (free, IPv4 compatible)');
      }
      throw supaErr;
    }

    await targetClient.connect();
    console.log('✅ Connected to Railway (target)\n');

    // Get list of tables to migrate (in dependency order)
    const tablesResult = await sourceClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map(r => r.table_name);

    // Migration order (tables with foreign keys should come after their dependencies)
    const migrationOrder = [
      'users',           // No dependencies
      'profiles',        // Depends on users
      'item_definitions', // No dependencies
      'nfts',            // Depends on profiles
      'nft_metadata',    // Depends on nfts
      'nft_skill_experience', // Depends on nfts
      'player_skill_experience', // Depends on profiles
      'player_items',    // Depends on profiles, item_definitions
      'chunks',          // No dependencies
      'assets',          // No dependencies
      'animation_configs', // No dependencies
      'map_editor_collisions', // No dependencies
      'map_saves',       // No dependencies
      'player_structures', // Depends on profiles
      'quests',          // No dependencies
      'experience_logs', // Depends on profiles
      'skill_training_logs', // Depends on profiles
      'xp_award_events', // Depends on profiles
      'pda_creation_log', // Depends on profiles
      'action_skills',   // No dependencies
    ];

    // Sort tables by migration order, then alphabetically for any not in the list
    const orderedTables = [
      ...migrationOrder.filter(t => tables.includes(t)),
      ...tables.filter(t => !migrationOrder.includes(t)).sort()
    ];

    console.log(`📋 Migrating ${orderedTables.length} tables...\n`);

    const stats: MigrationStats[] = [];

    for (const table of orderedTables) {
      const result = await migrateTable(sourceClient, targetClient, table);
      stats.push({
        table,
        rowsMigrated: result.rowsMigrated,
        errors: result.errors
      });
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    
    const totalRows = stats.reduce((sum, s) => sum + s.rowsMigrated, 0);
    const totalErrors = stats.reduce((sum, s) => sum + s.errors, 0);

    for (const stat of stats) {
      if (stat.rowsMigrated > 0 || stat.errors > 0) {
        console.log(`${stat.table}: ${stat.rowsMigrated} rows${stat.errors > 0 ? ` (${stat.errors} errors)` : ''}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Total: ${totalRows} rows migrated${totalErrors > 0 ? `, ${totalErrors} errors` : ''}`);
    console.log('='.repeat(60) + '\n');

    if (totalErrors === 0) {
      console.log('✅ Data migration completed successfully!');
    } else {
      console.log('⚠️  Data migration completed with errors. Please review the output above.');
    }

  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

// Run migration
migrateData().catch(err => {
  console.error('❌ Data migration failed:', err);
  process.exit(1);
});
