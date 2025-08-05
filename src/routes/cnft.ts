import { Router } from 'express';
import { z } from 'zod';
import { MetadataStore } from '../services/database';

const router = Router();

// Validation schemas
const metadataIdSchema = z.object({
  id: z.string().min(1)
});

// GET /api/cnft/player-metadata/:id - Serve character metadata (matching frontend)
router.get('/player-metadata/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        error: 'Metadata ID required'
      });
    }
    
    console.log(`📋 Serving character metadata for ID: ${id}`);
    
    // Get stored character metadata
    const metadata = MetadataStore.get(id);
    
    if (!metadata) {
      return res.status(404).json({
        error: 'Character metadata not found',
        id
      });
    }
    
    // Return the metadata in standard NFT format
    res.json(metadata);
    
  } catch (error) {
    console.error('❌ Error serving character metadata:', error);
    res.status(500).json({
      error: 'Failed to serve character metadata'
    });
  }
});

// POST /api/cnft/player-metadata/:id - Store character metadata (matching frontend)
router.post('/player-metadata/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const metadata = req.body;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Metadata ID required'
      });
    }
    
    console.log(`💾 Storing character metadata for ID: ${id}`);
    
    // Store the character metadata
    MetadataStore.set(id, metadata);
    
    res.json({
      success: true,
      message: 'Character metadata stored successfully',
      id
    });
    
  } catch (error) {
    console.error('❌ Error storing character metadata:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store character metadata'
    });
  }
});

// POST /api/cnft/fetch-player-cnfts-simple - Fetch player cNFTs (matching frontend endpoint)
router.post('/fetch-player-cnfts-simple', async (req, res) => {
  try {
    const { playerId } = req.body;
    
    if (!playerId) {
      return res.status(400).json({
        success: false,
        error: 'Player ID required'
      });
    }
    
    console.log('🔍 [CNFT Route] Fetching character cNFTs for player:', playerId);
    
    // Redirect to the characters endpoint which has the full implementation
    console.log('🔄 [CNFT Route] Redirecting to characters endpoint for proper implementation...');
    
    // Import here to avoid circular dependencies
    const { supabase } = await import('../config/database');
    
    // Get the user profile from Supabase to find character asset IDs
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, player_pda')
      .eq('id', playerId)  // Note: This route uses user.id, not player_pda
      .single();

    console.log('📊 [CNFT Route] Supabase query result:');
    console.log('- Profile data:', profile);
    console.log('- Profile error:', profileError);

    if (profileError || !profile) {
      console.error('❌ [CNFT Route] Failed to fetch profile:', profileError);
      return res.status(404).json({
        success: false,
        error: `Player profile not found: ${profileError?.message || 'Unknown error'}`
      });
    }

    console.log('📋 [CNFT Route] Profile found:', profile);

    // Collect all non-null character asset IDs
    const assetIds = [
      profile.character_cnft_1,
      profile.character_cnft_2,
      profile.character_cnft_3,
      profile.character_cnft_4,
      profile.character_cnft_5
    ].filter(Boolean);

    console.log('🎯 [CNFT Route] Asset IDs found:', assetIds);

    if (assetIds.length === 0) {
      console.log('📋 [CNFT Route] No character asset IDs found in profile');
      return res.json({
        success: true,
        characters: [],
        message: 'No characters found in profile'
      });
    }
    
    // Fetch REAL cNFT data from blockchain
    const characters = [];
    
    for (const assetId of assetIds) {
      try {
        console.log(`🔄 [CNFT Route] Fetching REAL character data for asset: ${assetId}`);
        
        // Import the cNFT service to fetch real data
        const { fetchCharacterFromCNFT } = await import('../services/cnft');
        
        const character = await fetchCharacterFromCNFT(assetId);
        if (character) {
          characters.push(character);
          console.log(`✅ [CNFT Route] REAL Character fetched: ${character.characterStats?.name || 'Unknown'}`);
        } else {
          console.warn(`⚠️ [CNFT Route] Could not fetch character data for asset: ${assetId}`);
        }
      } catch (error) {
        console.error(`❌ [CNFT Route] Error fetching character ${assetId}:`, error);
      }
    }
    
    res.json({
      success: true,
      characters,
      message: `Successfully fetched ${characters.length} characters from backend service`
    });
    
  } catch (error) {
    console.error('❌ [CNFT Route] Error fetching player cNFTs:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/cnft/update-cnft-metadata - Update cNFT metadata (matching frontend endpoint)
router.post('/update-cnft-metadata', async (req, res) => {
  try {
    const { assetId, characterStats, playerPDA } = req.body;
    
    if (!assetId || !characterStats) {
      return res.status(400).json({
        success: false,
        error: 'Asset ID and character stats required'
      });
    }
    
    console.log('🔄 Starting cNFT metadata update...', assetId);
    
    // Import here to avoid circular dependencies
    const { updateCharacterCNFT } = await import('../services/cnft');
    
    const result = await updateCharacterCNFT(assetId, characterStats, playerPDA);
    
    if (result.success) {
      res.json({
        success: true,
        signature: result.signature,
        message: 'cNFT metadata updated successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ cNFT metadata update error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;