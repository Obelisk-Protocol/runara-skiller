/**
 * Fix map_saves rows - properly handle JSONB columns
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

async function fixMapSavesJsonb() {
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

    // Get failed IDs
    const failedIds = [
      '35e80131-c351-4655-91b0-62b5257d3f4b',
      '41e602b7-a2c6-48d0-8bd8-c99f411ff3f5',
      '70f9f161-8478-4d3a-bf73-8b3292d1a8e0',
      'f290f8bc-808e-4326-9ddb-06e8f2be265b'
    ];

    for (const id of failedIds) {
      try {
        // Get row from source
        const sourceResult = await sourceClient.query('SELECT * FROM map_saves WHERE id = $1', [id]);
        if (sourceResult.rows.length === 0) {
          console.log(`   ⚠️  Row ${id} not found in source`);
          continue;
        }

        const row = sourceResult.rows[0];
        console.log(`\n📝 Processing map_save: ${id}`);
        console.log(`   Map name: ${row.map_name}`);

        // Column types: tags is TEXT[], placed_objects and animation_stats are JSONB
        const jsonbColumns = ['placed_objects', 'animation_stats'];
        const arrayColumns = ['tags'];
        
        // Prepare row data - ensure JSONB columns are proper objects/arrays
        const insertData: any = {};
        for (const [key, value] of Object.entries(row)) {
          if (jsonbColumns.includes(key)) {
            // JSONB columns - ensure they're objects
            if (value === null || value === undefined) {
              insertData[key] = key === 'placed_objects' ? [] : {};
            } else if (typeof value === 'string') {
              try {
                insertData[key] = JSON.parse(value);
              } catch {
                insertData[key] = key === 'placed_objects' ? [] : {};
              }
            } else {
              insertData[key] = value;
            }
          } else if (arrayColumns.includes(key)) {
            // Array columns - ensure they're arrays (not objects)
            if (value === null || value === undefined) {
              insertData[key] = [];
            } else if (typeof value === 'string') {
              try {
                const parsed = JSON.parse(value);
                insertData[key] = Array.isArray(parsed) ? parsed : [];
              } catch {
                insertData[key] = [];
              }
            } else if (Array.isArray(value)) {
              insertData[key] = value;
            } else if (typeof value === 'object') {
              // If it's an object (like {}), convert to empty array
              insertData[key] = [];
            } else {
              insertData[key] = [];
            }
          } else {
            insertData[key] = value;
          }
        }

        // Build INSERT query with all columns
        const columns = Object.keys(insertData);
        // For JSONB, pg library handles objects directly - don't stringify
        // For arrays, pass as arrays
        const values = columns.map(col => insertData[col]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const updateClause = columns.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');

        await targetClient.query(
          `INSERT INTO map_saves (${columns.join(', ')}) VALUES (${placeholders})
           ON CONFLICT (id) DO UPDATE SET ${updateClause}`,
          values
        );

        console.log(`   ✅ Successfully migrated`);
      } catch (err: any) {
        console.error(`   ❌ Failed: ${err.message}`);
        // Try to see what the actual data looks like
        try {
          const debugResult = await sourceClient.query('SELECT placed_objects, animation_stats, tags FROM map_saves WHERE id = $1', [id]);
          console.error(`   Debug - placed_objects type: ${typeof debugResult.rows[0].placed_objects}`);
          console.error(`   Debug - animation_stats type: ${typeof debugResult.rows[0].animation_stats}`);
          console.error(`   Debug - tags type: ${typeof debugResult.rows[0].tags}`);
        } catch {}
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Finished fixing map_saves rows');
    console.log('='.repeat(60));

  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

fixMapSavesJsonb().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
