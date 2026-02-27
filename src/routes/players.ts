import { Router } from 'express';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { program, connection, serverKeypair, PROGRAM_ID, getCobxMint, createWeb2IdHash } from '../config/anchor';
import { createHash } from 'crypto';
import { PlayerItemService } from '../services/player-items';
import { z } from 'zod';
import { pgQuerySingle, pgQuery, pgRpc } from '../utils/pg-helper';
import { authenticateUser } from '../utils/auth-helper';
import { getFeatureFlags } from '../services/FeatureFlags';
import { getInventoryVersionService } from '../services/InventoryVersionService';

const router = Router();
const FLAG_BLOCK_CLIENT_INVENTORY = 'FF_BLOCK_CLIENT_INVENTORY';

const requireInternalInventoryAuth = (req: any, res: any): boolean => {
  if (!getFeatureFlags().isEnabled(FLAG_BLOCK_CLIENT_INVENTORY, false)) {
    return true;
  }
  const token = process.env.SKILLER_INTERNAL_TOKEN;
  const header = req.get('x-internal-token');
  if (!token || !header || header !== token) {
    res.status(403).json({ success: false, error: 'Inventory mutation is restricted to server calls' });
    return false;
  }
  return true;
};

// DELETED: /initialize-web2 - Use /api/players/initialize instead (off-chain, no PDAs)
// DELETED: /initialize-web3 - Use /api/players/initialize instead (off-chain, no PDAs)
// DELETED: /initialize-web3-direct - Use /api/players/initialize instead (off-chain, no PDAs)

// POST /api/players/initialize-config - Initialize Anchor program config (Admin)
router.post('/initialize-config', async (req: any, res: any) => {
  try {
    // Note: Add admin check here if needed
    console.log('⚙️ INITIALIZE CONFIG: Starting config initialization...');

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    console.log('📍 INITIALIZE CONFIG: Config PDA:', configPda.toString());

    const configAccountInfo = await connection.getAccountInfo(configPda);
    if (configAccountInfo) {
      console.log('⚠️ INITIALIZE CONFIG: Config already exists!');
      return res.json({
        message: 'Config already initialized',
        configAddress: configPda.toString(),
        alreadyExists: true
      });
    }

    console.log('🚀 INITIALIZE CONFIG: Initializing config...');

    const tx = await program.methods
      .initializeConfig()
      .accounts({
        config: configPda,
        admin: serverKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([serverKeypair])
      .rpc();

    console.log('✅ INITIALIZE CONFIG: Config initialized successfully!');
    console.log('📋 INITIALIZE CONFIG: Transaction:', tx);

    return res.json({
      success: true,
      message: 'Config initialized successfully',
      transaction: tx,
      configAddress: configPda.toString(),
      nextStep: 'Now you can initialize the vault'
    });

  } catch (error: any) {
    console.error('❌ INITIALIZE CONFIG: Error:', error);
    return res.status(500).json({
      error: 'Failed to initialize config',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/players/initialize-config - Check config status
router.get('/initialize-config', async (req: any, res: any) => {
  try {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const configAccountInfo = await connection.getAccountInfo(configPda);

    return res.json({
      configAddress: configPda.toString(),
      exists: !!configAccountInfo,
      info: configAccountInfo ? 'Config exists' : 'Config not initialized'
    });

  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to check config status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/players/:playerId/items - Get all items for a player
router.get('/:playerId/items', async (req: any, res: any) => {
  try {
    console.log('📦 GET /api/players/:playerId/items - Request received:', {
      playerId: req.params.playerId,
      query: req.query,
      url: req.url
    })
    
    const { playerId } = req.params
    const includeDefinitions = req.query.include_definitions === 'true'
    
    // OPTIMIZED: If playerId is already a UUID, skip profile lookup and use it directly
    // This saves one database query for the common case (client sends userId)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    let actualUserId: string
    
    if (uuidPattern.test(playerId)) {
      // It's a UUID - trust it and use directly (saves profile lookup query)
      actualUserId = playerId
    } else {
      // It's a player_pda - need to look up profile
      const { Client } = await import('pg');
      const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      
      try {
        await client.connect();
        const result = await client.query(
          'SELECT id FROM profiles WHERE player_pda = $1',
          [playerId]
        );
        
        if (result.rows.length === 0) {
          console.log('❌ Player not found:', { playerId });
          return res.status(404).json({
            success: false,
            error: 'Player not found'
          });
        }
        
        actualUserId = result.rows[0].id;
      } finally {
        await client.end();
      }
    }
    
    // Fetch items directly (no profile lookup needed for UUIDs)
    let items
    if (includeDefinitions) {
      items = await PlayerItemService.getPlayerItemsWithDefinitions(actualUserId)
    } else {
      items = await PlayerItemService.getPlayerItems(actualUserId)
    }
    
    console.log('✅ Items fetched:', { count: items.length })
    
    return res.json({
      success: true,
      items,
      inventoryVersion: await getInventoryVersionService().getVersion(actualUserId)
    })
  } catch (error) {
    console.error('❌ Get player items error:', error)
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch player items'
    })
  }
})

// POST /api/players/:playerId/inventory/move - Move items between inventory slots
// OPTIMIZED: Uses database function for atomic operation (1 query vs 5-10 queries)
router.post('/:playerId/inventory/move', async (req: any, res: any) => {
  try {
    if (!requireInternalInventoryAuth(req, res)) {
      return;
    }
    const { playerId } = req.params
    const { from_slot, to_slot, quantity } = req.body

    console.log(`📦 [inventory/move] Request received:`, { playerId, from_slot, to_slot, quantity })

    if (typeof from_slot !== 'number' || typeof to_slot !== 'number' || typeof quantity !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: from_slot, to_slot, and quantity must be numbers'
      })
    }

    // Validate slot range
    if (from_slot < 0 || from_slot >= 30 || to_slot < 0 || to_slot >= 30) {
      return res.status(400).json({
        success: false,
        error: 'Invalid slot range. Slots must be 0-29.'
      })
    }

    // playerId can be either:
    // 1. player_pda (Solana PDA) - from client requests with player_pda
    // 2. userId (Supabase UUID) - from chunk server and client requests with userId
    // Try to find profile by either identifier
    let profile: any = null
    let profileError: any = null
    
    // First, try as UUID (chunk server and client send userId)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidPattern.test(playerId)) {
      // It's a UUID - look up by id directly
      const result = await pgQuerySingle<{ id: string }>(
        'SELECT id FROM profiles WHERE id = $1',
        [playerId]
      )
      
      profile = result.data
      profileError = result.error
    }
    
    // If not found as UUID, try as player_pda
    if (!profile && profileError) {
      const result = await pgQuerySingle<{ id: string }>(
        'SELECT id FROM profiles WHERE player_pda = $1',
        [playerId]
      )
      
      profile = result.data
      profileError = result.error
    }
    
    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      })
    }

    // Use optimized database function (atomic operation, single query)
    const rpcResult = await pgRpc<{ success: boolean }>('move_inventory_item', {
      p_player_id: profile.id,
      p_from_slot: from_slot,
      p_to_slot: to_slot,
      p_quantity: quantity
    })
    
    const result = rpcResult.data
    const moveError = rpcResult.error

    if (moveError) {
      console.error('❌ [inventory/move] Database function error:', moveError)
      return res.status(400).json({
        success: false,
        error: moveError.message || 'Failed to move item'
      })
    }

    if (!result || !result.success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to move item'
      })
    }

    console.log(`✅ [inventory/move] Move completed:`, result)
    const inventoryVersion = await getInventoryVersionService().bumpVersion(profile.id)

    // Return updated inventory (ordered by slot_position)
    const items = await PlayerItemService.getPlayerItemsWithDefinitions(profile.id)
    
    return res.json({
      success: true,
      result,
      inventoryVersion,
      items: items
        .filter(item => item.slot_position !== null && item.slot_position !== undefined)
        .sort((a, b) => (a.slot_position || 999) - (b.slot_position || 999))
    })
  } catch (error) {
    console.error('❌ Inventory move error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to move item'
    })
  }
})

// DELETE /api/players/:playerId/inventory/clear - Clear all items from player inventory (dev/testing)
router.delete('/:playerId/inventory/clear', async (req: any, res: any) => {
  try {
    if (!requireInternalInventoryAuth(req, res)) {
      return;
    }
    const { playerId } = req.params

    // playerId can be either UUID or player_pda
    let profile: any = null
    let profileError: any = null
    
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidPattern.test(playerId)) {
      const { data, error } = await pgQuerySingle(
        'SELECT id FROM profiles WHERE id = $1',
        [playerId]
      )
      
      profile = data
      profileError = error
    }
    
    if (!profile && profileError) {
      const { data, error } = await pgQuerySingle(
        'SELECT id FROM profiles WHERE player_pda = $1',
        [playerId]
      )
      
      profile = data
      profileError = error
    }
    
    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      })
    }

    // Delete all items for this player
    const { error: deleteError } = await pgQuery(
      'DELETE FROM player_items WHERE player_id = $1',
      [profile.id]
    )
    
    if (deleteError) {
      console.error('❌ Error clearing inventory:', deleteError)
      return res.status(500).json({
        success: false,
        error: deleteError.message || 'Failed to clear inventory'
      })
    }

    console.log(`✅ [inventory/clear] Cleared all items for player ${profile.id}`)
    const inventoryVersion = await getInventoryVersionService().bumpVersion(profile.id)
    
    return res.json({
      success: true,
      message: 'Inventory cleared successfully',
      playerId: profile.id,
      inventoryVersion
    })
  } catch (error) {
    console.error('❌ Clear inventory error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear inventory'
    })
  }
})

// POST /api/players/:playerId/items/award - Award item to player (server-to-server)
router.post('/:playerId/items/award', async (req: any, res: any) => {
  try {
    if (!requireInternalInventoryAuth(req, res)) {
      return;
    }
    const { playerId } = req.params
    const schema = z.object({
      itemId: z.string().min(1),
      quantity: z.number().int().positive().default(1),
      source: z.string().optional().default('game_reward'),
      interactionId: z.string().optional()
    })
    
    const { itemId, quantity, source, interactionId } = schema.parse(req.body)
    
    // playerId can be either:
    // 1. player_pda (Solana PDA) - from client requests
    // 2. userId (Supabase UUID) - from chunk server
    // Try to find profile by either identifier
    let profile: any = null
    let profileError: any = null
    
    // First, try as UUID (chunk server sends userId)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidPattern.test(playerId)) {
      // It's a UUID - look up by id directly
      const result = await pgQuerySingle<{ id: string }>(
        'SELECT id FROM profiles WHERE id = $1',
        [playerId]
      )
      
      profile = result.data
      profileError = result.error
    }
    
    // If not found as UUID, try as player_pda
    if (!profile && profileError) {
      const result = await pgQuerySingle<{ id: string }>(
        'SELECT id FROM profiles WHERE player_pda = $1',
        [playerId]
      )
      
      profile = result.data
      profileError = result.error
    }
    
    if (profileError || !profile) {
      console.error(`❌ Player not found for identifier: ${playerId}`, profileError)
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      })
    }
    
    const playerItem = await PlayerItemService.awardItemToPlayer({
      playerId: profile.id,
      itemId,
      quantity,
      source: source || 'game_reward',
      interactionId
    })
    const inventoryVersion = await getInventoryVersionService().getVersion(profile.id)
    
    return res.json({
      success: true,
      item: playerItem,
      inventoryVersion
    })
  } catch (error) {
    console.error('❌ Award item error:', error)
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to award item'
    })
  }
})

export default router;
