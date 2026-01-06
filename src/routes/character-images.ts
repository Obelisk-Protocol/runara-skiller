/**
 * Character image generation API routes
 * Handles dynamic NFT image generation and updates
 */

import { Router } from 'express';
import { z } from 'zod';
import { generateCharacterImage } from '../services/character-image-generator';
import { saveCharacterImage, getCharacterImageUrl } from '../services/image-storage';
import { loadCharacterImageData } from '../services/character-data-loader';
import { updateCharacterCNFT } from '../services/cnft';
import { NftColumns } from '../services/database';
import { supabase } from '../config/database';

const router = Router();

// Validation schema
const GenerateImageSchema = z.object({
  forceRegenerate: z.boolean().optional().default(false),
  includeBackground: z.boolean().optional().default(false),
  updateNFT: z.boolean().optional().default(true), // Whether to update NFT metadata
});

/**
 * POST /api/characters/:assetId/generate-image
 * Generate character portrait image and optionally update NFT metadata
 */
router.post('/:assetId/generate-image', async (req: any, res: any) => {
  try {
    const { assetId } = req.params;
    const { forceRegenerate, includeBackground, updateNFT } = GenerateImageSchema.parse(req.body || {});

    // Validate assetId - reject invalid values like "EMPTY"
    if (!assetId || assetId.trim().toUpperCase() === 'EMPTY' || assetId.trim().length < 32) {
      console.warn(`❌ Invalid assetId for image generation: ${assetId}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid assetId. Cannot generate image for empty or invalid character.',
      });
    }

    console.log(`🎨 Generating image for character: ${assetId}`);

    // Load character data (customization, equipment, name) first to get character name
    // CRITICAL: Refresh name from database to ensure we have the latest name
    // This prevents race conditions where name was just updated
    const characterData = await loadCharacterImageData(assetId);
    
    // CRITICAL: Double-check we have the latest name from database with retry
    // This handles race conditions where name update hasn't committed yet
    let latestRow = await NftColumns.get(assetId);
    let retryCount = 0;
    const maxRetries = 3;
    
    // If name doesn't match, retry with small delay to allow database commit
    while (latestRow?.name && latestRow.name !== characterData.characterName && retryCount < maxRetries) {
      if (retryCount > 0) {
        console.log(`🔄 Name mismatch detected (attempt ${retryCount + 1}/${maxRetries}): loaded="${characterData.characterName}", database="${latestRow.name}". Waiting for database commit...`);
        await new Promise(resolve => setTimeout(resolve, 200 * retryCount)); // Exponential backoff: 200ms, 400ms, 600ms
        latestRow = await NftColumns.get(assetId); // Re-fetch
      } else {
        console.log(`🔄 Name mismatch detected: loaded="${characterData.characterName}", database="${latestRow.name}". Using database name.`);
        characterData.characterName = latestRow.name;
        break; // First attempt - use immediately
      }
      retryCount++;
    }
    
    // Final check - use latest name from database
    if (latestRow?.name) {
      characterData.characterName = latestRow.name;
      if (retryCount > 0) {
        console.log(`✅ Name refreshed after ${retryCount} retries: "${characterData.characterName}"`);
      }
    }

    // Check if image already exists in database (by assetId, not name)
    // This avoids issues when character name changes
    if (!forceRegenerate) {
      const row = await NftColumns.get(assetId);
      if (row?.character_image_url) {
        console.log(`✅ Image already exists in database: ${row.character_image_url}`);
        return res.json({
          success: true,
          imageUrl: row.character_image_url,
          message: 'Image already exists (use forceRegenerate: true to regenerate)',
          cached: true,
        });
      }
    }
    console.log(`📊 Loaded character data:`, {
      name: characterData.characterName,
      outfit: characterData.customization.outfit,
      hasEquipment: Object.keys(characterData.equippedGear || {}).length > 0,
    });

    // Generate image
    console.log(`🎨 Generating character image...`);
    const imageBuffer = await generateCharacterImage({
      customization: characterData.customization,
      includeBackground: includeBackground || false,
    });

    console.log(`✅ Image generated: ${imageBuffer.length} bytes`);

    // CRITICAL: Refresh name ONE MORE TIME right before saving image
    // This ensures we have the absolute latest name even if database was just updated
    const finalNameRow = await NftColumns.get(assetId);
    const finalCharacterName = finalNameRow?.name || characterData.characterName;
    if (finalCharacterName !== characterData.characterName) {
      console.log(`🔄 Final name refresh: "${characterData.characterName}" → "${finalCharacterName}" (before saving image)`);
      characterData.characterName = finalCharacterName;
    }

    // CRITICAL: Use assetId for filename instead of name to avoid filename conflicts
    // when character name changes. The database stores the URL, so filename doesn't matter.
    // This prevents issues where old name file exists but new name file doesn't.
    const imageUrl = await saveCharacterImage(assetId, imageBuffer, true); // Use assetId, not name
    console.log(`💾 Image saved with assetId-based filename: ${imageUrl}`);

    // Store image URL in database (nfts table)
    // Use raw SQL to avoid trigger issues and ensure column exists
    try {
      const row = await NftColumns.get(assetId);
      if (row) {
        // Try to update using Supabase, but handle gracefully if column doesn't exist
        const { error: updateError } = await supabase
          .from('nfts')
          .update({ character_image_url: imageUrl })
          .eq('asset_id', assetId);
        
        if (updateError) {
          // Check if error is because column doesn't exist
          if (updateError.message.includes('column') || updateError.message.includes('field')) {
            console.warn(`⚠️ character_image_url column may not exist yet. Run migration 010_add_character_customization_and_image_url.sql`);
          } else {
            console.warn(`⚠️ Failed to store image URL in database: ${updateError.message}`);
          }
        } else {
          console.log(`💾 Image URL stored in database`);
        }
      }
    } catch (dbError) {
      console.warn(`⚠️ Failed to store image URL in database: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      // Continue - not critical if this fails
    }

    // Update NFT metadata if requested
    let nftUpdateResult = null;
    if (updateNFT) {
      try {
        console.log(`🔄 Updating NFT metadata with new image...`);
        
        // Get character stats for NFT update
        // CRITICAL: Refresh from database to ensure we have latest name
        const row = await NftColumns.get(assetId);
        if (!row) {
          throw new Error('Character not found in database');
        }

        const characterStats = await NftColumns.columnsToStatsWithSkills(row);
        
        // CRITICAL: Ensure we're using the latest name from database
        if (row.name && row.name !== characterStats.name) {
          console.log(`🔄 Updating characterStats.name from "${characterStats.name}" to "${row.name}"`);
          characterStats.name = row.name;
        }
        
        // Update NFT with new image URL
        // Pass the generated image URL explicitly to ensure it's used
        const updateResult = await updateCharacterCNFT(
          assetId,
          characterStats,
          characterData.playerPDA,
          imageUrl // Pass the generated image URL - this should be used, not default
        );

        if (updateResult.success) {
          console.log(`✅ NFT metadata updated successfully: ${updateResult.signature}`);
          nftUpdateResult = {
            success: true,
            signature: updateResult.signature,
          };
        } else {
          console.error(`❌ NFT metadata update failed: ${updateResult.error}`);
          nftUpdateResult = {
            success: false,
            error: updateResult.error,
          };
        }
      } catch (nftError) {
        console.error(`❌ Error updating NFT metadata: ${nftError instanceof Error ? nftError.message : String(nftError)}`);
        nftUpdateResult = {
          success: false,
          error: nftError instanceof Error ? nftError.message : 'Unknown error',
        };
        // Don't fail the entire request if NFT update fails - image was generated successfully
      }
    }

    return res.json({
      success: true,
      imageUrl,
      message: 'Character image generated successfully',
      nftUpdate: nftUpdateResult,
      characterData: {
        name: characterData.characterName,
        outfit: characterData.customization.outfit,
      },
    });
  } catch (error) {
    console.error('❌ Generate image error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate character image',
    });
  }
});

/**
 * GET /api/characters/:assetId/image
 * Get character image URL if it exists
 */
router.get('/:assetId/image', async (req: any, res: any) => {
  try {
    const { assetId } = req.params;

    // CRITICAL: Get image URL from database first (source of truth)
    // This avoids issues when character name changes
    const row = await NftColumns.get(assetId);
    if (row?.character_image_url) {
      return res.json({
        success: true,
        imageUrl: row.character_image_url,
        exists: true,
        source: 'database',
      });
    }

    // Fallback: Try to find image by assetId (new naming scheme)
    const imageUrl = await getCharacterImageUrl(assetId, true);
    if (imageUrl) {
      return res.json({
        success: true,
        imageUrl,
        exists: true,
        source: 'filesystem',
      });
    }

    return res.json({
      success: true,
      imageUrl: null,
      exists: false,
      message: 'Image not found. Use POST /api/characters/:assetId/generate-image to create one.',
    });
  } catch (error) {
    console.error('❌ Get image error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get character image',
    });
  }
});

export default router;

