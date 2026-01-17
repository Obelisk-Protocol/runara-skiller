/**
 * Fix map_saves using direct SQL copy from Supabase
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

async function fixMapSavesDirect() {
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

    const failedIds = [
      '35e80131-c351-4655-91b0-62b5257d3f4b',
      '41e602b7-a2c6-48d0-8bd8-c99f411ff3f5',
      '70f9f161-8478-4d3a-bf73-8b3292d1a8e0',
      'f290f8bc-808e-4326-9ddb-06e8f2be265b'
    ];

    for (const id of failedIds) {
      try {
        // Use raw SQL to copy the row directly, letting PostgreSQL handle type conversion
        const result = await sourceClient.query(`
          SELECT 
            id, user_id, world_name, map_name, description,
            base_chunk_id, base_chunk_name, base_chunk_image_path,
            chunk_size, world_width, world_height, camera_x, camera_y, scale,
            placed_objects::text as placed_objects_json,
            COALESCE(tags::text, '{}') as tags_array,
            is_public, version, created_at, updated_at,
            animation_stats::text as animation_stats_json
          FROM map_saves 
          WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
          console.log(`   ⚠️  Row ${id} not found`);
          continue;
        }

        const row = result.rows[0];
        console.log(`\n📝 Processing: ${row.map_name}`);

        // Insert using explicit casting
        await targetClient.query(`
          INSERT INTO map_saves (
            id, user_id, world_name, map_name, description,
            base_chunk_id, base_chunk_name, base_chunk_image_path,
            chunk_size, world_width, world_height, camera_x, camera_y, scale,
            placed_objects, tags, is_public, version, created_at, updated_at,
            animation_stats
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15::jsonb, $16::text[], $17, $18, $19, $20, $21::jsonb
          )
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            world_name = EXCLUDED.world_name,
            map_name = EXCLUDED.map_name,
            description = EXCLUDED.description,
            base_chunk_id = EXCLUDED.base_chunk_id,
            base_chunk_name = EXCLUDED.base_chunk_name,
            base_chunk_image_path = EXCLUDED.base_chunk_image_path,
            chunk_size = EXCLUDED.chunk_size,
            world_width = EXCLUDED.world_width,
            world_height = EXCLUDED.world_height,
            camera_x = EXCLUDED.camera_x,
            camera_y = EXCLUDED.camera_y,
            scale = EXCLUDED.scale,
            placed_objects = EXCLUDED.placed_objects,
            tags = EXCLUDED.tags,
            is_public = EXCLUDED.is_public,
            version = EXCLUDED.version,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            animation_stats = EXCLUDED.animation_stats
        `, [
          row.id, row.user_id, row.world_name, row.map_name, row.description,
          row.base_chunk_id, row.base_chunk_name, row.base_chunk_image_path,
          row.chunk_size, row.world_width, row.world_height, row.camera_x, row.camera_y, row.scale,
          row.placed_objects_json, // Will be cast to jsonb
          row.tags_array === '{}' ? '{}' : row.tags_array, // Handle empty object
          row.is_public, row.version, row.created_at, row.updated_at,
          row.animation_stats_json // Will be cast to jsonb
        ]);

        console.log(`   ✅ Successfully migrated`);
      } catch (err: any) {
        console.error(`   ❌ Failed: ${err.message}`);
        if (err.message.includes('tags')) {
          // Try with empty array for tags
          try {
            const row = result.rows[0];
            await targetClient.query(`
              INSERT INTO map_saves (
                id, user_id, world_name, map_name, description,
                base_chunk_id, base_chunk_name, base_chunk_image_path,
                chunk_size, world_width, world_height, camera_x, camera_y, scale,
                placed_objects, tags, is_public, version, created_at, updated_at,
                animation_stats
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15::jsonb, ARRAY[]::text[], $16, $17, $18, $19, $20::jsonb
              )
              ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                world_name = EXCLUDED.world_name,
                map_name = EXCLUDED.map_name,
                description = EXCLUDED.description,
                base_chunk_id = EXCLUDED.base_chunk_id,
                base_chunk_name = EXCLUDED.base_chunk_name,
                base_chunk_image_path = EXCLUDED.base_chunk_image_path,
                chunk_size = EXCLUDED.chunk_size,
                world_width = EXCLUDED.world_width,
                world_height = EXCLUDED.world_height,
                camera_x = EXCLUDED.camera_x,
                camera_y = EXCLUDED.camera_y,
                scale = EXCLUDED.scale,
                placed_objects = EXCLUDED.placed_objects,
                tags = EXCLUDED.tags,
                is_public = EXCLUDED.is_public,
                version = EXCLUDED.version,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at,
                animation_stats = EXCLUDED.animation_stats
            `, [
              row.id, row.user_id, row.world_name, row.map_name, row.description,
              row.base_chunk_id, row.base_chunk_name, row.base_chunk_image_path,
              row.chunk_size, row.world_width, row.world_height, row.camera_x, row.camera_y, row.scale,
              row.placed_objects_json,
              row.is_public, row.version, row.created_at, row.updated_at,
              row.animation_stats_json
            ]);
            console.log(`   ✅ Successfully migrated (with empty tags array)`);
          } catch (err2: any) {
            console.error(`   ❌ Retry also failed: ${err2.message}`);
          }
        }
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

fixMapSavesDirect().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
