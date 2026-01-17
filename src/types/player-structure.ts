/**
 * TypeScript types for player structures (Layer 3)
 * Matches database schema in migrations/015_add_player_structures_table.sql
 */

export interface PlayerStructure {
  id: string
  chunk_x: number
  chunk_y: number
  x: number
  y: number
  item_definition_id: string
  structure_type: string
  rotation: number
  scale: number
  z_layer?: 'below' | 'mid' | 'above' | null
  z_offset: number
  collision: boolean
  collision_bounds?: Record<string, any> | null
  properties: Record<string, any>
  placed_at: string
  destroyed_at?: string | null
  health: number
  max_health: number
  placed_by_player_id?: string | null
  placed_by_name?: string | null
}

export interface PlaceStructureParams {
  playerId: string
  itemId: string
  chunkX: number
  chunkY: number
  x: number
  y: number
  rotation?: number
  scale?: number
  properties?: Record<string, any>
}

export interface DestroyOptions {
  returnItem?: boolean
  playerId?: string
}

export interface PlacementMetadata {
  snap_to_grid?: boolean
  grid_size?: number
  rotation_increments?: number
  max_rotation?: number
  min_size?: { width: number; height: number }
  max_size?: { width: number; height: number }
  placement_rules?: {
    requires_flat_ground?: boolean
    cannot_overlap?: boolean
    max_per_chunk?: number
  }
}

