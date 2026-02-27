#!/usr/bin/env node

/**
 * Corrected cNFT Metadata Migration Script
 * Updates existing cNFTs to use the new 18-skill format
 * Uses the existing obelisk-skiller service architecture
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { mplBubblegum } = require('@metaplex-foundation/mpl-bubblegum');
const { keypairIdentity, publicKey } = require('@metaplex-foundation/umi');
const { Connection, Keypair } = require('@solana/web3.js');

// Use your actual environment variable names
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE; // Fixed: matches your .env
const SOLANA_RPC_URL = process.env.MAINNET_RPC_URL; // Fixed: matches your .env
const PRIVATE_SERVER_WALLET = process.env.PRIVATE_SERVER_WALLET;

if (!SUPABASE_URL || !SUPABASE_KEY || !SOLANA_RPC_URL || !PRIVATE_SERVER_WALLET) {
  console.error('❌ Missing required environment variables:');
  console.error(`   SUPABASE_URL: ${SUPABASE_URL ? '✅' : '❌'}`);
  console.error(`   SUPABASE_SERVICE_ROLE: ${SUPABASE_KEY ? '✅' : '❌'}`);
  console.error(`   MAINNET_RPC_URL: ${SOLANA_RPC_URL ? '✅' : '❌'}`);
  console.error(`   PRIVATE_SERVER_WALLET: ${PRIVATE_SERVER_WALLET ? '✅' : '❌'}`);
  process.exit(1);
}

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const umi = createUmi(SOLANA_RPC_URL).use(mplBubblegum());

// Load server keypair
let serverKeypair;
try {
  const privateKeyArray = JSON.parse(PRIVATE_SERVER_WALLET);
  serverKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
  umi.use(keypairIdentity(serverKeypair));
  console.log('✅ Server keypair loaded');
} catch (error) {
  console.error('❌ Failed to load server keypair:', error.message);
  process.exit(1);
}

/**
 * Get all cNFTs from your database
 */
async function getAllCNFTs() {
  try {
    console.log('📦 Fetching cNFTs from database...');
    
    const { data: nfts, error } = await supabase
      .from('nfts')
      .select('asset_id, player_pda, name, level, combat_level, total_level, version, att, str, def, mag, pro, vit, cra, luc, gat')
      .not('asset_id', 'is', null);
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    console.log(`📦 Found ${nfts.length} cNFTs to migrate`);
    return nfts;
  } catch (error) {
    console.error('❌ Error fetching cNFTs:', error.message);
    return [];
  }
}

/**
 * Generate the new 18-skill character stats
 */
function generateNewCharacterStats(nft) {
  return {
    name: nft.name || 'Adventurer',
    level: nft.level || 1,
    combatLevel: nft.combat_level || 1,
    totalLevel: nft.total_level || 18,
    characterClass: 'Adventurer',
    version: '2.0.0',
    stats: {
      str: nft.str || 10,
      agi: 10,
      int: 10,
      vit: nft.vit || 10,
      luk: nft.luc || 10
    },
    experience: 0,
    skills: {
      // Combat Skills
      attack: { level: nft.att || 1, experience: 0 },
      strength: { level: nft.str || 1, experience: 0 },
      defense: { level: nft.def || 1, experience: 0 },
      magic: { level: nft.mag || 1, experience: 0 },
      projectiles: { level: nft.pro || 1, experience: 0 },
      vitality: { level: nft.vit || 1, experience: 0 },
      // Gathering Skills
      mining: { level: 1, experience: 0 },
      woodcutting: { level: 1, experience: 0 },
      fishing: { level: 1, experience: 0 },
      farming: { level: 1, experience: 0 },
      hunting: { level: 1, experience: 0 },
      // Crafting Skills
      smithing: { level: 1, experience: 0 },
      crafting: { level: nft.cra || 1, experience: 0 },
      cooking: { level: 1, experience: 0 },
      alchemy: { level: 1, experience: 0 },
      construction: { level: 1, experience: 0 },
      // Unique Skills
      luck: { level: nft.luc || 1, experience: 0 }
    },
    skillExperience: {
      attack: 0, strength: 0, defense: 0, magic: 0, projectiles: 0,
      vitality: 0, mining: 0, woodcutting: 0, fishing: 0, farming: 0,
      hunting: 0, smithing: 0, crafting: 0, cooking: 0, alchemy: 0,
      construction: 0, luck: 0
    },
    achievements: [],
    equipment: { weapon: 'None', armor: 'None', accessory: 'None' }
  };
}

/**
 * Update a single cNFT using the obelisk-skiller service
 */
async function updateCNFTMetadata(assetId, characterStats) {
  try {
    console.log(`🔄 Updating cNFT: ${assetId}`);
    
    // Import the actual service functions
    const { updateCharacterCNFT } = require('../src/services/cnft');
    
    const result = await updateCharacterCNFT(assetId, characterStats);
    
    if (result.success) {
      console.log(`✅ Updated cNFT: ${assetId}`);
      console.log(`   Signature: ${result.signature}`);
      return { success: true, assetId, signature: result.signature };
    } else {
      console.error(`❌ Failed to update cNFT: ${assetId} - ${result.error}`);
      return { success: false, assetId, error: result.error };
    }
  } catch (error) {
    console.error(`❌ Error updating cNFT ${assetId}:`, error.message);
    return { success: false, assetId, error: error.message };
  }
}

/**
 * Main migration function
 */
async function migrateAllCNFTs() {
  console.log('�� Starting cNFT metadata migration...');
  console.log('📊 New format: 18 skills with full names');
  console.log('�� Using Arweave for metadata storage (as configured in obelisk-skiller)');
  
  const cNFTs = await getAllCNFTs();
  
  if (cNFTs.length === 0) {
    console.log('ℹ️ No cNFTs found to migrate');
    return;
  }
  
  const results = {
    total: cNFTs.length,
    successful: 0,
    failed: 0,
    errors: []
  };
  
  console.log(`\n�� Migrating ${cNFTs.length} cNFTs...`);
  
  for (let i = 0; i < cNFTs.length; i++) {
    const nft = cNFTs[i];
    const progress = `[${i + 1}/${cNFTs.length}]`;
    
    console.log(`\n${progress} Processing cNFT: ${nft.asset_id}`);
    
    try {
      // Generate new character stats with 18 skills
      const characterStats = generateNewCharacterStats(nft);
      
      // Update the cNFT
      const result = await updateCNFTMetadata(nft.asset_id, characterStats);
      
      if (result.success) {
        results.successful++;
        console.log(`${progress} ✅ Success - Signature: ${result.signature}`);
      } else {
        results.failed++;
        results.errors.push({ assetId: nft.asset_id, error: result.error });
        console.log(`${progress} ❌ Failed: ${result.error}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      results.failed++;
      results.errors.push({ assetId: nft.asset_id, error: error.message });
      console.log(`${progress} ❌ Error: ${error.message}`);
    }
  }
  
  // Print summary
  console.log('\n�� Migration Summary:');
  console.log(`✅ Successful: ${results.successful}/${results.total}`);
  console.log(`❌ Failed: ${results.failed}/${results.total}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(({ assetId, error }) => {
      console.log(`  - ${assetId}: ${error}`);
    });
  }
  
  console.log('\n🎉 Migration complete!');
  console.log('💡 All cNFTs now use the new 18-skill format with Arweave storage');
}

// Run migration if called directly
if (require.main === module) {
  migrateAllCNFTs().catch(console.error);
}

module.exports = { migrateAllCNFTs, updateCNFTMetadata, generateNewCharacterStats };