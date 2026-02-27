#!/usr/bin/env ts-node
/**
 * Script to repair NFT metadata URI
 * Usage: npx ts-node scripts/repair-nft.ts <assetId> [playerPDA]
 * 
 * Make sure you have a .env file in the obelisk-skiller directory with:
 * - PRIVATE_SERVER_WALLET
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE
 * - SOLANA_CLUSTER (or HELIUS_API_KEY)
 */

// Load environment variables FIRST before any imports
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables from .env file in the obelisk-skiller directory
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('✅ Loaded .env from:', envPath);
} else {
  // Try parent directory
  const parentEnvPath = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(parentEnvPath)) {
    dotenv.config({ path: parentEnvPath });
    console.log('✅ Loaded .env from:', parentEnvPath);
  } else {
    dotenv.config(); // Fallback to default .env location
    console.log('⚠️ Using default .env location');
  }
}

// Now import after env vars are loaded
import { repairNFTMetadataURI } from '../src/services/cnft';

async function main() {
  const assetId = process.argv[2];
  const playerPDA = process.argv[3];

  if (!assetId) {
    console.error('❌ Usage: npx ts-node scripts/repair-nft.ts <assetId> [playerPDA]');
    process.exit(1);
  }

  console.log(`🔧 Repairing NFT metadata URI for assetId: ${assetId}`);
  if (playerPDA) {
    console.log(`📋 Using playerPDA: ${playerPDA}`);
  }

  try {
    const result = await repairNFTMetadataURI(assetId, playerPDA);

    if (result.success) {
      console.log('✅ Metadata URI repaired successfully!');
      if (result.signature) {
        console.log(`📝 Transaction signature: ${result.signature}`);
        console.log(`🔗 View on Solscan: https://solscan.io/tx/${result.signature}`);
      }
    } else {
      console.error('❌ Failed to repair metadata URI:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error repairing NFT:', error);
    process.exit(1);
  }
}

main();

