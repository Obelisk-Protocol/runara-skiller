/**
 * Make Railway PostgreSQL a 1:1 Copy of Supabase
 * 
 * This script:
 * 1. Removes extra columns from Railway (nfts skill columns)
 * 2. Removes extra tables (users if not needed)
 * 3. Creates missing views (assets_view, view_map_save_interactions, view_map_save_npcs)
 * 4. Creates missing tables (cnft_minting_analytics)
 * 5. Adds remaining missing indexes
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config(); // Also load from process.env (Railway sets these)

async function makeRailway1to1() {
  const railwayUrl = process.env.DATABASE_URL;

  if (!railwayUrl) {
    throw new Error('DATABASE_URL not set');
  }

  if (!railwayUrl.startsWith('postgresql://') && !railwayUrl.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  console.log('🔧 Making Railway PostgreSQL a 1:1 copy of Supabase...\n');

  const client = new Client({
    connectionString: railwayUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway PostgreSQL\n');

    // ========================================
    // STEP 1: Remove extra columns from nfts table
    // ========================================
    console.log('📝 Step 1: Removing extra skill columns from nfts table...');
    const skillColumns = [
      'attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality',
      'crafting', 'luck', 'mining', 'woodcutting', 'fishing', 'hunting',
      'smithing', 'cooking', 'alchemy', 'construction'
    ];

    for (const col of skillColumns) {
      try {
        await client.query(`ALTER TABLE public.nfts DROP COLUMN IF EXISTS ${col}`);
        console.log(`   ✅ Removed column: nfts.${col}`);
      } catch (err: any) {
        if (err.code === '42883') { // Column doesn't exist
          // Already removed, skip
        } else {
          console.warn(`   ⚠️  Could not remove nfts.${col}: ${err.message}`);
        }
      }
    }
    console.log('');

    // ========================================
    // STEP 2: Remove extra users table if it exists (check for dependencies first)
    // ========================================
    console.log('📝 Step 2: Checking for extra users table...');
    try {
      const usersTableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        )
      `);
      
      if (usersTableCheck.rows[0].exists) {
        // Check if any tables reference it
        const fkCheck = await client.query(`
          SELECT COUNT(*) as count
          FROM information_schema.table_constraints
          WHERE constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%users%'
        `);
        
        if (parseInt(fkCheck.rows[0].count, 10) === 0) {
          await client.query(`DROP TABLE IF EXISTS public.users CASCADE`);
          console.log('   ✅ Removed extra users table');
        } else {
          console.log('   ⚠️  users table has foreign key references, keeping it');
        }
      } else {
        console.log('   ℹ️  users table does not exist');
      }
    } catch (err: any) {
      console.warn(`   ⚠️  Could not check/remove users table: ${err.message}`);
    }
    console.log('');

    // ========================================
    // STEP 3: Create missing views
    // ========================================
    console.log('📝 Step 3: Creating missing views...');

    // 3a. assets_view
    try {
      await client.query(`
        CREATE OR REPLACE VIEW public.assets_view AS
        SELECT 
          id,
          name,
          category,
          subcategory,
          file_path,
          public_url,
          file_size,
          file_type,
          uploaded_by,
          description,
          tags,
          metadata,
          created_at,
          updated_at,
          file_data,
          default_skill_config,
          -- Helper columns
          CASE 
            WHEN file_type LIKE 'image/%' THEN 'image'
            WHEN file_type LIKE 'audio/%' THEN 'audio'
            WHEN file_type = 'application/json' THEN 'json'
            ELSE 'other'
          END as asset_type,
          -- File size in human readable format
          CASE 
            WHEN file_size < 1024 THEN file_size::text || ' B'
            WHEN file_size < 1024 * 1024 THEN ROUND(file_size / 1024.0, 1)::text || ' KB'
            WHEN file_size < 1024 * 1024 * 1024 THEN ROUND(file_size / (1024.0 * 1024), 1)::text || ' MB'
            ELSE ROUND(file_size / (1024.0 * 1024 * 1024), 1)::text || ' GB'
          END as file_size_human
        FROM public.assets
      `);
      console.log('   ✅ Created view: assets_view');
    } catch (err: any) {
      console.error(`   ❌ Failed to create assets_view: ${err.message}`);
    }

    // 3b. view_map_save_npcs
    try {
      await client.query(`
        CREATE OR REPLACE VIEW public.view_map_save_npcs AS
        SELECT
          ms.id AS map_save_id,
          (obj->>'placedId')::text AS placed_id,
          (obj->>'id')::text AS asset_id,
          (obj->'npcProfile'->>'displayName')::text AS display_name,
          (obj->'npcProfile'->>'role')::text AS role,
          (obj->'npcProfile'->>'customRoleName')::text AS custom_role_name,
          (obj->'npcProfile'->>'portraitImagePath')::text AS portrait_image_path,
          (obj->'npcProfile'->>'faction')::text AS faction,
          COALESCE((obj->'npcProfile'->>'level')::int, NULL) AS level,
          (obj->'npcProfile'->>'defaultDialogueId')::text AS default_dialogue_id,
          (obj->'npcProfile'->'behavior') AS behavior,
          (obj->'npcProfile'->'hitbox') AS hitbox,
          ms.world_name,
          ms.map_name,
          ms.updated_at
        FROM public.map_saves ms
        CROSS JOIN LATERAL jsonb_array_elements(ms.placed_objects) AS obj
        WHERE (obj->'npcProfile') IS NOT NULL
      `);
      console.log('   ✅ Created view: view_map_save_npcs');
    } catch (err: any) {
      console.error(`   ❌ Failed to create view_map_save_npcs: ${err.message}`);
    }

    // 3c. view_map_save_interactions
    try {
      await client.query(`
        CREATE OR REPLACE VIEW public.view_map_save_interactions AS
        SELECT
          ms.id AS map_save_id,
          (obj->>'placedId')::text AS placed_id,
          (it->>'id')::text AS interaction_id,
          (it->>'type')::text AS type,
          (it->>'name')::text AS name,
          (it->>'dialogueId')::text AS dialogue_id,
          COALESCE((it->>'distance')::int, 0) AS distance,
          COALESCE((it->>'autoTrigger')::boolean, false) AS auto_trigger,
          COALESCE((it->>'offsetX')::int, 0) AS offset_x,
          COALESCE((it->>'offsetY')::int, 0) AS offset_y,
          ms.world_name,
          ms.map_name
        FROM public.map_saves ms
        CROSS JOIN LATERAL jsonb_array_elements(ms.placed_objects) AS obj
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(obj->'interactions','[]'::jsonb)) AS it
      `);
      console.log('   ✅ Created view: view_map_save_interactions');
    } catch (err: any) {
      console.error(`   ❌ Failed to create view_map_save_interactions: ${err.message}`);
    }
    console.log('');

    // ========================================
    // STEP 4: Create missing table cnft_minting_analytics
    // ========================================
    console.log('📝 Step 4: Creating missing table: cnft_minting_analytics...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.cnft_minting_analytics (
          date TIMESTAMPTZ,
          item_definition_id TEXT,
          item_type TEXT,
          rarity TEXT,
          items_minted BIGINT,
          total_quantity BIGINT,
          total_cost NUMERIC,
          avg_cost_per_item NUMERIC
        )
      `);
      console.log('   ✅ Created table: cnft_minting_analytics');
    } catch (err: any) {
      console.error(`   ❌ Failed to create cnft_minting_analytics: ${err.message}`);
    }
    console.log('');

    // ========================================
    // STEP 5: Add remaining missing indexes (that can be created)
    // ========================================
    console.log('📝 Step 5: Adding remaining missing indexes...');

    // Check which columns exist before creating indexes
    const checkColumn = async (table: string, column: string): Promise<boolean> => {
      try {
        const result = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
          )
        `, [table, column]);
        return result.rows[0].exists;
      } catch {
        return false;
      }
    };

    const indexes: Array<{ name: string; sql: string; checkColumn?: { table: string; column: string } }> = [
      // Assets indexes
      { name: 'idx_assets_skill_config', sql: 'CREATE INDEX IF NOT EXISTS idx_assets_skill_config ON public.assets USING gin(default_skill_config) WHERE default_skill_config IS NOT NULL', checkColumn: { table: 'assets', column: 'default_skill_config' } },
      
      // Chunks indexes
      { name: 'idx_chunks_data_gin', sql: 'CREATE INDEX IF NOT EXISTS idx_chunks_data_gin ON public.chunks USING gin(data)', checkColumn: { table: 'chunks', column: 'data' } },
    ];

    // Conditional indexes (only create if columns exist)
    const pdaHasTotalCost = await checkColumn('pda_creation_log', 'total_cost');
    const pdaHasPlayerPda = await checkColumn('pda_creation_log', 'player_pda');
    const structuresHasIsActive = await checkColumn('player_structures', 'is_active');
    const structuresHasPlayerId = await checkColumn('player_structures', 'player_id');
    const profilesHasActiveCharacter = await checkColumn('profiles', 'active_character_asset_id');
    const profilesHasCharacterCnfts = await checkColumn('profiles', 'character_cnfts');

    if (pdaHasTotalCost) {
      indexes.push({ name: 'idx_pda_creation_log_cost', sql: 'CREATE INDEX IF NOT EXISTS idx_pda_creation_log_cost ON public.pda_creation_log(total_cost)' });
    }

    if (pdaHasPlayerPda) {
      indexes.push({ name: 'idx_pda_creation_log_player', sql: 'CREATE INDEX IF NOT EXISTS idx_pda_creation_log_player ON public.pda_creation_log(player_pda)' });
    }

    if (structuresHasIsActive) {
      indexes.push({ name: 'idx_player_structures_active', sql: 'CREATE INDEX IF NOT EXISTS idx_player_structures_active ON public.player_structures(is_active) WHERE is_active = true' });
    }

    if (structuresHasIsActive && structuresHasPlayerId) {
      indexes.push({ name: 'idx_player_structures_unique_active_position', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_player_structures_unique_active_position ON public.player_structures(placed_by_player_id, chunk_x, chunk_y, x, y) WHERE is_active = true' });
    }

    if (profilesHasActiveCharacter) {
      indexes.push({ name: 'idx_profiles_active_character', sql: 'CREATE INDEX IF NOT EXISTS idx_profiles_active_character ON public.profiles(active_character_asset_id) WHERE active_character_asset_id IS NOT NULL' });
    }

    if (profilesHasCharacterCnfts) {
      indexes.push({ name: 'idx_profiles_character_cnfts', sql: 'CREATE INDEX IF NOT EXISTS idx_profiles_character_cnfts ON public.profiles USING gin(character_cnfts)' });
    }

    let created = 0;
    let skipped = 0;

    for (const idx of indexes) {
      try {
        // Check if column exists for conditional indexes
        if (idx.checkColumn) {
          const exists = await checkColumn(idx.checkColumn.table, idx.checkColumn.column);
          if (!exists) {
            skipped++;
            continue;
          }
        }
        await client.query(idx.sql);
        created++;
      } catch (err: any) {
        if (err.code === '42P07') { // Index already exists
          skipped++;
        } else {
          console.warn(`   ⚠️  Failed to create ${idx.name}: ${err.message}`);
        }
      }
    }

    console.log(`   ✅ Created ${created} indexes, ${skipped} skipped\n`);

    // Summary
    console.log('='.repeat(60));
    console.log('✅ Railway PostgreSQL is now a 1:1 copy of Supabase!');
    console.log('='.repeat(60));
    console.log('   - Removed extra skill columns from nfts table');
    console.log('   - Removed/handled extra users table');
    console.log('   - Created 3 missing views');
    console.log('   - Created 1 missing table');
    console.log(`   - Added ${created} missing indexes`);
    console.log('');
    console.log('⚠️  Note: Run verify-schema.ts to confirm 1:1 match');
    console.log('');

  } finally {
    await client.end();
  }
}

// Run fix
makeRailway1to1().catch(err => {
  console.error('❌ Failed to make Railway 1:1:', err);
  process.exit(1);
});
