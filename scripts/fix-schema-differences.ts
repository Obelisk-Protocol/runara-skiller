/**
 * Fix Schema Differences Script
 * Adds missing columns and indexes to Railway PostgreSQL to match Supabase
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config(); // Also load from process.env (Railway sets these)

async function fixSchemaDifferences() {
  const railwayUrl = process.env.DATABASE_URL;

  if (!railwayUrl) {
    throw new Error('DATABASE_URL not set');
  }

  if (!railwayUrl.startsWith('postgresql://') && !railwayUrl.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  console.log('🔧 Fixing schema differences in Railway PostgreSQL...\n');

  const client = new Client({
    connectionString: railwayUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway PostgreSQL\n');

    // 1. Add missing character_image_url column to nfts table
    console.log('📝 Adding missing column: nfts.character_image_url');
    try {
      await client.query(`
        ALTER TABLE public.nfts 
        ADD COLUMN IF NOT EXISTS character_image_url text;
      `);
      console.log('   ✅ Added character_image_url column\n');
    } catch (err: any) {
      if (err.code === '42701') { // Column already exists
        console.log('   ℹ️  Column already exists\n');
      } else {
        throw err;
      }
    }

    // 2. Add missing indexes (critical ones for performance)
    console.log('📝 Adding missing indexes...\n');

    const indexes = [
      // Assets indexes
      { name: 'idx_assets_category', sql: 'CREATE INDEX IF NOT EXISTS idx_assets_category ON public.assets(category)' },
      { name: 'idx_assets_category_subcategory', sql: 'CREATE INDEX IF NOT EXISTS idx_assets_category_subcategory ON public.assets(category, subcategory)' },
      { name: 'idx_assets_created_at', sql: 'CREATE INDEX IF NOT EXISTS idx_assets_created_at ON public.assets(created_at DESC)' },
      { name: 'idx_assets_file_type', sql: 'CREATE INDEX IF NOT EXISTS idx_assets_file_type ON public.assets(file_type)' },
      { name: 'idx_assets_subcategory', sql: 'CREATE INDEX IF NOT EXISTS idx_assets_subcategory ON public.assets(subcategory)' },
      { name: 'idx_assets_uploaded_by', sql: 'CREATE INDEX IF NOT EXISTS idx_assets_uploaded_by ON public.assets(uploaded_by)' },

      // Chunks indexes
      { name: 'idx_chunks_coords', sql: 'CREATE INDEX IF NOT EXISTS idx_chunks_coords ON public.chunks(x, y)' },
      { name: 'idx_chunks_last_accessed', sql: 'CREATE INDEX IF NOT EXISTS idx_chunks_last_accessed ON public.chunks(last_accessed DESC)' },
      { name: 'idx_chunks_updated_at', sql: 'CREATE INDEX IF NOT EXISTS idx_chunks_updated_at ON public.chunks(updated_at DESC)' },

      // Experience logs indexes
      { name: 'idx_experience_logs_asset', sql: 'CREATE INDEX IF NOT EXISTS idx_experience_logs_asset ON public.experience_logs(asset_id) WHERE asset_id IS NOT NULL' },
      { name: 'idx_experience_logs_session_id', sql: 'CREATE INDEX IF NOT EXISTS idx_experience_logs_session_id ON public.experience_logs(session_id) WHERE session_id IS NOT NULL' },
      { name: 'idx_experience_logs_source', sql: 'CREATE INDEX IF NOT EXISTS idx_experience_logs_source ON public.experience_logs(source) WHERE source IS NOT NULL' },

      // Item definitions indexes
      { name: 'idx_item_definitions_ground_sprite', sql: 'CREATE INDEX IF NOT EXISTS idx_item_definitions_ground_sprite ON public.item_definitions(ground_sprite_url) WHERE ground_sprite_url IS NOT NULL' },
      { name: 'idx_item_definitions_in_use_sprite', sql: 'CREATE INDEX IF NOT EXISTS idx_item_definitions_in_use_sprite ON public.item_definitions(in_use_sprite_url) WHERE in_use_sprite_url IS NOT NULL' },
      { name: 'idx_item_definitions_placeable', sql: 'CREATE INDEX IF NOT EXISTS idx_item_definitions_placeable ON public.item_definitions(is_placeable)' },
      { name: 'idx_item_definitions_placeable_category', sql: 'CREATE INDEX IF NOT EXISTS idx_item_definitions_placeable_category ON public.item_definitions(placeable_category) WHERE placeable_category IS NOT NULL' },

      // Map editor collisions indexes
      { name: 'idx_map_editor_collisions_chunk_coords', sql: 'CREATE INDEX IF NOT EXISTS idx_map_editor_collisions_chunk_coords ON public.map_editor_collisions(chunk_x, chunk_y)' },
      { name: 'idx_map_editor_collisions_object_id', sql: 'CREATE INDEX IF NOT EXISTS idx_map_editor_collisions_object_id ON public.map_editor_collisions(object_id)' },
      { name: 'idx_map_editor_collisions_placed_object_id', sql: 'CREATE INDEX IF NOT EXISTS idx_map_editor_collisions_placed_object_id ON public.map_editor_collisions(placed_object_id) WHERE placed_object_id IS NOT NULL' },
      { name: 'idx_map_editor_collisions_world_name', sql: 'CREATE INDEX IF NOT EXISTS idx_map_editor_collisions_world_name ON public.map_editor_collisions(world_name)' },

      // Map saves indexes
      { name: 'idx_map_saves_animation_stats', sql: 'CREATE INDEX IF NOT EXISTS idx_map_saves_animation_stats ON public.map_saves USING gin(animation_stats)' },
      { name: 'idx_map_saves_base_chunk_id', sql: 'CREATE INDEX IF NOT EXISTS idx_map_saves_base_chunk_id ON public.map_saves(base_chunk_id) WHERE base_chunk_id IS NOT NULL' },
      { name: 'idx_map_saves_public', sql: 'CREATE INDEX IF NOT EXISTS idx_map_saves_public ON public.map_saves(is_public)' },
      { name: 'idx_map_saves_tags', sql: 'CREATE INDEX IF NOT EXISTS idx_map_saves_tags ON public.map_saves USING gin(tags)' },
      { name: 'idx_map_saves_updated_at', sql: 'CREATE INDEX IF NOT EXISTS idx_map_saves_updated_at ON public.map_saves(updated_at DESC)' },
      { name: 'idx_map_saves_user_id', sql: 'CREATE INDEX IF NOT EXISTS idx_map_saves_user_id ON public.map_saves(user_id)' },
      { name: 'idx_map_saves_world_name', sql: 'CREATE INDEX IF NOT EXISTS idx_map_saves_world_name ON public.map_saves(world_name)' },
      { name: 'map_saves_user_id_world_name_map_name_key', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS map_saves_user_id_world_name_map_name_key ON public.map_saves(user_id, world_name, map_name)' },

      // NFT skill experience indexes
      { name: 'idx_nft_skill_exp_asset', sql: 'CREATE INDEX IF NOT EXISTS idx_nft_skill_exp_asset ON public.nft_skill_experience(asset_id)' },
      { name: 'idx_nft_skill_exp_pending', sql: 'CREATE INDEX IF NOT EXISTS idx_nft_skill_exp_pending ON public.nft_skill_experience(pending_onchain_update) WHERE pending_onchain_update = true' },
      { name: 'idx_nft_skill_pending_updated', sql: 'CREATE INDEX IF NOT EXISTS idx_nft_skill_pending_updated ON public.nft_skill_experience(updated_at) WHERE pending_onchain_update = true' },
      { name: 'idx_nfts_character_image_url', sql: 'CREATE INDEX IF NOT EXISTS idx_nfts_character_image_url ON public.nfts(character_image_url) WHERE character_image_url IS NOT NULL' },

      // PDA creation log indexes
      { name: 'idx_pda_creation_log_cost', sql: 'CREATE INDEX IF NOT EXISTS idx_pda_creation_log_cost ON public.pda_creation_log(total_cost)' },
      { name: 'idx_pda_creation_log_created_at', sql: 'CREATE INDEX IF NOT EXISTS idx_pda_creation_log_created_at ON public.pda_creation_log(created_at DESC)' },
      { name: 'idx_pda_creation_log_player', sql: 'CREATE INDEX IF NOT EXISTS idx_pda_creation_log_player ON public.pda_creation_log(player_pda)' },

      // Player items indexes
      { name: 'idx_player_items_definition', sql: 'CREATE INDEX IF NOT EXISTS idx_player_items_definition ON public.player_items(item_definition_id)' },
      { name: 'idx_player_items_minted_at', sql: 'CREATE INDEX IF NOT EXISTS idx_player_items_minted_at ON public.player_items(minted_at DESC)' },
      { name: 'unique_cnft_per_player', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS unique_cnft_per_player ON public.player_items(player_id, cnft_address) WHERE cnft_address IS NOT NULL' },

      // Player skill experience indexes (level-based for performance)
      { name: 'idx_player_skill_experience_alchemy_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_alchemy_level ON public.player_skill_experience(alchemy_level)' },
      { name: 'idx_player_skill_experience_attack_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_attack_level ON public.player_skill_experience(attack_level)' },
      { name: 'idx_player_skill_experience_construction_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_construction_level ON public.player_skill_experience(construction_level)' },
      { name: 'idx_player_skill_experience_cooking_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_cooking_level ON public.player_skill_experience(cooking_level)' },
      { name: 'idx_player_skill_experience_crafting_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_crafting_level ON public.player_skill_experience(crafting_level)' },
      { name: 'idx_player_skill_experience_defense_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_defense_level ON public.player_skill_experience(defense_level)' },
      { name: 'idx_player_skill_experience_fishing_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_fishing_level ON public.player_skill_experience(fishing_level)' },
      { name: 'idx_player_skill_experience_hunting_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_hunting_level ON public.player_skill_experience(hunting_level)' },
      { name: 'idx_player_skill_experience_luck_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_luck_level ON public.player_skill_experience(luck_level)' },
      { name: 'idx_player_skill_experience_magic_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_magic_level ON public.player_skill_experience(magic_level)' },
      { name: 'idx_player_skill_experience_mining_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_mining_level ON public.player_skill_experience(mining_level)' },
      { name: 'idx_player_skill_experience_pending', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_pending ON public.player_skill_experience(pending_onchain_update) WHERE pending_onchain_update = true' },
      { name: 'idx_player_skill_experience_projectiles_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_projectiles_level ON public.player_skill_experience(projectiles_level)' },
      { name: 'idx_player_skill_experience_smithing_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_smithing_level ON public.player_skill_experience(smithing_level)' },
      { name: 'idx_player_skill_experience_strength_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_strength_level ON public.player_skill_experience(strength_level)' },
      { name: 'idx_player_skill_experience_vitality_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_vitality_level ON public.player_skill_experience(vitality_level)' },
      { name: 'idx_player_skill_experience_woodcutting_level', sql: 'CREATE INDEX IF NOT EXISTS idx_player_skill_experience_woodcutting_level ON public.player_skill_experience(woodcutting_level)' },

      // Player structures indexes
      { name: 'idx_player_structures_active', sql: 'CREATE INDEX IF NOT EXISTS idx_player_structures_active ON public.player_structures(is_active) WHERE is_active = true' },
      { name: 'idx_player_structures_item_def', sql: 'CREATE INDEX IF NOT EXISTS idx_player_structures_item_def ON public.player_structures(item_definition_id)' },
      { name: 'idx_player_structures_type', sql: 'CREATE INDEX IF NOT EXISTS idx_player_structures_type ON public.player_structures(structure_type)' },
      { name: 'idx_player_structures_unique_active_position', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_player_structures_unique_active_position ON public.player_structures(player_id, chunk_x, chunk_y, position_x, position_y) WHERE is_active = true' },

      // Profiles indexes
      { name: 'idx_profiles_active_character', sql: 'CREATE INDEX IF NOT EXISTS idx_profiles_active_character ON public.profiles(active_character_asset_id) WHERE active_character_asset_id IS NOT NULL' },
      { name: 'idx_profiles_character_cnfts', sql: 'CREATE INDEX IF NOT EXISTS idx_profiles_character_cnfts ON public.profiles USING gin(character_cnfts)' },
      { name: 'idx_profiles_character_customization', sql: 'CREATE INDEX IF NOT EXISTS idx_profiles_character_customization ON public.profiles USING gin(character_customization)' },
      { name: 'idx_profiles_cobx_token_account', sql: 'CREATE INDEX IF NOT EXISTS idx_profiles_cobx_token_account ON public.profiles(cobx_token_account) WHERE cobx_token_account IS NOT NULL' },
      { name: 'profiles_username_idx', sql: 'CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username) WHERE username IS NOT NULL' },
      { name: 'profiles_username_unique', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles(username) WHERE username IS NOT NULL' },

      // Quests indexes
      { name: 'idx_quests_type', sql: 'CREATE INDEX IF NOT EXISTS idx_quests_type ON public.quests(quest_type)' },
      { name: 'idx_quests_world_name', sql: 'CREATE INDEX IF NOT EXISTS idx_quests_world_name ON public.quests(world_name)' },

      // Skill training logs indexes
      { name: 'idx_skill_training_logs_action', sql: 'CREATE INDEX IF NOT EXISTS idx_skill_training_logs_action ON public.skill_training_logs(action) WHERE action IS NOT NULL' },
      { name: 'idx_skill_training_logs_asset_id', sql: 'CREATE INDEX IF NOT EXISTS idx_skill_training_logs_asset_id ON public.skill_training_logs(asset_id) WHERE asset_id IS NOT NULL' },
      { name: 'idx_skill_training_logs_created_at', sql: 'CREATE INDEX IF NOT EXISTS idx_skill_training_logs_created_at ON public.skill_training_logs(created_at DESC)' },
      { name: 'idx_skill_training_logs_skill', sql: 'CREATE INDEX IF NOT EXISTS idx_skill_training_logs_skill ON public.skill_training_logs(skill)' },
    ];

    let created = 0;
    let skipped = 0;

    for (const idx of indexes) {
      try {
        await client.query(idx.sql);
        created++;
      } catch (err: any) {
        if (err.code === '42P07') { // Index already exists
          skipped++;
        } else {
          console.error(`   ⚠️  Failed to create ${idx.name}: ${err.message}`);
        }
      }
    }

    console.log(`✅ Created ${created} indexes, ${skipped} already existed\n`);

    // Summary
    console.log('='.repeat(60));
    console.log('✅ Schema differences fixed!');
    console.log('='.repeat(60));
    console.log('   - Added missing column: nfts.character_image_url');
    console.log(`   - Added ${created} missing indexes`);
    console.log('');
    console.log('⚠️  Note: The 4 missing views/analytics tables are not needed for migration.');
    console.log('   They are: assets_view, cnft_minting_analytics, view_map_save_interactions, view_map_save_npcs');
    console.log('');

  } finally {
    await client.end();
  }
}

// Run fix
fixSchemaDifferences().catch(err => {
  console.error('❌ Schema fix failed:', err);
  process.exit(1);
});
