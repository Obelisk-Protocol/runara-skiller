/**
 * Find Character NFT by Name
 * Usage: npx tsx scripts/find-character.ts "Sadness"
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const characterName = process.argv[2] || 'Sadness';

async function findCharacter() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(`🔍 Searching for character: "${characterName}"\n`);

    // Search in nfts table by name (case-insensitive)
    const result = await client.query(
      `SELECT 
        asset_id,
        name,
        player_pda,
        character_image_url,
        level,
        combat_level,
        created_at,
        updated_at
      FROM nfts 
      WHERE LOWER(name) = LOWER($1) 
      ORDER BY created_at DESC 
      LIMIT 10`,
      [characterName]
    );

    if (result.rows.length === 0) {
      console.log(`❌ No character found with name "${characterName}"`);
      
      // Try partial match
      const partialResult = await client.query(
        `SELECT 
          asset_id,
          name,
          player_pda,
          character_image_url,
          level,
          combat_level
        FROM nfts 
        WHERE LOWER(name) LIKE LOWER($1) 
        ORDER BY created_at DESC 
        LIMIT 10`,
        [`%${characterName}%`]
      );
      
      if (partialResult.rows.length > 0) {
        console.log(`\n🔍 Found ${partialResult.rows.length} characters with similar names:\n`);
        partialResult.rows.forEach((row, i) => {
          console.log(`${i + 1}. Name: "${row.name}"`);
          console.log(`   Asset ID: ${row.asset_id}`);
          console.log(`   Player PDA: ${row.player_pda}`);
          console.log(`   Level: ${row.level || 'N/A'}`);
          console.log(`   Combat Level: ${row.combat_level || 'N/A'}`);
          console.log(`   Image: ${row.character_image_url || 'N/A'}`);
          console.log('');
        });
      }
    } else {
      console.log(`✅ Found ${result.rows.length} character(s):\n`);
      result.rows.forEach((row, i) => {
        console.log(`${i + 1}. Name: "${row.name}"`);
        console.log(`   Asset ID: ${row.asset_id}`);
        console.log(`   Player PDA: ${row.player_pda}`);
        console.log(`   Level: ${row.level || 'N/A'}`);
        console.log(`   Combat Level: ${row.combat_level || 'N/A'}`);
        console.log(`   Image: ${row.character_image_url || 'N/A'}`);
        console.log(`   Created: ${row.created_at}`);
        console.log(`   Updated: ${row.updated_at}`);
        console.log('');
      });
    }

    // Also check profiles to see if this character is in any slot
    if (result.rows.length > 0) {
      const assetId = result.rows[0].asset_id;
      console.log(`\n🔍 Checking which profiles have this character in a slot...\n`);
      
      const profileResult = await client.query(
        `SELECT 
          id,
          email,
          player_pda,
          character_cnft_1,
          character_cnft_2,
          character_cnft_3,
          character_cnft_4,
          character_cnft_5,
          active_character_slot
        FROM profiles
        WHERE character_cnft_1 = $1 
           OR character_cnft_2 = $1 
           OR character_cnft_3 = $1 
           OR character_cnft_4 = $1 
           OR character_cnft_5 = $1`,
        [assetId]
      );

      if (profileResult.rows.length > 0) {
        profileResult.rows.forEach((profile, i) => {
          let slot = null;
          for (let s = 1; s <= 5; s++) {
            if (profile[`character_cnft_${s}`] === assetId) {
              slot = s;
              break;
            }
          }
          console.log(`Profile ${i + 1}:`);
          console.log(`  User ID: ${profile.id}`);
          console.log(`  Email: ${profile.email || 'N/A'}`);
          console.log(`  Player PDA: ${profile.player_pda}`);
          console.log(`  Slot: ${slot}${profile.active_character_slot === slot ? ' (ACTIVE)' : ''}`);
          console.log('');
        });
      } else {
        console.log('❌ This character is not assigned to any profile slot');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

findCharacter();
