/**
 * Player Accounts Service
 * Manages player accounts using existing profiles table (no PDAs needed)
 * 
 * NOTE: This service works with the existing `profiles` table, not a new `player_accounts` table.
 * The profiles table is extended with new fields: level, wins, losses, lifetime_obx_earned, lifetime_exp_spent
 */

import { pgQuerySingle, pgQuery } from '../../utils/pg-helper';

// Profile interface matching existing profiles table + new fields
export interface PlayerProfile {
  id: string; // UUID, references users.id
  player_pda: string | null; // Deprecated, kept for backward compatibility
  wallet_address: string | null;
  character_class: number;
  character_name: string;
  level: number; // NEW: Added in migration
  wins: number; // NEW: Added in migration
  losses: number; // NEW: Added in migration
  lifetime_obx_earned: bigint; // NEW: Added in migration
  lifetime_exp_spent: bigint; // NEW: Added in migration
  cobx_token_account: string | null; // Existing PDA token account (to be migrated)
  pda_deprecated: boolean; // NEW: Flag to mark PDA as deprecated
  created_at: Date;
  updated_at: Date;
  // Other existing fields...
  username?: string | null;
  user_type?: string;
  character_cnft_1?: string | null;
  character_cnft_2?: string | null;
  character_cnft_3?: string | null;
  character_cnft_4?: string | null;
  character_cnft_5?: string | null;
  active_character_slot?: number | null;
}

export interface InitializePlayerParams {
  userId: string; // profiles.id (UUID)
  name: string; // character_name
  class: number; // character_class
  walletAddress?: string | null; // wallet_address
}

export interface UpdatePlayerParams {
  character_name?: string;
  character_class?: number;
  level?: number;
  wins?: number;
  losses?: number;
  lifetime_obx_earned?: bigint;
  lifetime_exp_spent?: bigint;
  pda_deprecated?: boolean;
}

/**
 * Initialize a new player profile (database only, no on-chain operation)
 * Uses existing profiles table
 */
export async function initializePlayer(params: InitializePlayerParams): Promise<PlayerProfile> {
  const { userId, name, class: playerClass, walletAddress } = params;

  // Validate inputs
  if (!name || name.length < 3) {
    throw new Error('Player name must be at least 3 characters');
  }
  if (playerClass < 0 || playerClass > 3) {
    throw new Error('Invalid character class (0-3)');
  }

  // Check if profile already exists
  const existing = await getPlayerByUserId(userId);
  if (existing) {
    throw new Error('Player profile already exists');
  }

  // Insert new profile (profiles table should already exist)
  // Note: profiles.id should match userId (from auth.users)
  const result = await pgQuerySingle<PlayerProfile>(
    `INSERT INTO profiles (id, wallet_address, character_name, character_class, level, pda_deprecated)
     VALUES ($1, $2, $3, $4, 1, true)
     ON CONFLICT (id) DO UPDATE SET
       character_name = EXCLUDED.character_name,
       character_class = EXCLUDED.character_class,
       level = COALESCE(profiles.level, 1),
       pda_deprecated = true
     RETURNING *`,
    [userId, walletAddress || null, name, playerClass]
  );

  if (!result || result.error) {
    throw new Error(result?.error?.message || 'Failed to create player profile');
  }

  return result.data!;
}

/**
 * Get player profile by user ID (profiles.id)
 */
export async function getPlayerByUserId(userId: string): Promise<PlayerProfile | null> {
  const result = await pgQuerySingle<PlayerProfile>(
    `SELECT * FROM profiles WHERE id = $1`,
    [userId]
  );

  if (result.error || !result.data) {
    return null;
  }

  return result.data;
}

/**
 * Get player profile by player ID (same as user ID, profiles.id)
 * Alias for getPlayerByUserId for consistency
 */
export async function getPlayerById(playerId: string): Promise<PlayerProfile | null> {
  return getPlayerByUserId(playerId);
}

/**
 * Get player profile by wallet address (for Web3 players)
 */
export async function getPlayerByWallet(walletAddress: string): Promise<PlayerProfile | null> {
  const result = await pgQuerySingle<PlayerProfile>(
    `SELECT * FROM profiles WHERE wallet_address = $1`,
    [walletAddress]
  );

  if (result.error || !result.data) {
    return null;
  }

  return result.data;
}

/**
 * Get player profile by player_pda (for backward compatibility during migration)
 */
export async function getPlayerByPDA(playerPda: string): Promise<PlayerProfile | null> {
  const result = await pgQuerySingle<PlayerProfile>(
    `SELECT * FROM profiles WHERE player_pda = $1`,
    [playerPda]
  );

  if (result.error || !result.data) {
    return null;
  }

  return result.data;
}

/**
 * Update player profile
 */
export async function updatePlayer(
  playerId: string, // profiles.id
  updates: UpdatePlayerParams
): Promise<PlayerProfile> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.character_name !== undefined) {
    fields.push(`character_name = $${paramIndex++}`);
    values.push(updates.character_name);
  }
  if (updates.character_class !== undefined) {
    fields.push(`character_class = $${paramIndex++}`);
    values.push(updates.character_class);
  }
  if (updates.level !== undefined) {
    fields.push(`level = $${paramIndex++}`);
    values.push(updates.level);
  }
  if (updates.wins !== undefined) {
    fields.push(`wins = $${paramIndex++}`);
    values.push(updates.wins);
  }
  if (updates.losses !== undefined) {
    fields.push(`losses = $${paramIndex++}`);
    values.push(updates.losses);
  }
  if (updates.lifetime_obx_earned !== undefined) {
    fields.push(`lifetime_obx_earned = $${paramIndex++}`);
    values.push(updates.lifetime_obx_earned.toString());
  }
  if (updates.lifetime_exp_spent !== undefined) {
    fields.push(`lifetime_exp_spent = $${paramIndex++}`);
    values.push(updates.lifetime_exp_spent.toString());
  }
  if (updates.pda_deprecated !== undefined) {
    fields.push(`pda_deprecated = $${paramIndex++}`);
    values.push(updates.pda_deprecated);
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(playerId);

  const result = await pgQuerySingle<PlayerProfile>(
    `UPDATE profiles 
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.error || !result.data) {
    throw new Error(result?.error?.message || 'Failed to update player profile');
  }

  return result.data;
}

/**
 * Get player wallet address (for Web3 players)
 * Returns null for Web2 players
 */
export async function getPlayerWallet(playerId: string): Promise<string | null> {
  const player = await getPlayerById(playerId);
  return player?.wallet_address || null;
}

/**
 * Check if player exists
 */
export async function playerExists(userId: string): Promise<boolean> {
  const player = await getPlayerByUserId(userId);
  return player !== null;
}
