#!/usr/bin/env ts-node
/**
 * Script to fix NFT image in metadata
 * Usage: npx ts-node scripts/fix-nft-image.ts <assetId>
 * 
 * This script:
 * 1. Checks if image exists in database
 * 2. If not, generates it
 * 3. Updates metadata JSON with the image URL
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
import { generateCharacterImage } from '../services/character-image-generator';
import { saveCharacterImage } from '../services/image-storage';
import { loadCharacterImageData } from '../services/character-data-loader';

async function main() {
  const assetId = process.argv[2];

  if (!assetId) {
    console.error('❌ Usage: npx ts-node scripts/fix-nft-image.ts <assetId>');
    process.exit(1);
  }

  console.log(`🔧 Fixing NFT image for assetId: ${assetId}`);

  try {
    // Step 1: Check if image exists in database
    const { data: nftRow, error: nftError } = await supabase
      .from('nfts')
      .select('character_image_url, name')
      .eq('asset_id', assetId)
      .single();
    
    if (nftError || !nftRow) {
      console.error('❌ NFT not found in database:', nftError?.message || 'Not found');
      process.exit(1);
    }
    
    let imageUrl = nftRow.character_image_url;
    
    // Step 2: Generate image if missing
    if (!imageUrl) {
      console.log('🔄 Image missing, generating...');
      
      // Load character data
      const characterData = await loadCharacterImageData(assetId);
      
      // Generate the image
      const imageBuffer = await generateCharacterImage({
        customization: characterData.customization,
        includeBackground: false
      });
      
      // Save the image
      imageUrl = await saveCharacterImage(assetId, imageBuffer, true);
      console.log(`✅ Generated and saved image: ${imageUrl}`);
      
      // Update database with image URL
      await supabase
        .from('nfts')
        .update({ character_image_url: imageUrl })
        .eq('asset_id', assetId);
    } else {
      console.log(`✅ Image already exists: ${imageUrl}`);
    }
    
    // Step 3: Get current metadata
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
    
    // Step 4: Update metadata JSON with image URL
    const updatedMetadata = {
      ...metadataRow.metadata_json,
      image: imageUrl,
      properties: {
        ...metadataRow.metadata_json.properties,
        files: [{ uri: imageUrl, type: 'image/png' }]
      }
    };
    
    // Step 5: Save updated metadata
    const { error: updateError } = await supabase
      .from('nft_metadata')
      .update({ metadata_json: updatedMetadata })
      .eq('asset_id', assetId);
    
    if (updateError) {
      console.error('❌ Failed to update metadata:', updateError.message);
      process.exit(1);
    }
    
    console.log(`✅ Successfully fixed NFT image!`);
    console.log(`   Image URL: ${imageUrl}`);
    console.log(`   Metadata updated with image field`);
    console.log(`   View metadata: https://obelisk-skiller-production.up.railway.app/metadata/${nftRow.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`);
    
  } catch (error) {
    console.error('❌ Error fixing NFT image:', error);
    process.exit(1);
  }
}

main();

