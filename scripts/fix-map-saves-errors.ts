/**
 * Fix map_saves rows that failed to migrate due to JSON syntax errors
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

async function fixMapSavesErrors() {
  const railwayUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_DB_URL;

  if (!railwayUrl || !supabaseUrl) {
    throw new Error('DATABASE_URL and SUPABASE_DB_URL must be set');
  }

  const sourceClient = new Client({
    connectionString: supabaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  const targetClient = new Client({
    connectionString: railwayUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await sourceClient.connect();
    await targetClient.connect();
    console.log('✅ Connected to both databases\n');

    // Get all map_saves from source
    const sourceResult = await sourceClient.query('SELECT * FROM map_saves ORDER BY id');
    console.log(`📋 Found ${sourceResult.rows.length} map_saves in Supabase\n`);

    // Get already migrated IDs
    const migratedResult = await targetClient.query('SELECT id FROM map_saves');
    const migratedIds = new Set(migratedResult.rows.map((r: any) => r.id));
    console.log(`✅ Already migrated: ${migratedIds.size} rows\n`);

    // Get column names
    const columnsResult = await sourceClient.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'map_saves' 
      AND table_schema = 'public'
      AND is_generated = 'NEVER'
      ORDER BY ordinal_position
    `);
    const columns = columnsResult.rows.map((r: any) => r.column_name);
    const columnList = columns.join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    let fixed = 0;
    let errors = 0;

    for (const row of sourceResult.rows) {
      if (migratedIds.has(row.id)) {
        continue; // Already migrated
      }

      try {
        // Fix JSONB columns - convert invalid JSON to valid JSONB
        const fixedRow: any = { ...row };
        
        // Fix placed_objects
        if (fixedRow.placed_objects) {
          if (typeof fixedRow.placed_objects === 'string') {
            try {
              fixedRow.placed_objects = JSON.parse(fixedRow.placed_objects);
            } catch {
              fixedRow.placed_objects = [];
            }
          }
          if (!Array.isArray(fixedRow.placed_objects)) {
            fixedRow.placed_objects = [];
          }
        } else {
          fixedRow.placed_objects = [];
        }

        // Fix animation_stats
        if (fixedRow.animation_stats) {
          if (typeof fixedRow.animation_stats === 'string') {
            try {
              fixedRow.animation_stats = JSON.parse(fixedRow.animation_stats);
            } catch {
              fixedRow.animation_stats = {};
            }
          }
          if (typeof fixedRow.animation_stats !== 'object' || Array.isArray(fixedRow.animation_stats)) {
            fixedRow.animation_stats = {};
          }
        } else {
          fixedRow.animation_stats = {};
        }

        // Fix tags (should be array)
        if (fixedRow.tags) {
          if (typeof fixedRow.tags === 'string') {
            try {
              fixedRow.tags = JSON.parse(fixedRow.tags);
            } catch {
              fixedRow.tags = [];
            }
          }
          if (!Array.isArray(fixedRow.tags)) {
            fixedRow.tags = [];
          }
        } else {
          fixedRow.tags = [];
        }

        // Build values array
        const values = columns.map(col => fixedRow[col]);

        // Insert with ON CONFLICT
        await targetClient.query(
          `INSERT INTO map_saves (${columnList}) VALUES (${placeholders}) 
           ON CONFLICT (id) DO UPDATE SET 
           ${columns.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')}`,
          values
        );

        fixed++;
        console.log(`   ✅ Fixed and migrated map_save: ${row.id}`);
      } catch (err: any) {
        errors++;
        console.error(`   ❌ Failed to fix map_save ${row.id}: ${err.message}`);
        console.error(`      Row data: ${JSON.stringify(row, null, 2).substring(0, 200)}...`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Fixed and migrated ${fixed} rows, ${errors} errors`);
    console.log('='.repeat(60));

  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

fixMapSavesErrors().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
