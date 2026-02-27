import { Router } from 'express'
import { z } from 'zod'
import { CraftingService } from '../services/crafting'
// Supabase removed - use PostgreSQL via pg-helper
import { pgQuerySingle, pgQuery } from '../utils/pg-helper'
import { verifyAuthToken } from '../utils/auth-helper'
import { getInventoryVersionService } from '../services/InventoryVersionService'

const router = Router()

// Validation schema
const CraftItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive().default(1)
})

// Helper to authenticate user and get userId
async function authenticateUser(req: any): Promise<{ userId: string; profile: any }> {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header')
  }
  
  const token = authHeader.substring(7)
  const authResult = await verifyAuthToken(token)
  
  if (authResult.error || !authResult.data?.user) {
    throw new Error('Invalid authentication token')
  }
  
  const user = authResult.data.user
  
  // Get profile
  const profileResult = await pgQuerySingle<any>(
    'SELECT * FROM profiles WHERE id = $1',
    [user.id]
  );
  const profile = profileResult.data;
  const profileError = profileResult.error;
  
  if (profileError || !profile) {
    throw new Error('User profile not found')
  }
  
  return { userId: user.id, profile }
}

// POST /api/craft - Craft an item
router.post('/', async (req: any, res: any) => {
  try {
    // Authenticate user
    const { userId } = await authenticateUser(req)
    
    // Validate request
    const { itemId, quantity } = CraftItemSchema.parse(req.body)
    
    // Craft item
    const result = await CraftingService.craftItem(userId, itemId, quantity)
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      })
    }
    
    // Get updated inventory immediately for real-time UI update
    const { PlayerItemService } = await import('../services/player-items')
    const updatedInventory = await PlayerItemService.getPlayerItemsWithDefinitions(userId)
    const inventoryVersion = await getInventoryVersionService().getVersion(userId)
    
    return res.json({
      success: true,
      craftedItem: result.craftedItem,
      inventory: updatedInventory, // Return full updated inventory for instant UI update
      inventoryVersion
    })
  } catch (error) {
    console.error('❌ Craft endpoint error:', error)
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      })
    }
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Crafting failed'
    })
  }
})

export default router

