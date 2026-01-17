// Supabase removed - using PostgreSQL directly
import { pgQuerySingle, pgQuery } from '../utils/pg-helper'

export interface ItemDefinitionFilters {
  filters?: {
    item_type?: string
    rarity?: string
    is_active?: boolean
    is_placeable?: boolean
    placeable_category?: string
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
  // Placeable item fields (added in migration 016)
  is_placeable?: boolean
  placeable_category?: 'building' | 'crafting' | 'decoration' | 'storage' | 'furniture' | 'structure' | null
  placement_metadata?: Record<string, any> | null
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
    // Build SQL query with filters
    let sql = 'SELECT * FROM item_definitions WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    // Apply filters
    if (options.filters) {
      if (options.filters.item_type) {
        sql += ` AND item_type = $${paramIndex++}`;
        params.push(options.filters.item_type);
      }
      if (options.filters.rarity) {
        sql += ` AND rarity = $${paramIndex++}`;
        params.push(options.filters.rarity);
      }
      if (options.filters.is_active !== undefined) {
        sql += ` AND is_active = $${paramIndex++}`;
        params.push(options.filters.is_active);
      }
      if (options.filters.is_placeable !== undefined) {
        sql += ` AND is_placeable = $${paramIndex++}`;
        params.push(options.filters.is_placeable);
      }
      if (options.filters.placeable_category) {
        sql += ` AND placeable_category = $${paramIndex++}`;
        params.push(options.filters.placeable_category);
      }
    }
    
    // Apply search (searches name and description)
    if (options.search) {
      sql += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${options.search}%`);
      paramIndex++;
    }
    
    sql += ' ORDER BY name ASC';
    
    const result = await pgQuery<ItemDefinition>(sql, params);
    const data = result.data;
    const error = result.error;
    
    if (error) {
      console.error('❌ Error fetching item definitions:', error);
      throw new Error(`Failed to fetch item definitions: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return (data || []) as ItemDefinition[];
  }
  
  /**
   * Get single item definition by ID
   */
  static async getItemDefinition(itemId: string): Promise<ItemDefinition | null> {
    const result = await pgQuerySingle<ItemDefinition>(
      'SELECT * FROM item_definitions WHERE item_id = $1',
      [itemId]
    );
    const data = result.data;
    const error = result.error;
    
    if (error) {
      if (error.message === 'No rows returned') {
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
    
    const insertKeys = Object.keys(itemData);
    const insertValues = Object.values(itemData);
    const columns = insertKeys.join(', ');
    const placeholders = insertKeys.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pgQuerySingle<ItemDefinition>(
      `INSERT INTO item_definitions (${columns}) VALUES (${placeholders}) RETURNING *`,
      insertValues
    );
    const data = result.data;
    const error = result.error;
    
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
    
    const updateKeys = Object.keys(updateData).filter(key => updateData[key as keyof typeof updateData] !== undefined);
    const updateValues = updateKeys.map(key => updateData[key as keyof typeof updateData]);
    const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    
    const result = await pgQuerySingle<ItemDefinition>(
      `UPDATE item_definitions SET ${setClause} WHERE item_id = $${updateKeys.length + 1} RETURNING *`,
      [...updateValues, itemId]
    );
    
    const data = result.data;
    const error = result.error;
    
    if (error) {
      if (error.message === 'No rows returned') {
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
    const result = await pgQuerySingle<ItemDefinition>(
      'UPDATE item_definitions SET is_active = $1, updated_at = $2 WHERE item_id = $3 RETURNING *',
      [false, new Date().toISOString(), itemId]
    );
    
    const error = result.error;
    
    if (error) {
      if (error.message === 'No rows returned') {
        // Not found - consider it a successful deletion
        return true
      }
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
    
    const updateKeys = Object.keys(updateData);
    const updateValues = Object.values(updateData);
    const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const result = await pgQuerySingle<ItemDefinition>(
      `UPDATE item_definitions SET ${setClause} WHERE item_id = $${updateKeys.length + 1} RETURNING *`,
      [...updateValues, itemId]
    );
    const data = result.data;
    const error = result.error;
    
    if (error) {
      if (error.message === 'No rows returned') {
        return null;
      }
      console.error('❌ Error linking sprite:', error);
      throw new Error(`Failed to link sprite: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return data as ItemDefinition
  }
}

