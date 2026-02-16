/**
 * Off-Chain Program Services
 * 
 * Centralized exports for all off-chain program services.
 * These services replace the Solana Anchor program with database-backed logic.
 */

// Types
export * from './types';

// Player Accounts (uses existing profiles table)
export {
  initializePlayer,
  getPlayerByUserId,
  getPlayerById,
  getPlayerByWallet,
  getPlayerByPDA,
  updatePlayer,
  getPlayerWallet,
  playerExists,
  type PlayerProfile,
  type InitializePlayerParams,
  type UpdatePlayerParams
} from './player-accounts';

// Token Accounts (server-controlled Token-2022 accounts)
export {
  createTokenAccount,
  getTokenAccount,
  getPlayerTokenAccounts,
  ensureTokenAccount,
  syncBalance,
  getTokenAccountInfo,
  getCOBXAccount,
  getOBXAccount,
  ensureCOBXAccount,
  ensureOBXAccount,
  type CreateTokenAccountParams,
  type TokenAccountInfo
} from './token-accounts';

// Balance Manager (database balance tracking)
export {
  getBalance,
  updateBalance,
  getTransactionHistory,
  syncBalanceWithOnChain,
  getBalanceInfo,
  type BalanceUpdate
} from './balance-manager';

// Token Operations (deposit, withdraw, rewards)
export {
  depositOBX,
  withdrawOBX,
  mintReward,
  transferBetweenPlayers
} from './token-operations';

// cNFT Storage (treasury management)
export {
  mintToTreasury,
  getPlayerCNFTs,
  getTreasuryCNFTs,
  withdrawCNFT,
  getCNFTByAssetId,
  updateCNFTMetadata,
  burnCNFT,
  type MintCNFTToTreasuryParams,
  type CNFTWithdrawParams
} from './cnft-storage';
