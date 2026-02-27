import { pgQuery, pgQuerySingle } from '../utils/pg-helper'

class InventoryVersionService {
  async getVersion(playerId: string): Promise<number> {
    const { data, error } = await pgQuery<{ version: number }>(
      'SELECT version FROM inventory_versions WHERE player_id = $1',
      [playerId]
    )

    if (error) {
      console.error('❌ Failed to fetch inventory version:', error)
      throw error
    }

    if (!data || data.length === 0) {
      return 0
    }

    return Number(data[0].version || 0)
  }

  async bumpVersion(playerId: string): Promise<number> {
    const { data, error } = await pgQuerySingle<{ version: number }>(
      `INSERT INTO inventory_versions (player_id, version, updated_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (player_id)
       DO UPDATE SET version = inventory_versions.version + 1, updated_at = NOW()
       RETURNING version`,
      [playerId]
    )

    if (error || !data) {
      console.error('❌ Failed to bump inventory version:', error)
      throw error || new Error('Failed to bump inventory version')
    }

    return Number(data.version || 0)
  }
}

let inventoryVersionInstance: InventoryVersionService | null = null

export function getInventoryVersionService(): InventoryVersionService {
  if (!inventoryVersionInstance) {
    inventoryVersionInstance = new InventoryVersionService()
  }
  return inventoryVersionInstance
}
