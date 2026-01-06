import { supabase } from '../config/database'
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
      const existing = await this.getPlayerItem(playerId, itemId)
      if (existing) {
        const currentQuantity = existing.quantity
        const maxStack = itemDef.max_stack_size
        const totalAfterAdd = currentQuantity + quantity
        
        if (totalAfterAdd <= maxStack) {
          // Fits in existing stack
          return await this.updateItemQuantity(playerId, itemId, quantity)
        } else {
          // Overflow - fill existing stack and create new one(s)
          const remainingInStack = maxStack - currentQuantity
          await this.updateItemQuantity(playerId, itemId, remainingInStack)
          
          // Recursively award remaining quantity (will create new stack)
          return await this.awardItemToPlayer({
            playerId,
            itemId,
            quantity: quantity - remainingInStack,
            source,
            interactionId,
            skillName
          })
        }
      }
    }
    
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
      acquisition_source: source
    }
    
    const { data, error } = await supabase
      .from('player_items')
      .insert({
        ...playerItem,
        minted_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) {
      console.error('❌ Error awarding item to player:', error)
      throw new Error(`Failed to award item: ${error.message}`)
    }
    
    return data as PlayerItem
  }
  
  /**
   * Get all items for a player
   * OPTIMIZED: Order by slot_position (inventory slots) first, then minted_at for overflow
   */
  static async getPlayerItems(playerId: string): Promise<PlayerItem[]> {
    const { data, error } = await supabase
      .from('player_items')
      .select('*')
      .eq('player_id', playerId)
      .order('slot_position', { ascending: true, nullsFirst: false })
      .order('minted_at', { ascending: false })
    
    if (error) {
      console.error('❌ Error fetching player items:', error)
      throw new Error(`Failed to fetch player items: ${error.message}`)
    }
    
    return (data || []) as PlayerItem[]
  }
  
  /**
   * Get specific item for player
   */
  static async getPlayerItem(playerId: string, itemId: string): Promise<PlayerItem | null> {
    const { data, error } = await supabase
      .from('player_items')
      .select('*')
      .eq('player_id', playerId)
      .eq('item_definition_id', itemId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('❌ Error fetching player item:', error)
      throw new Error(`Failed to fetch player item: ${error.message}`)
    }
    
    return data as PlayerItem
  }
  
  /**
   * Update item quantity (for stackable items)
   */
  static async updateItemQuantity(playerId: string, itemId: string, delta: number): Promise<PlayerItem> {
    const existing = await this.getPlayerItem(playerId, itemId)
    if (!existing) {
      throw new Error(`Player does not have item "${itemId}"`)
    }
    
    const newQuantity = existing.quantity + delta
    if (newQuantity <= 0) {
      // Remove item if quantity reaches 0 or below
      await this.removeItem(playerId, itemId, existing.quantity)
      // Throw error to indicate the operation resulted in removal
      throw new Error(`Item quantity cannot be negative or zero. Item removed from inventory.`)
    }
    
    // Get item definition to check max stack size
    const itemDef = await ItemService.getItemDefinition(itemId)
    if (itemDef && newQuantity > itemDef.max_stack_size) {
      throw new Error(`Quantity exceeds max stack size of ${itemDef.max_stack_size}`)
    }
    
    const { data, error } = await supabase
      .from('player_items')
      .update({ quantity: newQuantity })
      .eq('player_id', playerId)
      .eq('item_definition_id', itemId)
      .select()
      .single()
    
    if (error) {
      console.error('❌ Error updating item quantity:', error)
      throw new Error(`Failed to update item quantity: ${error.message}`)
    }
    
    return data as PlayerItem
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
      const { error } = await supabase
        .from('player_items')
        .delete()
        .eq('player_id', playerId)
        .eq('item_definition_id', itemId)
      
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
   * OPTIMIZED: Uses Supabase foreign key join to fetch in one query (faster than two queries)
   */
  static async getPlayerItemsWithDefinitions(playerId: string): Promise<Array<PlayerItem & { definition: ItemDefinition | null }>> {
    // Use imported supabase instance
    
    // OPTIMIZED: Use Supabase foreign key join (item_definition_id -> item_definitions.item_id)
    // This fetches items + definitions in a single database query
    // Supabase automatically detects foreign key relationships
    const { data: items, error: itemsError } = await supabase
      .from('player_items')
      .select(`
        *,
        item_definitions (*)
      `)
      .eq('player_id', playerId)
      .order('slot_position', { ascending: true, nullsFirst: false })
      .order('minted_at', { ascending: false })
    
    if (itemsError) {
      // If join fails, fallback to two-query approach
      console.warn('⚠️ Join query failed, falling back to two queries:', itemsError.message)
      
      // Fallback: fetch items first
      const { data: itemsData, error: itemsErr } = await supabase
        .from('player_items')
        .select('*')
        .eq('player_id', playerId)
        .order('slot_position', { ascending: true, nullsFirst: false })
        .order('minted_at', { ascending: false })
      
      if (itemsErr || !itemsData || itemsData.length === 0) {
        return []
      }
      
      // Fetch definitions
      const itemDefinitionIds = Array.from(new Set(itemsData.map((item: any) => item.item_definition_id)))
      const { data: definitions } = await supabase
        .from('item_definitions')
        .select('*')
        .in('item_id', itemDefinitionIds)
      
      const definitionMap = new Map((definitions || []).map((def: any) => [def.item_id, def]))
      
      return itemsData.map((item: any) => ({
        ...item,
        definition: definitionMap.get(item.item_definition_id) || null
      })) as Array<PlayerItem & { definition: any }>
    }
    
    if (!items || items.length === 0) {
      return []
    }
    
    // Supabase returns definitions as nested array (foreign key relationship)
    // Extract and flatten the structure
    return items.map((item: any) => ({
      ...item,
      definition: (item.item_definitions && Array.isArray(item.item_definitions) && item.item_definitions.length > 0)
        ? item.item_definitions[0]  // Foreign key join returns array, take first
        : null
    })) as Array<PlayerItem & { definition: any }>
  }
}

