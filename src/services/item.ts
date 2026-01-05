import { supabase } from '../config/database'

export interface ItemDefinitionFilters {
  filters?: {
    item_type?: string
    rarity?: string
    is_active?: boolean
  }
  search?: string
}

export interface ItemDefinition {
  item_id: string
  name: string
  description: string
  item_type: 'material' | 'equipment' | 'consumable'
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  base_properties: Record<string, any>
  image_url?: string | null
  animation_url?: string | null
  icon_url?: string | null
  ground_sprite_url?: string | null
  in_use_sprite_url?: string | null
  in_use_animation_config?: Record<string, any> | null
  craft_recipe?: Record<string, any> | null
  max_floor_level?: number | null
  base_drop_rate: number
  is_craftable: boolean
  max_stack_size: number
  min_floor_level: number
  is_active: boolean
  created_at: string
  updated_at: string
  mint_cost_cobx: number
}

export interface SpriteLinkData {
  url: string
  asset_id?: string
  animation_config?: Record<string, any>
}

export class ItemService {
  /**
   * Get item definitions with optional filters
   */
  static async getItemDefinitions(options: ItemDefinitionFilters = {}): Promise<ItemDefinition[]> {
    let query = supabase
      .from('item_definitions')
      .select('*')
      .order('name', { ascending: true })
    
    // Apply filters
    if (options.filters) {
      if (options.filters.item_type) {
        query = query.eq('item_type', options.filters.item_type)
      }
      if (options.filters.rarity) {
        query = query.eq('rarity', options.filters.rarity)
      }
      if (options.filters.is_active !== undefined) {
        query = query.eq('is_active', options.filters.is_active)
      }
    }
    
    // Apply search (searches name and description)
    if (options.search) {
      query = query.or(`name.ilike.%${options.search}%,description.ilike.%${options.search}%`)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('❌ Error fetching item definitions:', error)
      throw new Error(`Failed to fetch item definitions: ${error.message}`)
    }
    
    return (data || []) as ItemDefinition[]
  }
  
  /**
   * Get single item definition by ID
   */
  static async getItemDefinition(itemId: string): Promise<ItemDefinition | null> {
    const { data, error } = await supabase
      .from('item_definitions')
      .select('*')
      .eq('item_id', itemId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null
      }
      console.error('❌ Error fetching item definition:', error)
      throw new Error(`Failed to fetch item definition: ${error.message}`)
    }
    
    return data as ItemDefinition
  }
  
  /**
   * Create new item definition
   */
  static async createItemDefinition(item: Omit<ItemDefinition, 'created_at' | 'updated_at'>): Promise<ItemDefinition> {
    const now = new Date().toISOString()
    
    const itemData = {
      ...item,
      created_at: now,
      updated_at: now
    }
    
    const { data, error } = await supabase
      .from('item_definitions')
      .insert(itemData)
      .select()
      .single()
    
    if (error) {
      console.error('❌ Error creating item definition:', error)
      throw new Error(`Failed to create item definition: ${error.message}`)
    }
    
    return data as ItemDefinition
  }
  
  /**
   * Update item definition
   */
  static async updateItemDefinition(
    itemId: string,
    updates: Partial<Omit<ItemDefinition, 'item_id' | 'created_at' | 'updated_at'>>
  ): Promise<ItemDefinition | null> {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    }
    
    const { data, error } = await supabase
      .from('item_definitions')
      .update(updateData)
      .eq('item_id', itemId)
      .select()
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null
      }
      console.error('❌ Error updating item definition:', error)
      throw new Error(`Failed to update item definition: ${error.message}`)
    }
    
    return data as ItemDefinition
  }
  
  /**
   * Soft delete item definition (set is_active = false)
   */
  static async deleteItemDefinition(itemId: string): Promise<boolean> {
    const { error } = await supabase
      .from('item_definitions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('item_id', itemId)
    
    if (error) {
      console.error('❌ Error deleting item definition:', error)
      throw new Error(`Failed to delete item definition: ${error.message}`)
    }
    
    return true
  }
  
  /**
   * Link sprite to item
   */
  static async linkItemSprite(
    itemId: string,
    spriteType: 'inventory' | 'ground' | 'in_use',
    spriteData: SpriteLinkData
  ): Promise<ItemDefinition | null> {
    const updateData: any = {
      updated_at: new Date().toISOString()
    }
    
    // Map sprite type to database field
    switch (spriteType) {
      case 'inventory':
        updateData.icon_url = spriteData.url
        break
      case 'ground':
        updateData.ground_sprite_url = spriteData.url
        break
      case 'in_use':
        updateData.in_use_sprite_url = spriteData.url
        if (spriteData.animation_config) {
          updateData.in_use_animation_config = spriteData.animation_config
        }
        break
    }
    
    const { data, error } = await supabase
      .from('item_definitions')
      .update(updateData)
      .eq('item_id', itemId)
      .select()
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('❌ Error linking sprite:', error)
      throw new Error(`Failed to link sprite: ${error.message}`)
    }
    
    return data as ItemDefinition
  }
}

