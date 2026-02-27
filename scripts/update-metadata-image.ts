#!/usr/bin/env ts-node
/**
 * Script to update metadata JSON with image URL from database
 * Usage: npx ts-node scripts/update-metadata-image.ts <assetId>
 * 
 * This script:
 * 1. Gets the image URL from nfts.character_image_url
 * 2. Updates nft_metadata.metadata_json with the image URL
 * 3. Ensures the image is included in the metadata response
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

async function main() {
  const assetId = process.argv[2];

  if (!assetId) {
    console.error('❌ Usage: npx ts-node scripts/update-metadata-image.ts <assetId>');
    process.exit(1);
  }

  console.log(`🔄 Updating metadata image for assetId: ${assetId}`);

  try {
    // Get image URL from nfts table
    const { data: nftRow, error: nftError } = await supabase
      .from('nfts')
      .select('character_image_url, name')
      .eq('asset_id', assetId)
      .single();
    
    if (nftError || !nftRow) {
      console.error('❌ NFT not found in database:', nftError?.message || 'Not found');
      process.exit(1);
    }
    
    if (!nftRow.character_image_url) {
      console.error('❌ No image URL found in database.');
      console.error('   Generate image first using: POST /api/characters/:assetId/generate-image');
      process.exit(1);
    }
    
    console.log(`✅ Found image URL: ${nftRow.character_image_url}`);
    
    // Get current metadata
    const { data: metadataRow, error: metadataError } = await supabase
      .from('nft_metadata')
      .select('metadata_json')
      .eq('asset_id', assetId)
      .single();
    
    if (metadataError || !metadataRow) {
      console.error('❌ Metadata not found:', metadataError?.message || 'Not found');
      console.error('   Metadata must exist first. Create it by minting or updating the NFT.');
      process.exit(1);
    }
    
    console.log(`✅ Found existing metadata`);
    
    // Update metadata JSON with image URL
    const updatedMetadata = {
      ...metadataRow.metadata_json,
      image: nftRow.character_image_url,
      properties: {
        ...metadataRow.metadata_json.properties,
        files: [{ uri: nftRow.character_image_url, type: 'image/png' }]
      }
    };
    
    // Save updated metadata
    const { error: updateError } = await supabase
      .from('nft_metadata')
      .update({ metadata_json: updatedMetadata })
      .eq('asset_id', assetId);
    
    if (updateError) {
      console.error('❌ Failed to update metadata:', updateError.message);
      process.exit(1);
    }
    
    console.log(`✅ Successfully updated metadata with image URL!`);
    console.log(`   Image URL: ${nftRow.character_image_url}`);
    console.log(`   Metadata now includes image field`);
    
  } catch (error) {
    console.error('❌ Error updating metadata image:', error);
    process.exit(1);
  }
}

main();

