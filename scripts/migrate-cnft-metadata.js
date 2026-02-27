#!/usr/bin/env node

/**
 * Batch Migration Script for cNFT Metadata
 * Updates all existing cNFTs to use the new 18-skill format with full names
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { mplBubblegum } = require('@metaplex-foundation/mpl-bubblegum');
const { keypairIdentity } = require('@metaplex-foundation/umi');
const { Connection, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Configuration
const SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'mainnet-beta';
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || process.env.DAS_RPC_URL_MAINNET || process.env.MAINNET_RPC_URL;
if (!RPC_ENDPOINT) {
  console.error('Set SOLANA_RPC_URL, DAS_RPC_URL_MAINNET, or MAINNET_RPC_URL in .env');
  process.exit(1);
}

// Hardcoded collection mint - no environment variable needed
const COLLECTION_MINT = 'DQWoNLwaqFoxJPiMxnzDEaiJZoCWZ5uBzzN4uUk9XvrE';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error(`   SUPABASE_URL: ${SUPABASE_URL ? '✅' : '❌'}`);
  console.error(`   SUPABASE_SERVICE_ROLE: ${SUPABASE_KEY ? '✅' : '❌'}`);
  console.error('\n💡 Check your .env file and ensure all required variables are set');
  process.exit(1);
}

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const umi = createUmi(RPC_ENDPOINT).use(mplBubblegum());

// Load server keypair from environment variable
let serverKeypair;
try {
  const privateKeyString = process.env.PRIVATE_SERVER_WALLET || process.env.SERVER_WALLET_KEY;
  if (!privateKeyString) {
    throw new Error('PRIVATE_SERVER_WALLET or SERVER_WALLET_KEY environment variable not found');
  }
  
  const privateKeyArray = JSON.parse(privateKeyString);
  serverKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
  umi.use(keypairIdentity(serverKeypair));
  console.log('✅ Server keypair loaded from environment');
} catch (error) {
  console.error('❌ Failed to load server keypair:', error.message);
  process.exit(1);
}

/**
 * Get all cNFTs from the collection
 */
async function getAllCNFTs() {
  try {
    console.log('📦 Fetching all cNFTs from collection...');
    
    const { data: characters, error } = await supabase
      .from('nfts')
      .select('asset_id, player_pda, name, level, combat_level, total_level, version, att, str, def, mag, pro, vit, cra, luc, gat')
      .not('asset_id', 'is', null);
    
    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }
    
    console.log(`📦 Found ${characters.length} cNFTs to migrate`);
    
    // Transform nfts table data to match expected format
    const transformedCharacters = characters.map(nft => ({
      id: nft.asset_id,
      character_cnft_id: nft.asset_id,
      character_stats: {
        name: nft.name || 'Unnamed Player',
        level: nft.level || 1,
        combatLevel: nft.combat_level || 1,
        totalLevel: nft.total_level || 9,
        characterClass: 'Adventurer',
        version: nft.version || '2.0.0',
        stats: {
          str: nft.str || 10,
          agi: 10,
          int: 10,
          vit: nft.vit || 10,
          luk: nft.luc || 10
        },
        experience: 0,
        skills: {
          attack: { level: nft.att || 1, experience: 0 },
          strength: { level: nft.str || 1, experience: 0 },
          defense: { level: nft.def || 1, experience: 0 },
          magic: { level: nft.mag || 1, experience: 0 },
          projectiles: { level: nft.pro || 1, experience: 0 },
          vitality: { level: nft.vit || 1, experience: 0 },
          crafting: { level: nft.cra || 1, experience: 0 },
          luck: { level: nft.luc || 1, experience: 0 },
          gathering: { level: nft.gat || 1, experience: 0 }
        },
        skillExperience: {
          attack: 0, strength: 0, defense: 0, magic: 0, projectiles: 0,
          vitality: 0, crafting: 0, luck: 0, gathering: 0
        },
        achievements: [],
        equipment: { weapon: 'None', armor: 'None', accessory: 'None' }
      }
    }));
    
    return transformedCharacters;
  } catch (error) {
    console.error('❌ Error fetching cNFTs:', error.message);
    return [];
  }
}

/**
 * Update a single cNFT's metadata
 */
async function updateCNFTMetadata(cnftId, characterStats) {
  try {
    console.log(`🔄 Updating cNFT: ${cnftId}`);
    
    // Import the update function from the service
    const { updateCharacterCNFT } = require('../dist/services/cnft');
    
    const result = await updateCharacterCNFT(cnftId, characterStats);
    
    if (result.success) {
      console.log(`✅ Updated cNFT: ${cnftId}`);
      return { success: true, cnftId };
    } else {
      console.error(`❌ Failed to update cNFT: ${cnftId} - ${result.error}`);
      return { success: false, cnftId, error: result.error };
    }
  } catch (error) {
    console.error(`❌ Error updating cNFT ${cnftId}:`, error.message);
    return { success: false, cnftId, error: error.message };
  }
}

/**
 * Main migration function
 */
async function migrateAllCNFTs() {
  console.log('🚀 Starting cNFT metadata migration...');
  console.log('📊 New format: 18 skills with full names');
  console.log('💰 Gas cost: ~0.0001 SOL per cNFT (practically free!)');
  
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
  
  console.log(`\n🔄 Migrating ${cNFTs.length} cNFTs...`);
  
  for (let i = 0; i < cNFTs.length; i++) {
    const cnft = cNFTs[i];
    const progress = `[${i + 1}/${cNFTs.length}]`;
    
    console.log(`\n${progress} Processing cNFT: ${cnft.character_cnft_id}`);
    
    try {
      // Parse character stats
      const characterStats = typeof cnft.character_stats === 'string' 
        ? JSON.parse(cnft.character_stats)
        : cnft.character_stats;
      
      // Ensure the character stats have the new 18-skill structure
      const updatedStats = ensureNewSkillStructure(characterStats);
      
      const result = await updateCNFTMetadata(cnft.character_cnft_id, updatedStats);
      
      if (result.success) {
        results.successful++;
        console.log(`${progress} ✅ Success`);
      } else {
        results.failed++;
        results.errors.push({ cnftId: cnft.character_cnft_id, error: result.error });
        console.log(`${progress} ❌ Failed: ${result.error}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      results.failed++;
      results.errors.push({ cnftId: cnft.character_cnft_id, error: error.message });
      console.log(`${progress} ❌ Error: ${error.message}`);
    }
  }
  
  // Print summary
  console.log('\n📊 Migration Summary:');
  console.log(`✅ Successful: ${results.successful}/${results.total}`);
  console.log(`❌ Failed: ${results.failed}/${results.total}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(({ cnftId, error }) => {
      console.log(`  - ${cnftId}: ${error}`);
    });
  }
  
  console.log('\n🎉 Migration complete!');
  console.log('💡 All cNFTs now use the new 18-skill format with full names');
}

/**
 * Ensure character stats have the new 18-skill structure
 */
function ensureNewSkillStructure(characterStats) {
  const newSkills = {
    // Combat Skills
    attack: { level: 1, experience: 0 },
    strength: { level: 1, experience: 0 },
    defense: { level: 1, experience: 0 },
    magic: { level: 1, experience: 0 },
    projectiles: { level: 1, experience: 0 },
    vitality: { level: 1, experience: 0 },
    // Gathering Skills
    mining: { level: 1, experience: 0 },
    woodcutting: { level: 1, experience: 0 },
    fishing: { level: 1, experience: 0 },
    farming: { level: 1, experience: 0 },
    hunting: { level: 1, experience: 0 },
    // Crafting Skills
    smithing: { level: 1, experience: 0 },
    crafting: { level: 1, experience: 0 },
    cooking: { level: 1, experience: 0 },
    alchemy: { level: 1, experience: 0 },
    construction: { level: 1, experience: 0 },
    // Unique Skills
    luck: { level: 1, experience: 0 }
  };
  
  const newSkillExperience = {
    // Combat Skills
    attack: 0,
    strength: 0,
    defense: 0,
    magic: 0,
    projectiles: 0,
    vitality: 0,
    // Gathering Skills
    mining: 0,
    woodcutting: 0,
    fishing: 0,
    farming: 0,
    hunting: 0,
    // Crafting Skills
    smithing: 0,
    crafting: 0,
    cooking: 0,
    alchemy: 0,
    construction: 0,
    // Unique Skills
    luck: 0
  };
  
  // Merge existing skills with new structure
  if (characterStats.skills) {
    Object.keys(newSkills).forEach(skillName => {
      if (characterStats.skills[skillName]) {
        newSkills[skillName] = characterStats.skills[skillName];
      }
    });
  }
  
  if (characterStats.skillExperience) {
    Object.keys(newSkillExperience).forEach(skillName => {
      if (characterStats.skillExperience[skillName] !== undefined) {
        newSkillExperience[skillName] = characterStats.skillExperience[skillName];
      }
    });
  }
  
  return {
    ...characterStats,
    skills: newSkills,
    skillExperience: newSkillExperience,
    version: '2.0.0' // Update version to indicate new format
  };
}

// Run migration if called directly
if (require.main === module) {
  migrateAllCNFTs().catch(console.error);
}

module.exports = { migrateAllCNFTs, updateCNFTMetadata, ensureNewSkillStructure };
