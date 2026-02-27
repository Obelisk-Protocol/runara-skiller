/**
 * Test script for cNFT metadata update functionality
 * 
 * Usage:
 *   npx tsx scripts/test-cnft-update.ts <assetId>
 * 
 * Or after building:
 *   npm run build
 *   node dist/scripts/test-cnft-update.js <assetId>
 * 
 * Example:
 *   npx tsx scripts/test-cnft-update.ts DQfAMfrSFShguVdMiYfSXuuHaKTnS93TM8JPdW9khUrs
 */

import * as dotenv from 'dotenv';
import { updateCharacterCNFT } from '../src/services/cnft';
import { NftColumns } from '../src/services/database';
import type { CharacterStats } from '../src/types/character';

// Load environment variables
dotenv.config();

async function testCNFTUpdate(assetId: string) {
  console.log('🧪 Testing cNFT Metadata Update');
  console.log('================================');
  console.log(`Asset ID: ${assetId}\n`);

  try {
    // Step 1: Fetch current character stats from database
    console.log('📊 Step 1: Fetching current character stats from database...');
    const nftRow = await NftColumns.get(assetId);
    
    if (!nftRow) {
      console.error('❌ Character not found in database. Please ensure the asset ID exists.');
      console.error('   Make sure the asset ID is correct and exists in the `nfts` table.');
      process.exit(1);
    }

    console.log('✅ Found character in database');
    console.log(`   Name: ${nftRow.name || 'Unknown'}`);
    console.log(`   Total Level: ${nftRow.total_level || 0}`);
    console.log(`   Combat Level: ${nftRow.combat_level || 0}`);
    console.log(`   Woodcutting Level: ${nftRow.woodcutting || 1}`);
    console.log(`   Player PDA: ${nftRow.player_pda || 'N/A'}\n`);

    // Step 2: Convert database row to CharacterStats
    console.log('🔄 Step 2: Converting database row to CharacterStats...');
    const characterStats = NftColumns.columnsToStats(nftRow);
    
    console.log('✅ CharacterStats created');
    console.log(`   Name: ${characterStats.name}`);
    console.log(`   Combat Level: ${characterStats.combatLevel}`);
    console.log(`   Total Level: ${characterStats.totalLevel}`);
    console.log(`   Version: ${characterStats.version}`);
    console.log(`   Woodcutting: Level ${characterStats.skills.woodcutting?.level || 1}, XP ${characterStats.skills.woodcutting?.experience || 0}\n`);

    // Step 3: Test the update function
    console.log('🚀 Step 3: Calling updateCharacterCNFT...');
    console.log('   This will:');
    console.log('   1. Upload new metadata JSON to Arweave');
    console.log('   2. Fetch asset proof via SDK');
    console.log('   3. Update on-chain cNFT metadata URI\n');

    const startTime = Date.now();
    const result = await updateCharacterCNFT(
      assetId,
      characterStats,
      nftRow.player_pda || undefined
    );
    const duration = Date.now() - startTime;

    // Step 4: Display results
    console.log('\n📋 Results:');
    console.log('================================');
    if (result.success) {
      console.log('✅ SUCCESS!');
      console.log(`   Signature: ${result.signature}`);
      console.log(`   Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
      console.log(`\n🔗 View transaction: https://solscan.io/tx/${result.signature}`);
      console.log(`🔗 View cNFT: https://solscan.io/token/${assetId}`);
      if (process.env.SOLANA_CLUSTER?.includes('devnet')) {
        console.log(`🔗 Devnet Explorer: https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
      }
    } else {
      console.log('❌ FAILED');
      console.log(`   Error: ${result.error}`);
      console.log(`   Duration: ${duration}ms`);
      console.log('\n💡 Troubleshooting:');
      console.log('   - Check that the asset ID exists on-chain');
      console.log('   - Verify RPC URL is configured correctly');
      console.log('   - Ensure server wallet has SOL for transaction fees');
      console.log('   - Check that the asset is owned by the player PDA or server wallet');
    }

    return result;

  } catch (error) {
    console.error('\n❌ Test failed with exception:');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// Main execution
const assetId = process.argv[2];

if (!assetId) {
  console.error('❌ Usage: npx tsx scripts/test-cnft-update.ts <assetId>');
  console.error('   Or: node dist/scripts/test-cnft-update.js <assetId>');
  console.error('\nExample:');
  console.error('  npx tsx scripts/test-cnft-update.ts DQfAMfrSFShguVdMiYfSXuuHaKTnS93TM8JPdW9khUrs');
  process.exit(1);
}

// Validate asset ID format
if (assetId.length < 32 || assetId.startsWith('cnft-')) {
  console.error('❌ Invalid asset ID format. Expected a Solana public key (32+ characters).');
  console.error(`   Received: ${assetId} (${assetId.length} chars)`);
  process.exit(1);
}

testCNFTUpdate(assetId)
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
