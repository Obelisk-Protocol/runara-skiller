import { Router } from 'express'
import { z } from 'zod'
// Supabase removed - use PostgreSQL via pg-helper
import { pgQuerySingle, pgQuery } from '../utils/pg-helper'
import { ItemService } from '../services/item'

const router = Router()

// URL field: accept empty string as null, valid URL, or any non-empty path string
const urlOrPathField = z
  .union([z.string().url(), z.string().min(1), z.literal('')])
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === undefined ? null : v))

// Validation schemas
const CreateItemSchema = z.object({
  item_id: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/, 'Item ID must be lowercase alphanumeric with hyphens/underscores'),
  name: z.string().min(1).max(200),
  description: z.string().max(1000),
  item_type: z.enum(['material', 'equipment', 'consumable']),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
  base_properties: z.record(z.any()),
  image_url: urlOrPathField,
  animation_url: urlOrPathField,
  icon_url: urlOrPathField,
  ground_sprite_url: urlOrPathField,
  in_use_sprite_url: urlOrPathField,
  in_use_animation_config: z.record(z.any()).optional().nullable(),
  craft_recipe: z.record(z.any()).optional().nullable(),
  max_floor_level: z.number().int().positive().optional().nullable(),
  base_drop_rate: z.coerce.number().min(0).max(1).default(0.0001),
  is_craftable: z.boolean().default(false),
  max_stack_size: z.coerce.number().int().positive().default(1),
  min_floor_level: z.coerce.number().int().positive().default(1),
  mint_cost_cobx: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  // Placeable item fields
  is_placeable: z.boolean().default(false).optional(),
  placeable_category: z.enum(['building', 'crafting', 'decoration', 'storage', 'furniture', 'structure']).optional().nullable(),
  placement_metadata: z.record(z.any()).optional().nullable()
})

const UpdateItemSchema = CreateItemSchema.partial().extend({
  item_id: z.string().min(1) // Required for identification but not updated
})

const SpriteLinkSchema = z.object({
  sprite_type: z.enum(['inventory', 'ground', 'in_use']),
  sprite_url: z.string().url(),
  sprite_asset_id: z.string().optional(),
  animation_config: z.record(z.any()).optional()
})

// GET /api/items - List all items with optional filters
router.get('/', async (req: any, res: any) => {
  try {
    const { type, rarity, search, is_active, is_placeable, placeable_category } = req.query
    
    const filters: any = {}
    if (type) filters.item_type = type
    if (rarity) filters.rarity = rarity
    if (is_active !== undefined) filters.is_active = is_active === 'true'
    if (is_placeable !== undefined) filters.is_placeable = is_placeable === 'true'
    if (placeable_category) filters.placeable_category = placeable_category
    
    const items = await ItemService.getItemDefinitions({
      filters,
      search: search as string | undefined
    })
    
    return res.json({
      success: true,
      items,
      count: items.length
    })
  } catch (error) {
    console.error('❌ Get items error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch items'
    })
  }
})

// GET /api/items/:itemId - Get specific item
router.get('/:itemId', async (req: any, res: any) => {
  try {
    const { itemId } = req.params
    
    const item = await ItemService.getItemDefinition(itemId)
    
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      })
    }
    
    return res.json({
      success: true,
      item
    })
  } catch (error) {
    console.error('❌ Get item error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch item'
    })
  }
})

// POST /api/items - Create new item
router.post('/', async (req: any, res: any) => {
  try {
    const itemData = CreateItemSchema.parse(req.body)
    
    // Check if item already exists
    const existing = await ItemService.getItemDefinition(itemData.item_id)
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `Item with ID "${itemData.item_id}" already exists`
      })
    }
    
    const item = await ItemService.createItemDefinition(itemData)
    
    return res.status(201).json({
      success: true,
      item
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
      return res.status(400).json({
        success: false,
        error: messages.length > 0 ? messages.join('; ') : 'Validation error',
        details: error.errors
      })
    }
    console.error('❌ Create item error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create item'
    })
  }
})

// PUT /api/items/:itemId - Update item
router.put('/:itemId', async (req: any, res: any) => {
  try {
    const { itemId } = req.params
    const updateData = UpdateItemSchema.parse(req.body)
    
    // Ensure item_id in body matches path param
    if (updateData.item_id && updateData.item_id !== itemId) {
      return res.status(400).json({
        success: false,
        error: 'Item ID in body must match path parameter'
      })
    }
    
    const item = await ItemService.updateItemDefinition(itemId, updateData)
    
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      })
    }
    
    return res.json({
      success: true,
      item
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
      return res.status(400).json({
        success: false,
        error: messages.length > 0 ? messages.join('; ') : 'Validation error',
        details: error.errors
      })
    }
    console.error('❌ Update item error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update item'
    })
  }
})

// DELETE /api/items/:itemId - Soft delete item
router.delete('/:itemId', async (req: any, res: any) => {
  try {
    const { itemId } = req.params
    
    const deleted = await ItemService.deleteItemDefinition(itemId)
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      })
    }
    
    return res.json({
      success: true,
      message: 'Item deleted successfully'
    })
  } catch (error) {
    console.error('❌ Delete item error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete item'
    })
  }
})

// POST /api/items/:itemId/sprites - Link sprite to item
router.post('/:itemId/sprites', async (req: any, res: any) => {
  try {
    const { itemId } = req.params
    const spriteData = SpriteLinkSchema.parse(req.body)
    
    const item = await ItemService.linkItemSprite(itemId, spriteData.sprite_type, {
      url: spriteData.sprite_url,
      asset_id: spriteData.sprite_asset_id,
      animation_config: spriteData.animation_config
    })
    
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      })
    }
    
    return res.json({
      success: true,
      item
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      })
    }
    console.error('❌ Link sprite error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to link sprite'
    })
  }
})

// GET /api/items/:itemId/sprites - Get all sprites for item
router.get('/:itemId/sprites', async (req: any, res: any) => {
  try {
    const { itemId } = req.params
    
    const item = await ItemService.getItemDefinition(itemId)
    
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      })
    }
    
    const sprites = {
      inventory: item.icon_url ? {
        url: item.icon_url,
        asset_id: undefined // Could be stored separately if needed
      } : null,
      ground: item.ground_sprite_url ? {
        url: item.ground_sprite_url,
        asset_id: undefined
      } : null,
      in_use: item.in_use_sprite_url ? {
        url: item.in_use_sprite_url,
        animation_config: item.in_use_animation_config || null,
        asset_id: undefined
      } : null
    }
    
    return res.json({
      success: true,
      sprites
    })
  } catch (error) {
    console.error('❌ Get sprites error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch sprites'
    })
  }
})

export default router

