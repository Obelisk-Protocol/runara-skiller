import { pgQuerySingle, pgQuery } from '../utils/pg-helper'
import { PlayerStructure, PlaceStructureParams, DestroyOptions } from '../types/player-structure'
import { ItemService } from './item'
import { PlayerItemService } from './player-items'

/**
 * Service for managing player-placed structures (Layer 3)
 */
export class PlayerStructureService {
  /**
   * Place a structure in the world
   */
  static async placeStructure(params: PlaceStructureParams): Promise<PlayerStructure> {
    const {
      playerId,
      itemId,
      chunkX,
      chunkY,
      x,
      y,
      rotation = 0,
      scale = 1,
      properties = {}
    } = params

    // Validate position
    if (x < 0 || x >= 2048 || y < 0 || y >= 2048) {
      throw new Error('Position must be within chunk bounds (0-2047)')
    }

    // Verify item exists and is placeable
    const itemDef = await ItemService.getItemDefinition(itemId)
    if (!itemDef) {
      throw new Error(`Item definition "${itemId}" not found`)
    }

    if (!itemDef.is_placeable) {
      throw new Error(`Item "${itemId}" is not placeable`)
    }

    // Check if player owns the item
    const playerItem = await PlayerItemService.getPlayerItem(playerId, itemId)
    if (!playerItem || playerItem.quantity < 1) {
      throw new Error(`Player does not own item "${itemId}"`)
    }

    // Check for collision (basic - just check if position is already occupied)
    const hasCollision = await this.checkCollision(chunkX, chunkY, x, y, 64, 64) // Default 64x64 size
    if (hasCollision) {
      throw new Error('Cannot place structure here - collision detected')
    }

    // Get player profile for name
    const profileResult = await pgQuerySingle<{ character_name?: string; username?: string }>(
      'SELECT character_name, username FROM profiles WHERE id = $1',
      [playerId]
    )

    const profile = profileResult.data
    const placedByName = profile?.character_name || profile?.username || 'Unknown'

    // Determine structure type from item definition
    const structureType = itemDef.placeable_category || 'decoration'

    // Get collision bounds from item definition or use defaults
    const collisionBounds = itemDef.base_properties?.collision_bounds || null
    const hasCollisionFlag = itemDef.base_properties?.collision !== false

    // Create structure
    const insertValues = [
      chunkX,
      chunkY,
      x,
      y,
      itemId,
      structureType,
      rotation,
      scale,
      itemDef.base_properties?.z_layer || 'mid',
      itemDef.base_properties?.z_offset || 0,
      hasCollisionFlag,
      collisionBounds ? JSON.stringify(collisionBounds) : null,
      properties ? JSON.stringify(properties) : null,
      itemDef.base_properties?.max_health || 100,
      itemDef.base_properties?.max_health || 100,
      playerId,
      placedByName
    ]
    
    const result = await pgQuerySingle<PlayerStructure>(
      `INSERT INTO player_structures (
        chunk_x, chunk_y, x, y, item_definition_id, structure_type,
        rotation, scale, z_layer, z_offset, collision, collision_bounds,
        properties, health, max_health, placed_by_player_id, placed_by_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      insertValues
    )

    if (result.error) {
      console.error('❌ Error placing structure:', result.error)
      
      // Handle unique constraint violation (overlapping structures)
      const errorMessage = result.error.message || ''
      if (errorMessage.includes('duplicate key value violates unique constraint') || 
          errorMessage.includes('23505')) {
        throw new Error('Cannot place structure here - position already occupied')
      }
      
      throw new Error(`Failed to place structure: ${result.error.message}`)
    }
    
    const data = result.data
    if (!data) {
      throw new Error('Failed to place structure: No data returned')
    }

    // Remove item from player inventory
    await PlayerItemService.removeItem(playerId, itemId, 1)

    console.log(`✅ Structure placed: ${data.id} at chunk (${chunkX}, ${chunkY}) position (${x}, ${y})`)

    return data as PlayerStructure
  }

  /**
   * Get all active structures for a chunk
   */
  static async getStructuresForChunk(chunkX: number, chunkY: number): Promise<PlayerStructure[]> {
    const result = await pgQuery<PlayerStructure>(
      'SELECT * FROM player_structures WHERE chunk_x = $1 AND chunk_y = $2 AND destroyed_at IS NULL ORDER BY placed_at ASC',
      [chunkX, chunkY]
    )

    if (result.error) {
      console.error(`❌ Error fetching structures for chunk (${chunkX}, ${chunkY}):`, result.error)
      throw new Error(`Failed to fetch structures: ${result.error.message}`)
    }

    return (result.data || []) as PlayerStructure[]
  }

  /**
   * Get structure by ID
   */
  static async getStructure(id: string): Promise<PlayerStructure | null> {
    const result = await pgQuerySingle<PlayerStructure>(
      'SELECT * FROM player_structures WHERE id = $1',
      [id]
    )

    if (result.error) {
      if (result.error.message === 'No rows returned') {
        return null
      }
      console.error('❌ Error fetching structure:', result.error)
      throw new Error(`Failed to fetch structure: ${result.error.message}`)
    }

    return result.data as PlayerStructure
  }

  /**
   * Destroy a structure (soft delete)
   */
  static async destroyStructure(id: string, options?: DestroyOptions): Promise<boolean> {
    const { returnItem = false, playerId } = options || {}

    // Get structure
    const structure = await this.getStructure(id)
    if (!structure) {
      throw new Error('Structure not found')
    }

    if (structure.destroyed_at) {
      throw new Error('Structure already destroyed')
    }

    // Soft delete
    const result = await pgQuery(
      'UPDATE player_structures SET destroyed_at = $1 WHERE id = $2',
      [new Date().toISOString(), id]
    )

    if (result.error) {
      console.error('❌ Error destroying structure:', result.error)
      throw new Error(`Failed to destroy structure: ${result.error.message}`)
    }

    // Optionally return item to inventory
    if (returnItem && playerId) {
      try {
        await PlayerItemService.awardItemToPlayer({
          playerId,
          itemId: structure.item_definition_id,
          quantity: 1,
          source: 'structure_destroyed'
        })
        console.log(`✅ Item returned to player inventory: ${structure.item_definition_id}`)
      } catch (err) {
        console.warn('⚠️ Failed to return item to inventory:', err)
        // Don't fail the destroy operation if item return fails
      }
    }

    console.log(`✅ Structure destroyed: ${id}`)
    return true
  }

  /**
   * Update structure properties
   */
  static async updateStructure(
    id: string,
    updates: Partial<Pick<PlayerStructure, 'health' | 'max_health' | 'properties'>>
  ): Promise<PlayerStructure> {
    const updateKeys = Object.keys(updates).filter(key => updates[key as keyof typeof updates] !== undefined);
    const updateValues = updateKeys.map(key => {
      const value = updates[key as keyof typeof updates];
      // Handle JSON fields
      if (key === 'properties' && typeof value === 'object') {
        return JSON.stringify(value);
      }
      return value;
    });
    
    const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    
    const result = await pgQuerySingle<PlayerStructure>(
      `UPDATE player_structures SET ${setClause} WHERE id = $${updateKeys.length + 1} AND destroyed_at IS NULL RETURNING *`,
      [...updateValues, id]
    )

    if (result.error) {
      if (result.error.message === 'No rows returned') {
        throw new Error('Structure not found or already destroyed')
      }
      console.error('❌ Error updating structure:', result.error)
      throw new Error(`Failed to update structure: ${result.error.message}`)
    }

    return result.data as PlayerStructure
  }

  /**
   * Check for collision at position (simple bounding box check)
   */
  static async checkCollision(
    chunkX: number,
    chunkY: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<boolean> {
    // Check for active structures at this position
    // For now, simple point check - can be enhanced with bounding box intersection
    const result = await pgQuery<{ id: string }>(
      'SELECT id FROM player_structures WHERE chunk_x = $1 AND chunk_y = $2 AND x = $3 AND y = $4 AND destroyed_at IS NULL LIMIT 1',
      [chunkX, chunkY, x, y]
    )

    if (result.error) {
      console.error('❌ Error checking collision:', result.error)
      return false // Fail open - allow placement if check fails
    }

    return (result.data || []).length > 0
  }

  /**
   * Convert player structure to PlacedObject format (for chunk merging)
   */
  static async convertToPlacedObject(structure: PlayerStructure): Promise<any> {
    // Load item definition
    const itemDef = await ItemService.getItemDefinition(structure.item_definition_id)
    if (!itemDef) {
      console.warn(`Item definition not found for structure: ${structure.item_definition_id}`)
      return null
    }

    // Get dimensions from item definition or use defaults
    const width = itemDef.base_properties?.width || 64
    const height = itemDef.base_properties?.height || 64

    // Build PlacedObject format
    return {
      id: structure.id,
      type: structure.item_definition_id,
      name: itemDef.name,
      x: structure.x,
      y: structure.y,
      width,
      height,
      rotation: structure.rotation,
      scale: structure.scale,
      zIndex: 0,
      zLayer: structure.z_layer || 'mid',
      zOffset: structure.z_offset,
      collision: structure.collision,
      interaction: false, // Player structures are not interactive by default
      properties: {
        ...structure.properties,
        // Include structure metadata
        image: itemDef.ground_sprite_url || itemDef.icon_url || itemDef.image_url,
        structureId: structure.id,
        structureType: structure.structure_type,
        health: structure.health,
        maxHealth: structure.max_health,
        placedBy: structure.placed_by_name || 'Unknown',
        placedAt: structure.placed_at
      },
      metadata: {
        name: itemDef.name,
        description: itemDef.description,
        rarity: itemDef.rarity,
        value: 0,
        durability: structure.health,
        maxDurability: structure.max_health,
        enchantments: []
      }
    }
  }
}

