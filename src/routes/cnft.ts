import { Router } from 'express';
import { publicKey, some } from '@metaplex-foundation/umi';
import { burn, getAssetWithProof } from '@metaplex-foundation/mpl-bubblegum';
import { umi } from '../config/solana';
import { z } from 'zod';
// Local metadata cache removed

const router = Router();

// Validation schemas
const metadataIdSchema = z.object({
  id: z.string().min(1)
});

// GET /api/cnft/player-metadata/:id - Serve character metadata (matching frontend)
router.get('/player-metadata/:id', async (req: any, res: any) => {
  return res.status(410).json({ error: 'Local metadata caching disabled' })
});

// POST /api/cnft/player-metadata/:id - Store character metadata (matching frontend)
router.post('/player-metadata/:id', async (req: any, res: any) => {
  return res.status(410).json({ success: false, error: 'Local metadata caching disabled' })
});

// POST /api/cnft/fetch-player-cnfts-simple - Fetch player cNFTs (matching frontend endpoint)
router.post('/fetch-player-cnfts-simple', async (req: any, res: any) => {
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
    // Try by id first, then by player_pda as fallback
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, player_pda')
      .eq('id', playerId)
      .single();

    if (profileError || !profile) {
      const alt = await supabase
        .from('profiles')
        .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, player_pda')
        .eq('player_pda', playerId)
        .single();
      profile = alt.data as any;
      profileError = alt.error as any;
    }

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
router.post('/update-cnft-metadata', async (req: any, res: any) => {
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

// POST /api/cnft/burn { assetIds: string[] }
router.post('/burn', async (req: any, res: any) => {
  try {
    const { assetIds } = req.body || {}
    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return res.status(400).json({ success: false, error: 'assetIds[] required' })
    }
    const results: any[] = []
    for (const id of assetIds) {
      try {
        const assetWithProof = await getAssetWithProof(umi as any, publicKey(id), { truncateCanopy: true })
        const burnTx = burn(umi as any, { ...assetWithProof })
        const sigRes = await burnTx.sendAndConfirm(umi as any, { send: { skipPreflight: false } })
        results.push({ assetId: id, success: true, signature: String((sigRes as any)?.signature) })
      } catch (e: any) {
        results.push({ assetId: id, success: false, error: e?.message || String(e) })
      }
    }
    return res.json({ success: true, results })
  } catch (err) {
    console.error('❌ Burn error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

export default router;