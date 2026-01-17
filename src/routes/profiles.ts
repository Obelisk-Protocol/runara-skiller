/**
 * Profiles API Routes
 * Provides profile data via PostgreSQL (replaces Supabase queries)
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

// Validation schemas
const GetProfileSchema = z.object({
  userId: z.string().uuid().optional(),
  playerPda: z.string().optional(),
  username: z.string().optional(),
  walletAddress: z.string().optional(),
});

/**
 * GET /api/profiles
 * Get profile by userId, playerPda, username, or walletAddress
 */
router.get('/', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { userId, playerPda, username, walletAddress } = GetProfileSchema.parse({
      userId: req.query.userId,
      playerPda: req.query.playerPda,
      username: req.query.username,
      walletAddress: req.query.walletAddress,
    });
    
    if (!userId && !playerPda && !username && !walletAddress) {
      return res.status(400).json({
        error: 'userId, playerPda, username, or walletAddress required'
      });
    }
    
    let query = 'SELECT * FROM profiles WHERE ';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (userId) {
      query += `id = $${paramIndex}`;
      params.push(userId);
    } else if (username) {
      query += `username = $${paramIndex}`;
      params.push(username);
    } else if (playerPda) {
      query += `player_pda = $${paramIndex}`;
      params.push(playerPda);
    } else if (walletAddress) {
      query += `LOWER(wallet_address) = LOWER($${paramIndex})`;
      params.push(walletAddress);
    }
    
    query += ' LIMIT 1';
    
    const result = await client.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }
    
    return res.json({
      success: true,
      profile: result.rows[0]
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    console.error('Error fetching profile:', error);
    return res.status(500).json({
      error: 'Failed to fetch profile',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

/**
 * POST /api/profiles
 * Get profile by walletAddress (for Web3 users)
 */
router.post('/', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({
        error: 'walletAddress required'
      });
    }
    
    const result = await client.query(
      'SELECT * FROM profiles WHERE LOWER(wallet_address) = LOWER($1) LIMIT 1',
      [walletAddress]
    );
    
    return res.json({
      success: true,
      profile: result.rows[0] || null
    });
  } catch (error: any) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({
      error: 'Failed to fetch profile',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

/**
 * GET /api/profiles/me
 * Get current user's profile (requires authentication)
 */
router.get('/me', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { userId } = await authenticateUser(req);
    
    const result = await client.query(
      'SELECT * FROM profiles WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }
    
    return res.json({
      success: true,
      profile: result.rows[0]
    });
  } catch (error: any) {
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Error fetching profile:', error);
    return res.status(500).json({
      error: 'Failed to fetch profile',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

/**
 * PATCH /api/profiles/me
 * Update current user's profile (requires authentication)
 */
router.patch('/me', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { userId } = await authenticateUser(req);
    const updates = req.body;
    
    // Build dynamic update query
    const allowedFields = [
      'character_name', 'character_class', 'active_character_slot',
      'character_cnft_1', 'character_cnft_2', 'character_cnft_3',
      'character_cnft_4', 'character_cnft_5', 'character_customization',
      'wallet_address', 'user_type' // For wallet linking/unlinking
    ];
    
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    updateFields.push(`updated_at = NOW()`);
    values.push(userId);
    
    const query = `
      UPDATE profiles 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await client.query(query, values);
    
    return res.json({
      success: true,
      profile: result.rows[0]
    });
  } catch (error: any) {
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Error updating profile:', error);
    return res.status(500).json({
      error: 'Failed to update profile',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

/**
 * GET /api/profiles/character-slots
 * Get current user's character slots
 */
router.get('/character-slots', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { userId } = await authenticateUser(req);
    
    const result = await client.query(
      `SELECT character_cnft_1, character_cnft_2, character_cnft_3, 
       character_cnft_4, character_cnft_5, active_character_slot, player_pda 
       FROM profiles WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const profile = result.rows[0];
    
    const normalize = (v: any) => {
      const s = (v == null ? '' : String(v)).trim();
      const upper = s.toUpperCase();
      const isSentinelEmpty = upper === 'EMPTY' || upper === 'USED';
      const isPurchased = isSentinelEmpty || s.length > 0;
      return {
        purchased: isPurchased,
        assetId: isSentinelEmpty ? null : (s.length > 0 ? s : null)
      };
    };
    
    const slots = [
      { slot: 1, ...normalize(profile.character_cnft_1) },
      { slot: 2, ...normalize(profile.character_cnft_2) },
      { slot: 3, ...normalize(profile.character_cnft_3) },
      { slot: 4, ...normalize(profile.character_cnft_4) },
      { slot: 5, ...normalize(profile.character_cnft_5) },
    ];
    
    return res.json({
      success: true,
      slots,
      activeSlot: profile.active_character_slot,
      playerPDA: profile.player_pda || null
    });
  } catch (error: any) {
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Error fetching character slots:', error);
    return res.status(500).json({ error: 'Failed to fetch character slots' });
  } finally {
    await client.end();
  }
});

/**
 * POST /api/profiles/character-slots
 * Manage character slots (add, remove, setActive, purchase)
 */
router.post('/character-slots', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { userId } = await authenticateUser(req);
    const { action, slot, assetId } = req.body;
    
    if (action === 'add') {
      if (!assetId) {
        return res.status(400).json({ error: 'Asset ID required' });
      }
      
      // Find first available slot
      const profileResult = await client.query(
        `SELECT character_cnft_1, character_cnft_2, character_cnft_3, 
         character_cnft_4, character_cnft_5, active_character_slot 
         FROM profiles WHERE id = $1`,
        [userId]
      );
      
      if (profileResult.rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      
      const profile = profileResult.rows[0];
      const slots = [
        profile.character_cnft_1,
        profile.character_cnft_2,
        profile.character_cnft_3,
        profile.character_cnft_4,
        profile.character_cnft_5
      ];
      
      let availableSlot: number | null = null;
      for (let i = 0; i < slots.length; i++) {
        if (!slots[i]) {
          availableSlot = i + 1;
          break;
        }
      }
      
      if (!availableSlot) {
        return res.status(400).json({ error: 'All character slots are full' });
      }
      
      const updateData: any = {};
      updateData[`character_cnft_${availableSlot}`] = assetId;
      
      if (!profile.active_character_slot) {
        updateData.active_character_slot = availableSlot;
      }
      
      const updateFields = Object.keys(updateData).map((key, idx) => `${key} = $${idx + 1}`).join(', ');
      const updateValues = Object.values(updateData);
      updateValues.push(userId);
      
      await client.query(
        `UPDATE profiles SET ${updateFields}, updated_at = NOW() WHERE id = $${updateValues.length}`,
        updateValues
      );
      
      return res.json({
        success: true,
        slot: availableSlot,
        assetId,
        message: `Character added to slot ${availableSlot}`
      });
      
    } else if (action === 'remove') {
      if (!slot || slot < 1 || slot > 5) {
        return res.status(400).json({ error: 'Invalid slot number' });
      }
      
      const updateData: any = {};
      updateData[`character_cnft_${slot}`] = null;
      
      // Check if removing active slot
      const profileResult = await client.query(
        'SELECT active_character_slot FROM profiles WHERE id = $1',
        [userId]
      );
      
      if (profileResult.rows.length > 0 && profileResult.rows[0].active_character_slot === slot) {
        updateData.active_character_slot = null;
      }
      
      const updateFields = Object.keys(updateData).map((key, idx) => `${key} = $${idx + 1}`).join(', ');
      const updateValues = Object.values(updateData);
      updateValues.push(userId);
      
      await client.query(
        `UPDATE profiles SET ${updateFields}, updated_at = NOW() WHERE id = $${updateValues.length}`,
        updateValues
      );
      
      return res.json({
        success: true,
        slot,
        message: `Character removed from slot ${slot}`
      });
      
    } else if (action === 'setActive') {
      if (!slot || slot < 1 || slot > 5) {
        return res.status(400).json({ error: 'Invalid slot number' });
      }
      
      // Verify slot has character and get assetId
      const profileResult = await client.query(
        `SELECT character_cnft_${slot}, active_character_slot FROM profiles WHERE id = $1`,
        [userId]
      );
      
      if (profileResult.rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      
      const assetIdValue = profileResult.rows[0][`character_cnft_${slot}`];
      if (!assetIdValue) {
        return res.status(400).json({ error: 'No character in that slot' });
      }
      
      // Get NFT name to sync to profile
      let characterName: string | null = null;
      try {
        const nftResult = await client.query(
          'SELECT name FROM nfts WHERE asset_id = $1',
          [assetIdValue]
        );
        if (nftResult.rows.length > 0) {
          characterName = nftResult.rows[0].name;
        }
      } catch (e) {
        console.warn('Failed to fetch NFT name:', e);
      }
      
      const updateData: any = { active_character_slot: slot };
      if (characterName) {
        updateData.character_name = characterName;
      }
      
      const updateFields = Object.keys(updateData).map((key, idx) => `${key} = $${idx + 1}`).join(', ');
      const updateValues = Object.values(updateData);
      updateValues.push(userId);
      
      await client.query(
        `UPDATE profiles SET ${updateFields}, updated_at = NOW() WHERE id = $${updateValues.length}`,
        updateValues
      );
      
      return res.json({
        success: true,
        activeSlot: slot,
        characterName: characterName || undefined,
        message: `Character in slot ${slot} set as active`
      });
      
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error: any) {
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Error managing character slots:', error);
    return res.status(500).json({ error: 'Failed to manage character slots' });
  } finally {
    await client.end();
  }
});

/**
 * GET /api/profiles/validate-username?username=...
 * Validate username availability
 */
router.get('/validate-username', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const username = req.query.username as string;
    
    if (!username) {
      return res.status(400).json({
        error: 'Username required',
        available: false
      });
    }
    
    // Validate format
    if (username.length < 3 || username.length > 20) {
      return res.json({
        available: false,
        username,
        message: 'Username must be between 3 and 20 characters'
      });
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.json({
        available: false,
        username,
        message: 'Username can only contain letters, numbers, and underscores'
      });
    }
    
    // Check if username exists
    const result = await client.query(
      'SELECT id, username FROM profiles WHERE username = $1',
      [username]
    );
    
    const available = result.rows.length === 0;
    
    return res.json({
      available,
      username,
      message: available ? 'Username is available' : 'Username is already taken'
    });
  } catch (error: any) {
    console.error('Error validating username:', error);
    return res.status(500).json({
      error: 'Internal server error',
      available: false
    });
  } finally {
    await client.end();
  }
});

export default router;
