// Supabase removed - using PostgreSQL directly
import { pgQuery, pgQuerySingle } from '../utils/pg-helper'
import { ItemService, ItemDefinition } from './item'

export interface PlayerItem {
  id: string
  player_id: string
  item_definition_id: string
  cnft_address: string
  mint_signature: string
  metadata_uri?: string | null
  rarity?: string | null
  item_type?: string | null
  current_durability?: number | null
  found_in_dungeon?: string | null
  found_on_floor?: number | null
  last_traded_at?: string | null
  traded_to_player?: string | null
  withdrawn_to_wallet?: string | null
  withdrawn_at?: string | null
  quantity: number
  minted_at: string
  mint_cost: number
  is_stacked: boolean
  acquisition_source: string
  slot_position?: number | null
}

export interface AwardItemParams {
  playerId: string
  itemId: string
  quantity: number
  source: string
  interactionId?: string
  skillName?: string
}

export class PlayerItemService {
  /**
   * Award item to player
   * Creates a player_items entry linking player to item definition
   */
  static async awardItemToPlayer(params: AwardItemParams): Promise<PlayerItem> {
    const { playerId, itemId, quantity, source, interactionId, skillName } = params
    
    // Verify item definition exists
    const itemDef = await ItemService.getItemDefinition(itemId)
    if (!itemDef) {
      throw new Error(`Item definition "${itemId}" not found`)
    }
    
    if (!itemDef.is_active) {
      throw new Error(`Item "${itemId}" is not active`)
    }
    
    // Check if player already has this item (for stackable items)
    if (itemDef.max_stack_size > 1) {
      // Get ALL stacks of this item (not aggregated)
      const { data: existingStacks, error: stacksError } = await pgQuery(
        'SELECT * FROM player_items WHERE player_id = $1 AND item_definition_id = $2 ORDER BY minted_at DESC',
        [playerId, itemId]
      )
      
      if (stacksError) {
        console.error('❌ Error fetching existing stacks:', stacksError)
      }
      
      if (existingStacks && existingStacks.length > 0) {
        const maxStack = itemDef.max_stack_size
        
        // Find stack with most room (skip if all are full)
        let targetStack = existingStacks.find((stack: any) => {
          const stackQty = stack.quantity || 0
          return stackQty < maxStack
        })
        
        if (targetStack) {
          // Found a stack with room - add to it
          const targetStackId = targetStack.id
          const targetStackQuantity = targetStack.quantity || 0
          const spaceAvailable = maxStack - targetStackQuantity
          const quantityToAdd = Math.min(quantity, spaceAvailable)
          
          if (quantityToAdd > 0) {
            // Add to existing stack by updating that specific stack's quantity
            const { data: updatedStacks, error: updateError } = await pgQuery(
              'UPDATE player_items SET quantity = $1 WHERE id = $2 RETURNING *',
              [targetStackQuantity + quantityToAdd, targetStackId]
            )
            
            if (updateError) {
              console.error('❌ Error updating stack quantity:', updateError)
              throw new Error(`Failed to update stack: ${updateError.message}`)
            }
            
            const updatedStack = updatedStacks && updatedStacks.length > 0 ? updatedStacks[0] : null
            
            if (!updatedStack) {
              throw new Error('Failed to update stack: no data returned')
            }
            
            // If no remaining quantity, return the updated stack
            if (quantityToAdd >= quantity) {
              return updatedStack as PlayerItem
            }
            
            // If there's remaining quantity, continue to create new stack(s)
            const remainingQuantity = quantity - quantityToAdd
            if (remainingQuantity > 0) {
              // Recursively award remaining quantity (will create new stack)
              return await this.awardItemToPlayer({
                playerId,
                itemId,
                quantity: remainingQuantity,
                source,
                interactionId,
                skillName
              })
            }
          }
        }
        // If no stack has room (or all stacks are full), fall through to create new stack below
      }
    }
    
    // Find empty slot for new item (0-29 for inventory, NULL for overflow)
    const { data: slots } = await pgQuery(
      'SELECT slot_position FROM player_items WHERE player_id = $1 AND slot_position IS NOT NULL',
      [playerId]
    )
    
    const usedSlots = new Set((slots || []).map((s: any) => s.slot_position))
    let emptySlot: number | null = null
    
    // Find first empty slot (0-29)
    for (let i = 0; i < 30; i++) {
      if (!usedSlots.has(i)) {
        emptySlot = i
        break
      }
    }
    
    // If no empty slot, item goes to overflow (slot_position = NULL)
    // This allows players to have more than 30 items, but only 30 visible in inventory
    
    // Generate unique CNFT address (placeholder - in production this would mint actual CNFT)
    // For now, use a deterministic ID based on player + item + timestamp
    const cnftAddress = `item_${playerId}_${itemId}_${Date.now()}`
    const mintSignature = `mint_${cnftAddress}`
    
    const playerItem: Omit<PlayerItem, 'id' | 'minted_at'> = {
      player_id: playerId,
      item_definition_id: itemId,
      cnft_address: cnftAddress,
      mint_signature: mintSignature,
      metadata_uri: null,
      rarity: itemDef.rarity,
      item_type: itemDef.item_type,
      current_durability: itemDef.item_type === 'equipment' ? 100 : null,
      found_in_dungeon: null,
      found_on_floor: null,
      last_traded_at: null,
      traded_to_player: null,
      withdrawn_to_wallet: null,
      withdrawn_at: null,
      quantity,
      mint_cost: itemDef.mint_cost_cobx,
      is_stacked: itemDef.max_stack_size > 1,
      acquisition_source: source,
      slot_position: emptySlot // CRITICAL: Set slot position (or NULL for overflow)
    }
    
    const { data, error } = await pgQuery(
      `INSERT INTO player_items (
        player_id, item_definition_id, cnft_address, mint_signature, metadata_uri,
        rarity, item_type, current_durability, found_in_dungeon, found_on_floor,
        last_traded_at, traded_to_player, withdrawn_to_wallet, withdrawn_at,
        quantity, mint_cost, is_stacked, acquisition_source, slot_position, minted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        playerItem.player_id,
        playerItem.item_definition_id,
        playerItem.cnft_address,
        playerItem.mint_signature,
        playerItem.metadata_uri,
        playerItem.rarity,
        playerItem.item_type,
        playerItem.current_durability,
        playerItem.found_in_dungeon,
        playerItem.found_on_floor,
        playerItem.last_traded_at,
        playerItem.traded_to_player,
        playerItem.withdrawn_to_wallet,
        playerItem.withdrawn_at,
        playerItem.quantity,
        playerItem.mint_cost,
        playerItem.is_stacked,
        playerItem.acquisition_source,
        playerItem.slot_position,
        new Date().toISOString()
      ]
    )
    
    if (error) {
      console.error('❌ Error awarding item to player:', error)
      throw new Error(`Failed to award item: ${error.message}`)
    }
    
    if (!data || data.length === 0) {
      throw new Error('Failed to award item: no data returned')
    }
    
    return data[0] as PlayerItem
  }
  
  /**
   * Get all items for a player
   * OPTIMIZED: Order by slot_position (inventory slots) first, then minted_at for overflow
   */
  static async getPlayerItems(playerId: string): Promise<PlayerItem[]> {
    const { data, error } = await pgQuery(
      'SELECT * FROM player_items WHERE player_id = $1 ORDER BY slot_position ASC NULLS LAST, minted_at DESC',
      [playerId]
    )
    
    if (error) {
      console.error('❌ Error fetching player items:', error)
      throw new Error(`Failed to fetch player items: ${error.message}`)
    }
    
    return (data || []) as PlayerItem[]
  }
  
  /**
   * Get specific item for player
   * NOTE: Returns aggregated quantity across all stacks of the same item
   * If player has multiple stacks, returns the first one with summed quantity
   */
  static async getPlayerItem(playerId: string, itemId: string): Promise<PlayerItem | null> {
    const { data, error } = await pgQuery(
      'SELECT * FROM player_items WHERE player_id = $1 AND item_definition_id = $2 ORDER BY minted_at DESC',
      [playerId, itemId]
    )
    
    if (error) {
      console.error('❌ Error fetching player item:', error)
      throw new Error(`Failed to fetch player item: ${error.message}`)
    }
    
    if (!data || data.length === 0) {
      return null
    }
    
    // If only one stack, return it
    if (data.length === 1) {
      return data[0] as PlayerItem
    }
    
    // If multiple stacks, sum quantities and return first stack with total quantity
    const totalQuantity = data.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
    const firstItem = data[0] as PlayerItem
    
    // Return first item but with aggregated quantity
    return {
      ...firstItem,
      quantity: totalQuantity
    }
  }
  
  /**
   * Update item quantity (for stackable items)
   * NOTE: This method works with a SPECIFIC stack, not all stacks
   * If you need to update a specific stack, use updateItemQuantityById instead
   * This method finds the first non-full stack and updates it, or creates a new stack if needed
   */
  static async updateItemQuantity(playerId: string, itemId: string, delta: number): Promise<PlayerItem> {
    // Get ALL stacks (not aggregated) to work with individual stacks
    const { data: existingStacks, error: stacksError } = await pgQuery(
      'SELECT * FROM player_items WHERE player_id = $1 AND item_definition_id = $2 ORDER BY minted_at DESC',
      [playerId, itemId]
    )
    
    if (stacksError) {
      console.error('❌ Error fetching stacks:', stacksError)
      throw new Error(`Failed to fetch item stacks: ${stacksError.message}`)
    }
    
    if (!existingStacks || existingStacks.length === 0) {
      throw new Error(`Player does not have item "${itemId}"`)
    }
    
    // Get item definition to check max stack size
    const itemDef = await ItemService.getItemDefinition(itemId)
    if (!itemDef) {
      throw new Error(`Item definition "${itemId}" not found`)
    }
    
    const maxStack = itemDef.max_stack_size
    
    // If adding (delta > 0), find a stack with room
    if (delta > 0) {
      let targetStack = existingStacks.find((stack: any) => {
        const stackQty = stack.quantity || 0
        return stackQty < maxStack
      })
      
      if (targetStack) {
        // Found a stack with room - add to it
        const targetStackId = targetStack.id
        const targetStackQuantity = targetStack.quantity || 0
        const spaceAvailable = maxStack - targetStackQuantity
        const quantityToAdd = Math.min(delta, spaceAvailable)
        const newQuantity = targetStackQuantity + quantityToAdd
        
        if (newQuantity > maxStack) {
          throw new Error(`Quantity exceeds max stack size of ${maxStack}`)
        }
        
        const { data: updatedStacks, error: updateError } = await pgQuery(
          'UPDATE player_items SET quantity = $1 WHERE id = $2 RETURNING *',
          [newQuantity, targetStackId]
        )
        
        if (updateError) {
          console.error('❌ Error updating stack quantity:', updateError)
          throw new Error(`Failed to update stack: ${updateError.message}`)
        }
        
        if (!updatedStacks || updatedStacks.length === 0) {
          throw new Error('Failed to update stack: no data returned')
        }
        
        const updatedStack = updatedStacks[0]
        
        // If there's remaining quantity, recursively add to new stack(s)
        const remainingDelta = delta - quantityToAdd
        if (remainingDelta > 0) {
          return await this.updateItemQuantity(playerId, itemId, remainingDelta)
        }
        
        return updatedStack as PlayerItem
      } else {
        // All stacks are full - would need to create new stack, but updateItemQuantity doesn't do that
        // This should be handled by awardItemToPlayer instead
        throw new Error(`All stacks are full (max ${maxStack}). Use awardItemToPlayer to create new stacks.`)
      }
    } else {
      // If removing (delta < 0), remove from stacks in reverse order (newest first)
      let remainingToRemove = Math.abs(delta)
      
      for (const stack of existingStacks) {
        const stackQuantity = stack.quantity || 0
        const quantityToRemove = Math.min(remainingToRemove, stackQuantity)
        
        if (quantityToRemove > 0) {
          const newQuantity = stackQuantity - quantityToRemove
          
          if (newQuantity <= 0) {
            // Delete this stack
            await pgQuery(
              'DELETE FROM player_items WHERE id = $1',
              [stack.id]
            )
          } else {
            // Update stack
            await pgQuery(
              'UPDATE player_items SET quantity = $1 WHERE id = $2',
              [newQuantity, stack.id]
            )
          }
          
          remainingToRemove -= quantityToRemove
          
          if (remainingToRemove <= 0) {
            // Return the last updated stack (or first remaining if we deleted it)
            if (newQuantity > 0) {
              const { data: updatedStacks } = await pgQuery(
                'SELECT * FROM player_items WHERE id = $1',
                [stack.id]
              )
              if (!updatedStacks || updatedStacks.length === 0) {
                throw new Error('Failed to fetch updated stack')
              }
              return updatedStacks[0] as PlayerItem
            } else {
              // Return first remaining stack if any
              const remainingStacks = existingStacks.filter((s: any) => s.id !== stack.id && s.quantity > 0)
              if (remainingStacks.length > 0) {
                return remainingStacks[0] as PlayerItem
              }
              throw new Error(`Item "${itemId}" removed from inventory`)
            }
          }
        }
      }
      
      if (remainingToRemove > 0) {
        throw new Error(`Cannot remove ${Math.abs(delta)} items - player only has ${existingStacks.reduce((sum: number, s: PlayerItem) => sum + (s.quantity || 0), 0)}`)
      }
      
      // Should not reach here, but return first stack as fallback
      return existingStacks[0] as PlayerItem
    }
  }
  
  /**
   * Remove items from player inventory
   */
  static async removeItem(playerId: string, itemId: string, quantity: number): Promise<boolean> {
    const existing = await this.getPlayerItem(playerId, itemId)
    if (!existing) {
      return false
    }
    
    if (quantity >= existing.quantity) {
      // Remove entire entry
      const { error } = await pgQuery(
        'DELETE FROM player_items WHERE player_id = $1 AND item_definition_id = $2',
        [playerId, itemId]
      )
      
      if (error) {
        console.error('❌ Error removing item:', error)
        throw new Error(`Failed to remove item: ${error.message}`)
      }
    } else {
      // Update quantity
      await this.updateItemQuantity(playerId, itemId, -quantity)
    }
    
    return true
  }
  
  /**
   * Get player items with item definitions joined
   * OPTIMIZED: Parallel queries - fetch items first, then only needed definitions
   */
  static async getPlayerItemsWithDefinitions(playerId: string): Promise<Array<PlayerItem & { definition: ItemDefinition | null }>> {
    // Step 1: Fetch player items (fast - indexed query)
    const { data: itemsData, error: itemsError } = await pgQuery(
      'SELECT * FROM player_items WHERE player_id = $1 ORDER BY slot_position ASC NULLS LAST, minted_at DESC',
      [playerId]
    )
    
    if (itemsError) {
      console.error('❌ Error fetching player items:', itemsError)
      return []
    }
    
    if (!itemsData || itemsData.length === 0) {
      return []
    }
    
    // Step 2: Extract unique item definition IDs (usually only 1-5 unique items per player)
    const itemDefinitionIds = Array.from(new Set(itemsData.map((item: any) => item.item_definition_id)))
    
    // Step 3: Fetch only the definitions we need (parallel with items query would be ideal, but we need IDs first)
    // OPTIMIZED: Use IN query - very fast with index on item_id
    const placeholders = itemDefinitionIds.map((_, i) => `$${i + 1}`).join(', ');
    const { data: definitions, error: definitionsError } = await pgQuery(
      `SELECT * FROM item_definitions WHERE item_id IN (${placeholders})`,
      itemDefinitionIds
    )
    
    if (definitionsError) {
      console.warn('⚠️ Error fetching item definitions:', definitionsError)
      // Continue without definitions rather than failing
    }
    
    // Build definition map (O(1) lookup)
    const definitionMap = new Map<string, ItemDefinition>()
    if (definitions) {
      definitions.forEach((def: any) => {
        definitionMap.set(def.item_id, def)
      })
    }
    
    // Combine items with definitions (O(n) where n = number of items)
    return itemsData.map((item: any) => ({
      ...item,
      definition: definitionMap.get(item.item_definition_id) || null
    })) as Array<PlayerItem & { definition: any }>
  }
}

