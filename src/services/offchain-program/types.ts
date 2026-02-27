/**
 * TypeScript types for off-chain program services
 * 
 * NOTE: These types work with the existing `profiles` table, not a new `player_accounts` table.
 * The profiles table is extended with new fields for off-chain program functionality.
 */

// PlayerProfile matches existing profiles table + new fields
export interface PlayerProfile {
  id: string; // UUID, references users.id (this is the player_id/user_id)
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

// Alias for backward compatibility
export type PlayerAccount = PlayerProfile;

export interface TokenAccount {
  id: string;
  player_id: string;
  token_account_address: string;
  mint_address: string;
  balance: bigint;
  on_chain_balance: bigint;
  last_synced_at: Date | null;
  created_at: Date;
}

export interface PlayerCharacterCNFT {
  id: string;
  player_id: string; // References profiles.id (user_id), not player_pda
  asset_id: string;
  tree_address: string;
  metadata_uri: string | null;
  status: 'treasury' | 'withdrawn' | 'burned';
  withdrawn_to: string | null;
  withdrawn_at: Date | null;
  slot_number: number | null; // Character slot (1-5)
  created_at: Date;
  updated_at: Date;
}

// Alias for backward compatibility
export type PlayerCNFT = PlayerCharacterCNFT;

export interface BalanceTransaction {
  id: string;
  player_id: string; // References profiles.id (user_id), not player_pda
  transaction_type: 'deposit' | 'withdraw' | 'reward' | 'purchase' | 'refund' | 'transfer';
  token_type: 'OBX' | 'cOBX';
  amount: bigint;
  balance_before: bigint;
  balance_after: bigint;
  on_chain_signature: string | null;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface RewardTransaction {
  id: string;
  player_id: string;
  reward_type: 'dungeon' | 'quest' | 'pvp' | 'daily' | 'achievement' | 'other';
  amount: bigint;
  minted_at: Date;
  on_chain_signature: string | null;
  metadata: Record<string, any>;
}

export type TokenType = 'OBX' | 'cOBX';
export type CNFTStatus = 'treasury' | 'withdrawn' | 'burned';
export type TransactionType = 'deposit' | 'withdraw' | 'reward' | 'purchase' | 'refund' | 'transfer';
export type RewardType = 'dungeon' | 'quest' | 'pvp' | 'daily' | 'achievement' | 'other';

export interface DepositRequest {
  playerId: string;
  amount: bigint;
  signature: string; // OBX deposit transaction signature
}

export interface WithdrawRequest {
  playerId: string;
  amount: bigint;
  walletAddress: string; // Where to send OBX
}

export interface RewardRequest {
  playerId: string;
  amount: bigint;
  rewardType: RewardType;
  metadata?: Record<string, any>;
}

export interface CNFTWithdrawRequest {
  playerId: string;
  assetId: string;
  walletAddress: string;
}

export interface BalanceInfo {
  balance: bigint;
  formattedBalance: string;
  tokenType: TokenType;
  accountAddress: string;
  lastSynced: Date | null;
}
