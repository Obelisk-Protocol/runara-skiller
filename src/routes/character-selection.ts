/**
 * Character Selection API Routes
 * Handles character name retrieval and updates
 */

import { Router } from 'express';
import { Client } from 'pg';
import { authenticateUser } from '../utils/auth-helper';
import { z } from 'zod';

const router = Router();

function getPgClient(): InstanceType<typeof Client> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set');
  }
  return new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
}

const UpdateCharacterNameSchema = z.object({
  characterName: z.string().min(1),
});

/**
 * GET /api/character-selection
 * Get current user's character name
 */
router.get('/', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { userId } = await authenticateUser(req);
    
    // Get profile with character slots
    const profileResult = await client.query(
      `SELECT active_character_slot, character_cnft_1, character_cnft_2, character_cnft_3, 
       character_cnft_4, character_cnft_5, character_name 
       FROM profiles WHERE id = $1`,
      [userId]
    );
    
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const profile = profileResult.rows[0];
    const activeSlot = profile.active_character_slot || 1;
    const assetId = profile[`character_cnft_${activeSlot}`] as string | null;
    
    // Fetch name from nfts.name (source of truth per NFT)
    let characterName = profile.character_name || 'Player';
    if (assetId) {
      const nftResult = await client.query(
        'SELECT name FROM nfts WHERE asset_id = $1',
        [assetId]
      );
      
      if (nftResult.rows.length > 0 && nftResult.rows[0].name) {
        characterName = nftResult.rows[0].name;
      }
    }
    
    return res.json({
      characterName,
      textureKey: 'baseplayer'
    });
  } catch (error: any) {
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Error fetching character selection:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    await client.end();
  }
});

/**
 * POST /api/character-selection
 * Update user's character name
 */
router.post('/', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { userId } = await authenticateUser(req);
    const { characterName } = UpdateCharacterNameSchema.parse(req.body);
    
    // Get profile first to find active character assetId
    const profileBeforeResult = await client.query(
      `SELECT active_character_slot, character_cnft_1, character_cnft_2, character_cnft_3, 
       character_cnft_4, character_cnft_5, player_pda 
       FROM profiles WHERE id = $1`,
      [userId]
    );
    
    if (profileBeforeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const profileBefore = profileBeforeResult.rows[0];
    
    // Update profile character_name
    const profileResult = await client.query(
      `UPDATE profiles 
       SET character_name = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING character_name`,
      [characterName, userId]
    );
    
    const profile = profileResult.rows[0];
    
    // Get active character assetId
    const activeSlot = profileBefore.active_character_slot || 1;
    const assetId = profileBefore[`character_cnft_${activeSlot}`] as string | null;
    
    if (assetId) {
      // Update nfts.name for this specific NFT
      try {
        await client.query(
          'UPDATE nfts SET name = $1, updated_at = NOW() WHERE asset_id = $2',
          [characterName, assetId]
        );
        console.log(`✅ Updated nfts.name for assetId ${assetId} to "${characterName}"`);
      } catch (updateErr: any) {
        console.warn('⚠️ Failed to update nfts.name:', updateErr);
        // Continue - profile update succeeded
      }
      
      // Check if on-chain update is needed
      try {
        const nftResult = await client.query(
          'SELECT name, mint_signature, updated_at FROM nfts WHERE asset_id = $1',
          [assetId]
        );
        
        if (nftResult.rows.length > 0) {
          const nftRow = nftResult.rows[0];
          const shouldUpdate = nftRow && (
            nftRow.name !== characterName ||
            (nftRow.mint_signature && nftRow.updated_at && 
             new Date(nftRow.updated_at).getTime() < Date.now() - 5000)
          );
          
          if (shouldUpdate) {
            // Trigger on-chain update (async, don't wait)
            const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
            fetch(`${backendUrl}/api/characters/update-cnft-name`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                assetId,
                name: characterName,
                playerPDA: profileBefore.player_pda,
              }),
            }).catch((err) => {
              console.warn('⚠️ Error calling NFT name update API:', err);
            });
          }
        }
      } catch (checkErr) {
        console.warn('⚠️ Failed to check NFT name, skipping on-chain update:', checkErr);
      }
    }
    
    return res.json({
      success: true,
      characterName: profile.character_name,
      textureKey: 'baseplayer',
      nftUpdateTriggered: !!assetId,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Error updating character selection:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    await client.end();
  }
});

export default router;
