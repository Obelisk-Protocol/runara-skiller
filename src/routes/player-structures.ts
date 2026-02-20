import { Router } from 'express'
import { z } from 'zod'
import { PlayerStructureService } from '../services/player-structure'
// Supabase removed - use PostgreSQL via pg-helper
import { pgQuerySingle, pgQuery } from '../utils/pg-helper'

const router = Router()

// Use shared auth helper
import { authenticateUser } from '../utils/auth-helper';

// Validation schemas
const PlaceStructureSchema = z.object({
  playerId: z.string().uuid(),
  itemId: z.string().min(1),
  chunkX: z.number().int(),
  chunkY: z.number().int(),
  x: z.number().int().min(0).max(2047),
  y: z.number().int().min(0).max(2047),
  rotation: z.number().min(0).max(360).optional(),
  scale: z.number().min(0.1).max(5).optional(),
  properties: z.record(z.any()).optional()
})

const DestroyStructureSchema = z.object({
  returnItem: z.boolean().optional(),
  playerId: z.string().uuid().optional()
})

const UpdateStructureSchema = z.object({
  rotation: z.number().min(0).max(360).optional(),
  scale: z.number().min(0.1).max(5).optional(),
  health: z.number().int().min(0).optional(),
  max_health: z.number().int().min(1).optional(),
  properties: z.record(z.any()).optional()
})

// POST /api/player-structures/place - Place a structure
router.post('/place', async (req: any, res: any) => {
  try {
    // Authenticate user
    const { userId } = await authenticateUser(req).catch(() => {
      // For server-to-server calls, allow playerId in body
      return { userId: req.body.playerId }
    })

    const params = PlaceStructureSchema.parse({
      ...req.body,
      playerId: userId || req.body.playerId
    })

    const structure = await PlayerStructureService.placeStructure(params)

    return res.status(201).json({
      success: true,
      structure
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      })
    }

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('not placeable')) {
        return res.status(400).json({
          success: false,
          error: 'ITEM_NOT_PLACEABLE',
          message: error.message
        })
      }
      if (error.message.includes('does not own')) {
        return res.status(403).json({
          success: false,
          error: 'ITEM_NOT_OWNED',
          message: error.message
        })
      }
      if (error.message.includes('collision') || error.message.includes('occupied')) {
        return res.status(400).json({
          success: false,
          error: 'COLLISION_DETECTED',
          message: error.message
        })
      }
      if (error.message.includes('bounds')) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_POSITION',
          message: error.message
        })
      }
      if (error.message.includes('Unauthorized')) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: error.message
        })
      }
    }

    console.error('❌ Place structure error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to place structure'
    })
  }
})

// GET /api/player-structures/chunk/:x/:y - Get structures for chunk
router.get('/chunk/:x/:y', async (req: any, res: any) => {
  try {
    const chunkX = parseInt(req.params.x, 10)
    const chunkY = parseInt(req.params.y, 10)

    if (isNaN(chunkX) || isNaN(chunkY)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid chunk coordinates'
      })
    }

    const structures = await PlayerStructureService.getStructuresForChunk(chunkX, chunkY)

    // Convert to PlacedObject format for chunk merging
    const placedObjects: any[] = []
    for (const structure of structures) {
      const obj = await PlayerStructureService.convertToPlacedObject(structure)
      if (obj) {
        placedObjects.push(obj)
      }
    }

    return res.json({
      success: true,
      structures,
      placedObjects, // For chunk server
      count: structures.length
    })
  } catch (error) {
    console.error('❌ Get structures for chunk error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch structures'
    })
  }
})

// GET /api/player-structures/:id - Get specific structure
router.get('/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params

    const structure = await PlayerStructureService.getStructure(id)

    if (!structure) {
      return res.status(404).json({
        success: false,
        error: 'Structure not found'
      })
    }

    return res.json({
      success: true,
      structure
    })
  } catch (error) {
    console.error('❌ Get structure error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch structure'
    })
  }
})

// DELETE /api/player-structures/:id - Destroy structure
router.delete('/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params

    // Authenticate user (optional - for ownership checks)
    let playerId: string | undefined
    try {
      const { userId } = await authenticateUser(req)
      playerId = userId
    } catch {
      // Allow server-to-server calls without auth
      playerId = req.body.playerId
    }

    const options = DestroyStructureSchema.parse(req.body || {})

    const destroyed = await PlayerStructureService.destroyStructure(id, {
      ...options,
      playerId: playerId || options.playerId
    })

    return res.json({
      success: true,
      destroyed,
      itemReturned: options.returnItem || false
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      })
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      })
    }

    console.error('❌ Destroy structure error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to destroy structure'
    })
  }
})

// PUT /api/player-structures/:id - Update structure
router.put('/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params
    const updates = UpdateStructureSchema.parse(req.body)

    const structure = await PlayerStructureService.updateStructure(id, updates)

    return res.json({
      success: true,
      structure
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      })
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      })
    }

    console.error('❌ Update structure error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update structure'
    })
  }
})

export default router

