/**
 * Players API Routes - Off-Chain Version
 * Uses new off-chain services (no PDAs required)
 */

import { Router } from 'express';
import { authenticateUser } from '../utils/auth-helper';
import { z } from 'zod';
import {
  initializePlayer,
  getPlayerByUserId,
  updatePlayer,
} from '../services/offchain-program';
import {
  ensureCOBXAccount,
  ensureOBXAccount,
} from '../services/offchain-program';

const router = Router();

// Validation schemas
const InitializePlayerSchema = z.object({
  name: z.string().min(3).max(50).optional(),
  characterClass: z.number().int().min(0).max(3).optional(),
  walletAddress: z.string().optional(),
});

/**
 * POST /api/players/initialize
 * Initialize player using off-chain services (unified - no Web2/Web3 distinction)
 * All users initialize the same way: database-backed, no PDAs required
 */
router.post('/initialize', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    
    // Check if player already exists
    if (profile?.id) {
      const existing = await getPlayerByUserId(userId);
      if (existing) {
        return res.status(409).json({ 
          error: 'Player account already exists',
          playerId: existing.id 
        });
      }
    }

    const { name, characterClass, walletAddress } = InitializePlayerSchema.parse(req.body);

    // Initialize player using off-chain service
    const player = await initializePlayer({
      userId,
      name: name || 'New Player',
      class: characterClass !== undefined ? characterClass : 0,
      walletAddress: walletAddress || null,
    });

    // Ensure token accounts exist
    try {
      await ensureCOBXAccount(player.id);
      await ensureOBXAccount(player.id);
    } catch (tokenError: any) {
      console.error('Failed to create token accounts:', tokenError);
      // Don't fail the request - token accounts can be created later
    }

    return res.json({
      success: true,
      player: {
        id: player.id,
        character_name: player.character_name,
        character_class: player.character_class,
        level: player.level,
        wins: player.wins,
        losses: player.losses,
      },
      message: 'Player account created successfully'
    });

  } catch (error: any) {
    console.error('Error initializing player:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }

    return res.status(500).json({
      error: 'Failed to initialize player',
      details: error.message
    });
  }
});

/**
 * GET /api/players/me-offchain
 * Get current player's off-chain account
 */
router.get('/me-offchain', async (req: any, res: any) => {
  try {
    const { userId } = await authenticateUser(req);
    
    const player = await getPlayerByUserId(userId);
    
    if (!player) {
      return res.status(404).json({
        error: 'Player account not found'
      });
    }

    return res.json({
      success: true,
      player: {
        id: player.id,
        character_name: player.character_name,
        character_class: player.character_class,
        level: player.level,
        wins: player.wins,
        losses: player.losses,
        lifetime_obx_earned: player.lifetime_obx_earned?.toString() || '0',
        lifetime_exp_spent: player.lifetime_exp_spent?.toString() || '0',
        wallet_address: player.wallet_address,
        created_at: player.created_at,
        updated_at: player.updated_at,
      }
    });

  } catch (error: any) {
    console.error('Error fetching player:', error);
    return res.status(500).json({
      error: 'Failed to fetch player',
      details: error.message
    });
  }
});

/**
 * PATCH /api/players/me-offchain
 * Update current player's off-chain account
 */
router.patch('/me-offchain', async (req: any, res: any) => {
  try {
    const { userId } = await authenticateUser(req);
    
    const updates: any = {};
    if (req.body.character_name) updates.character_name = req.body.character_name;
    if (req.body.character_class !== undefined) updates.character_class = req.body.character_class;
    if (req.body.level !== undefined) updates.level = req.body.level;
    if (req.body.wins !== undefined) updates.wins = req.body.wins;
    if (req.body.losses !== undefined) updates.losses = req.body.losses;
    if (req.body.lifetime_obx_earned !== undefined) {
      updates.lifetime_obx_earned = BigInt(req.body.lifetime_obx_earned);
    }
    if (req.body.lifetime_exp_spent !== undefined) {
      updates.lifetime_exp_spent = BigInt(req.body.lifetime_exp_spent);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No fields to update'
      });
    }

    const updated = await updatePlayer(userId, updates);

    return res.json({
      success: true,
      player: {
        id: updated.id,
        character_name: updated.character_name,
        character_class: updated.character_class,
        level: updated.level,
        wins: updated.wins,
        losses: updated.losses,
        lifetime_obx_earned: updated.lifetime_obx_earned?.toString() || '0',
        lifetime_exp_spent: updated.lifetime_exp_spent?.toString() || '0',
      }
    });

  } catch (error: any) {
    console.error('Error updating player:', error);
    return res.status(500).json({
      error: 'Failed to update player',
      details: error.message
    });
  }
});

export default router;
