/**
 * Check if columns referenced by missing indexes exist in Supabase
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

async function checkColumns() {
  const supabaseUrl = process.env.SUPABASE_DB_URL;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_DB_URL not set');
  }

  const client = new Client({
    connectionString: supabaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase\n');

    const columnsToCheck = [
      { table: 'pda_creation_log', column: 'total_cost' },
      { table: 'pda_creation_log', column: 'player_pda' },
      { table: 'player_structures', column: 'is_active' },
      { table: 'player_structures', column: 'player_id' },
      { table: 'profiles', column: 'active_character_asset_id' },
      { table: 'profiles', column: 'character_cnfts' },
    ];

    for (const { table, column } of columnsToCheck) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        )
      `, [table, column]);
      
      const exists = result.rows[0].exists;
      console.log(`${exists ? '✅' : '❌'} ${table}.${column}: ${exists ? 'EXISTS' : 'DOES NOT EXIST'}`);
    }

  } finally {
    await client.end();
  }
}

checkColumns().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
