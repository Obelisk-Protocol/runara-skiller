/**
 * Find User by Username/Email
 * Usage: npx tsx scripts/find-user.ts "Sadness"
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const username = process.argv[2] || 'Sadness';

async function findUser() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(`🔍 Searching for user: "${username}"\n`);

    // Search in profiles table by email (case-insensitive)
    const result = await client.query(
      `SELECT 
        id,
        email,
        player_pda,
        wallet_address,
        character_cnft_1,
        character_cnft_2,
        character_cnft_3,
        character_cnft_4,
        character_cnft_5,
        active_character_slot,
        created_at,
        updated_at
      FROM profiles 
      WHERE LOWER(email) = LOWER($1) 
         OR LOWER(email) LIKE LOWER($2)
      ORDER BY created_at DESC 
      LIMIT 10`,
      [username, `%${username}%`]
    );

    if (result.rows.length === 0) {
      console.log(`❌ No user found with username/email "${username}"`);
      process.exit(1);
    }

    console.log(`✅ Found ${result.rows.length} user(s):\n`);
    
    for (const profile of result.rows) {
      console.log(`User: ${profile.email}`);
      console.log(`  User ID: ${profile.id}`);
      console.log(`  Player PDA: ${profile.player_pda || 'N/A'}`);
      console.log(`  Wallet: ${profile.wallet_address || 'N/A'}`);
      console.log(`  Active Slot: ${profile.active_character_slot || 'None'}`);
      console.log(`  Created: ${profile.created_at}`);
      console.log(`\n  Character Slots:`);
      
      for (let i = 1; i <= 5; i++) {
        const assetId = profile[`character_cnft_${i}`] as string | null;
        const isActive = profile.active_character_slot === i;
        const status = assetId ? (assetId === 'EMPTY' ? 'Purchased (Empty)' : 'Has Character') : 'Empty';
        
        if (assetId && assetId !== 'EMPTY') {
          // Fetch character name from nfts table
          const charResult = await client.query(
            'SELECT name, level, combat_level FROM nfts WHERE asset_id = $1',
            [assetId]
          );
          
          const charName = charResult.rows[0]?.name || 'Unknown';
          const level = charResult.rows[0]?.level || 'N/A';
          const combatLevel = charResult.rows[0]?.combat_level || 'N/A';
          
          console.log(`    Slot ${i}${isActive ? ' (ACTIVE)' : ''}: ${charName} (${assetId})`);
          console.log(`      Level: ${level}, Combat: ${combatLevel}`);
        } else {
          console.log(`    Slot ${i}${isActive ? ' (ACTIVE)' : ''}: ${status}`);
        }
      }
      
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

findUser();
