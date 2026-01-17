/**
 * Inspect map_saves rows to see what's causing the JSON error
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

async function inspectMapSaves() {
  const supabaseUrl = process.env.SUPABASE_DB_URL;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_DB_URL must be set');
  }

  const client = new Client({
    connectionString: supabaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase\n');

    const failedIds = [
      '35e80131-c351-4655-91b0-62b5257d3f4b',
      '41e602b7-a2c6-48d0-8bd8-c99f411ff3f5',
      '70f9f161-8478-4d3a-bf73-8b3292d1a8e0',
      'f290f8bc-808e-4326-9ddb-06e8f2be265b'
    ];

    for (const id of failedIds) {
      const result = await client.query(`
        SELECT 
          id, map_name,
          pg_typeof(placed_objects) as placed_objects_type,
          pg_typeof(animation_stats) as animation_stats_type,
          pg_typeof(tags) as tags_type,
          placed_objects::text as placed_objects_text,
          animation_stats::text as animation_stats_text,
          tags::text as tags_text
        FROM map_saves 
        WHERE id = $1
      `, [id]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log(`\n📋 Map Save: ${row.map_name} (${id})`);
        console.log(`   placed_objects type: ${row.placed_objects_type}`);
        console.log(`   animation_stats type: ${row.animation_stats_type}`);
        console.log(`   tags type: ${row.tags_type}`);
        console.log(`   placed_objects (first 200 chars): ${(row.placed_objects_text || '').substring(0, 200)}`);
        console.log(`   animation_stats (first 200 chars): ${(row.animation_stats_text || '').substring(0, 200)}`);
        console.log(`   tags (first 200 chars): ${(row.tags_text || '').substring(0, 200)}`);
      }
    }

    // Also check column types
    console.log('\n📊 Column types in map_saves:');
    const colTypes = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'map_saves'
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    for (const col of colTypes.rows) {
      console.log(`   ${col.column_name}: ${col.data_type} (${col.udt_name})`);
    }

  } finally {
    await client.end();
  }
}

inspectMapSaves().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
