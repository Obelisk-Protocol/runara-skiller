#!/usr/bin/env ts-node
/**
 * Script to mass update all NFT on-chain metadata URIs
 * Usage: npx ts-node scripts/mass-update-onchain-metadata.ts [--dry-run] [--limit N]
 * 
 * This script:
 * 1. Fetches all assetIds from nfts table
 * 2. For each NFT:
 *    - Updates the on-chain metadata URI to point to the new metadata endpoint
 *    - Uses URL-safe character name in the URI
 * 3. Reports success/failure for each
 */

// Load environment variables FIRST before any imports
import * as path from 'path';
import * as fs from 'fs';

// Custom .env loader that preserves FIRST value for duplicate keys
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) return;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim().replace(/^[\"']|[\"']$/g, '');
    // Only set if not already defined (first definition wins)
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
  console.log('✅ Loaded .env from:', envPath);
} else {
  console.log('⚠️ .env file not found, relying on process environment');
}

// Now import after env vars are loaded
import { pgQuery, pgQuerySingle } from '../src/utils/pg-helper';
import { repairNFTMetadataURI } from '../src/services/cnft';

interface UpdateResult {
  assetId: string;
  name: string;
  success: boolean;
  signature?: string;
  error?: string;
}

async function updateSingleNFTOnChain(assetId: string, name: string, dryRun: boolean): Promise<UpdateResult> {
  try {
    if (dryRun) {
      // Create URL-safe name
      const urlSafeName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const backendBase = process.env.BACKEND_BASE || process.env.BACKEND_BASE_URL || 'https://obelisk-skiller-production.up.railway.app';
      const metadataUri = `${backendBase}/api/characters/metadata/${urlSafeName}`;
      console.log(`  [DRY RUN] Would update URI to: ${metadataUri}`);
      return {
        assetId,
        name,
        success: true
      };
    }
    
    // Get playerPDA from database (optional)
    let playerPDA: string | undefined = undefined;
    try {
      const { data: nftRow, error } = await pgQuerySingle<{ player_pda: string | null }>(
        'SELECT player_pda FROM nfts WHERE asset_id = $1',
        [assetId]
      );

      if (error) {
        console.warn(`⚠️ Could not fetch player_pda for asset ${assetId}:`, error.message);
      } else if (nftRow?.player_pda) {
        playerPDA = nftRow.player_pda;
      }
    } catch (dbErr: any) {
      console.warn(`⚠️ Database error fetching player_pda for asset ${assetId}:`, dbErr?.message || dbErr);
    }
    
    const result = await repairNFTMetadataURI(assetId, playerPDA);
    
    if (result.success) {
      return {
        assetId,
        name,
        success: true,
        signature: result.signature
      };
    } else {
      return {
        assetId,
        name,
        success: false,
        error: result.error || 'Unknown error'
      };
    }
  } catch (error) {
    return {
      assetId,
      name,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;
  
  console.log(`🚀 Starting mass on-chain metadata update${dryRun ? ' (DRY RUN)' : ''}...`);
  if (limit) {
    console.log(`📊 Limiting to ${limit} NFTs`);
  }
  
  try {
    // Fetch all assetIds from nfts table
    console.log('📋 Fetching all NFTs from database...');

    // Build SQL with optional LIMIT
    const baseSql = 'SELECT asset_id, name FROM nfts ORDER BY updated_at DESC';
    const sql = limit ? `${baseSql} LIMIT $1` : baseSql;
    const params = limit ? [limit] : [];

    const { data: nfts, error: fetchError } = await pgQuery<{ asset_id: string; name: string | null }>(
      sql,
      params
    );

    if (fetchError) {
      console.error('❌ Failed to fetch NFTs:', fetchError.message);
      process.exit(1);
    }
    
    if (!nfts || nfts.length === 0) {
      console.log('⚠️ No NFTs found in database');
      process.exit(0);
    }
    
    console.log(`✅ Found ${nfts.length} NFTs to process`);
    console.log('');
    
    const results: UpdateResult[] = [];
    let processed = 0;
    
    // Process each NFT
    for (const nft of nfts) {
      processed++;
      console.log(`[${processed}/${nfts.length}] Processing: ${nft.name || 'Unknown'} (${nft.asset_id.substring(0, 8)}...)`);
      
      const result = await updateSingleNFTOnChain(nft.asset_id, nft.name || 'Unknown', dryRun);
      results.push(result);
      
      if (result.success) {
        if (dryRun) {
          console.log(`  ✅ Success (dry run)`);
        } else {
          console.log(`  ✅ Success`);
          if (result.signature) {
            console.log(`     📝 Signature: ${result.signature}`);
            console.log(`     🔗 View: https://solscan.io/tx/${result.signature}`);
          }
        }
      } else {
        console.log(`  ❌ Failed: ${result.error}`);
      }
      
      // Small delay to avoid overwhelming the network
      if (!dryRun && processed < nfts.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between transactions
      }
    }
    
    // Summary
    console.log('');
    console.log('📊 Summary:');
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`  ✅ Successful: ${successful}`);
    console.log(`  ❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('');
      console.log('❌ Failed NFTs:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.name} (${r.assetId.substring(0, 8)}...): ${r.error}`);
      });
    }
    
    if (dryRun) {
      console.log('');
      console.log('⚠️ This was a dry run. Run without --dry-run to actually update on-chain metadata.');
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

