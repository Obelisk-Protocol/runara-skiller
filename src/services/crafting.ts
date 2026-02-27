import { PlayerItemService } from './player-items'
import { ItemService, ItemDefinition } from './item'

export interface CraftItemResult {
  success: boolean
  craftedItem?: any
  error?: string
}

export class CraftingService {
  /**
   * Crafts an item for a player
   * Validates recipe requirements, consumes ingredients, and awards the crafted item
   */
  static async craftItem(
    playerId: string,
    itemId: string,
    quantity: number = 1
  ): Promise<CraftItemResult> {
    try {
      // 1. Get item definition
      const itemDef = await ItemService.getItemDefinition(itemId)
      if (!itemDef) {
        return { success: false, error: `Item "${itemId}" not found` }
      }
      
      if (!itemDef.is_craftable) {
        return { success: false, error: `Item "${itemId}" is not craftable` }
      }
      
      // 2. Parse recipe
      const recipe = itemDef.craft_recipe as {
        ingredients?: Array<{ item_id: string; quantity: number }>
        result?: { item_id: string; quantity: number }
      } | null
      
      if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
        return { success: false, error: 'Item has no valid recipe' }
      }
      
      // 3. Check player has all required ingredients (for quantity times)
      const missingIngredients: string[] = []
      for (const ingredient of recipe.ingredients) {
        const requiredQty = ingredient.quantity * quantity
        const playerItem = await PlayerItemService.getPlayerItem(playerId, ingredient.item_id)
        
        if (!playerItem || playerItem.quantity < requiredQty) {
          const have = playerItem?.quantity || 0
          missingIngredients.push(`${ingredient.item_id}: need ${requiredQty}, have ${have}`)
        }
      }
      
      if (missingIngredients.length > 0) {
        return {
          success: false,
          error: `Insufficient ingredients: ${missingIngredients.join(', ')}`
        }
      }
      
      // 4. Consume ingredients (remove from inventory)
      for (const ingredient of recipe.ingredients) {
        const requiredQty = ingredient.quantity * quantity
        await PlayerItemService.removeItem(playerId, ingredient.item_id, requiredQty)
      }
      
      // 5. Award crafted item
      const resultItemId = recipe.result?.item_id || itemId
      const resultQuantity = (recipe.result?.quantity || 1) * quantity
      
      const craftedItem = await PlayerItemService.awardItemToPlayer({
        playerId,
        itemId: resultItemId,
        quantity: resultQuantity,
        source: 'crafting'
      })
      
      return { success: true, craftedItem }
    } catch (error) {
      console.error('❌ Crafting error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Crafting failed'
      }
    }
  }
}

