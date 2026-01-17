/**
 * Verify data migration completed successfully
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

async function verifyMigration() {
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

    const tables = [
      'profiles', 'item_definitions', 'nfts', 'nft_metadata', 'nft_skill_experience',
      'player_skill_experience', 'player_items', 'chunks', 'assets', 'animation_configs',
      'map_editor_collisions', 'map_saves', 'player_structures', 'quests',
      'experience_logs', 'skill_training_logs', 'xp_award_events', 'pda_creation_log',
      'action_skills'
    ];

    console.log('📊 Verifying row counts...\n');

    let allMatch = true;
    for (const table of tables) {
      try {
        const sourceCount = await sourceClient.query(`SELECT COUNT(*) as count FROM ${table}`);
        const targetCount = await targetClient.query(`SELECT COUNT(*) as count FROM ${table}`);
        
        const sourceRows = parseInt(sourceCount.rows[0].count, 10);
        const targetRows = parseInt(targetCount.rows[0].count, 10);
        
        const match = sourceRows === targetRows ? '✅' : '❌';
        if (sourceRows !== targetRows) allMatch = false;
        
        console.log(`${match} ${table}: Supabase=${sourceRows}, Railway=${targetRows}`);
      } catch (err: any) {
        console.log(`⚠️  ${table}: Error checking - ${err.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    if (allMatch) {
      console.log('✅ All tables match! Migration successful!');
    } else {
      console.log('⚠️  Some tables have row count mismatches');
    }
    console.log('='.repeat(60));

  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

verifyMigration().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
