#!/usr/bin/env ts-node
/**
 * Script to mass update all NFT images and metadata
 * Usage: npx ts-node scripts/mass-update-nft-images.ts [--dry-run] [--limit N]
 * 
 * This script:
 * 1. Fetches all assetIds from nfts table
 * 2. For each NFT:
 *    - Generates/regenerates the character image
 *    - Updates nfts.character_image_url
 *    - Updates nft_metadata.metadata_json with image
 * 3. Reports success/failure for each
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
import { supabase } from '../src/config/database';
import { generateCharacterImage } from '../src/services/character-image-generator';
import { saveCharacterImage } from '../src/services/image-storage';
import { loadCharacterImageData } from '../src/services/character-data-loader';

interface UpdateResult {
  assetId: string;
  name: string;
  success: boolean;
  imageUrl?: string;
  error?: string;
}

async function updateSingleNFT(assetId: string, dryRun: boolean): Promise<UpdateResult> {
  try {
    // Get NFT info
    const { data: nftRow, error: nftError } = await supabase
      .from('nfts')
      .select('asset_id, name, character_image_url')
      .eq('asset_id', assetId)
      .single();
    
    if (nftError || !nftRow) {
      return {
        assetId,
        name: 'Unknown',
        success: false,
        error: `NFT not found: ${nftError?.message || 'Not found'}`
      };
    }
    
    if (dryRun) {
      console.log(`  [DRY RUN] Would update: ${nftRow.name} (${assetId})`);
      return {
        assetId,
        name: nftRow.name || 'Unknown',
        success: true,
        imageUrl: nftRow.character_image_url || 'Would generate'
      };
    }
    
    // Load character data
    const characterData = await loadCharacterImageData(assetId);
    
    // Generate the image
    const imageBuffer = await generateCharacterImage({
      customization: characterData.customization,
      includeBackground: false
    });
    
    // Save the image
    const imageUrl = await saveCharacterImage(assetId, imageBuffer, true);
    
    // Update nfts table with image URL
    const { error: updateNftError } = await supabase
      .from('nfts')
      .update({ character_image_url: imageUrl })
      .eq('asset_id', assetId);
    
    if (updateNftError) {
      return {
        assetId,
        name: nftRow.name || 'Unknown',
        success: false,
        error: `Failed to update nfts table: ${updateNftError.message}`
      };
    }
    
    // Get or create metadata
    const { data: metadataRow } = await supabase
      .from('nft_metadata')
      .select('metadata_json')
      .eq('asset_id', assetId)
      .single();
    
    if (metadataRow) {
      // Update existing metadata
      const updatedMetadata = {
        ...metadataRow.metadata_json,
        image: imageUrl,
        properties: {
          ...metadataRow.metadata_json.properties,
          files: [{ uri: imageUrl, type: 'image/png' }]
        }
      };
      
      const { error: updateMetaError } = await supabase
        .from('nft_metadata')
        .update({ metadata_json: updatedMetadata })
        .eq('asset_id', assetId);
      
      if (updateMetaError) {
        return {
          assetId,
          name: nftRow.name || 'Unknown',
          success: false,
          error: `Failed to update metadata: ${updateMetaError.message}`
        };
      }
    } else {
      // Create new metadata entry
      // Get character stats for metadata
      const { NftColumns } = await import('../src/services/database');
      const row = await NftColumns.get(assetId);
      if (row) {
        const stats = await NftColumns.columnsToStatsWithSkills(row);
        const metadataJson = {
          name: stats.name,
          symbol: 'PLAYER',
          description: `Character with ${stats.totalLevel} total skill levels`,
          image: imageUrl,
          external_url: 'https://runara.fun',
          attributes: [
            { trait_type: 'Version', value: stats.version || '2.0.0' },
            { trait_type: 'Level', value: stats.combatLevel.toString() },
            { trait_type: 'Total Level', value: stats.totalLevel.toString() },
            { trait_type: 'Attack', value: stats.skills.attack.level.toString() },
            { trait_type: 'Strength', value: stats.skills.strength.level.toString() },
            { trait_type: 'Defense', value: stats.skills.defense.level.toString() },
            { trait_type: 'Magic', value: stats.skills.magic.level.toString() },
            { trait_type: 'Projectiles', value: stats.skills.projectiles.level.toString() },
            { trait_type: 'Vitality', value: stats.skills.vitality.level.toString() },
            { trait_type: 'Crafting', value: stats.skills.crafting.level.toString() },
            { trait_type: 'Luck', value: stats.skills.luck.level.toString() },
            { trait_type: 'Mining', value: stats.skills.mining.level.toString() },
            { trait_type: 'Woodcutting', value: stats.skills.woodcutting.level.toString() },
            { trait_type: 'Fishing', value: stats.skills.fishing.level.toString() },
            { trait_type: 'Hunting', value: stats.skills.hunting.level.toString() },
            { trait_type: 'Smithing', value: stats.skills.smithing.level.toString() },
            { trait_type: 'Cooking', value: stats.skills.cooking.level.toString() },
            { trait_type: 'Alchemy', value: stats.skills.alchemy.level.toString() },
            { trait_type: 'Construction', value: stats.skills.construction.level.toString() }
          ],
          properties: {
            files: [{ uri: imageUrl, type: 'image/png' }]
          }
        };
        
        const { error: createMetaError } = await supabase
          .from('nft_metadata')
          .upsert({
            asset_id: assetId,
            metadata_json: metadataJson,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'asset_id'
          });
        
        if (createMetaError) {
          return {
            assetId,
            name: nftRow.name || 'Unknown',
            success: false,
            error: `Failed to create metadata: ${createMetaError.message}`
          };
        }
      }
    }
    
    return {
      assetId,
      name: nftRow.name || 'Unknown',
      success: true,
      imageUrl
    };
  } catch (error) {
    return {
      assetId,
      name: 'Unknown',
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
  
  console.log(`🚀 Starting mass NFT image update${dryRun ? ' (DRY RUN)' : ''}...`);
  if (limit) {
    console.log(`📊 Limiting to ${limit} NFTs`);
  }
  
  try {
    // Fetch all assetIds from nfts table
    console.log('📋 Fetching all NFTs from database...');
    let query = supabase
      .from('nfts')
      .select('asset_id, name')
      .order('updated_at', { ascending: false });
    
    if (limit) {
      query = query.limit(limit);
    }
    
    const { data: nfts, error: fetchError } = await query;
    
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
      
      const result = await updateSingleNFT(nft.asset_id, dryRun);
      results.push(result);
      
      if (result.success) {
        console.log(`  ✅ Success${dryRun ? ' (dry run)' : ''}: ${result.imageUrl || 'N/A'}`);
      } else {
        console.log(`  ❌ Failed: ${result.error}`);
      }
      
      // Small delay to avoid overwhelming the system
      if (!dryRun && processed < nfts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
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
      console.log('⚠️ This was a dry run. Run without --dry-run to actually update NFTs.');
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

