# Off-Chain Program Services - Implementation Complete

## Overview

All core services for the off-chain program architecture have been implemented. These services replace the Solana Anchor program with database-backed logic, eliminating the need for PDAs and reducing on-chain costs.

## Completed Services

### 1. **Player Accounts Service** (`player-accounts.ts`)
- ✅ Manages player profiles using existing `profiles` table
- ✅ No PDAs required - all data stored in database
- ✅ Functions:
  - `initializePlayer()` - Create new player profile
  - `getPlayerByUserId()` - Get player by user ID
  - `getPlayerByWallet()` - Get player by wallet address
  - `getPlayerByPDA()` - Backward compatibility during migration
  - `updatePlayer()` - Update player stats
  - `getPlayerWallet()` - Get player's wallet address

### 2. **Token Accounts Service** (`token-accounts.ts`)
- ✅ Manages server-controlled Token-2022 accounts
- ✅ Each player gets regular Token-2022 accounts (not PDAs) owned by server wallet
- ✅ Account addresses stored in `player_token_accounts` table
- ✅ Functions:
  - `createTokenAccount()` - Create new Token-2022 account
  - `getTokenAccount()` - Get account for player + mint
  - `getPlayerTokenAccounts()` - Get all accounts for player
  - `ensureTokenAccount()` - Create if doesn't exist
  - `syncBalance()` - Sync database with on-chain balance
  - `getCOBXAccount()` / `getOBXAccount()` - Convenience functions

### 3. **Balance Manager Service** (`balance-manager.ts`)
- ✅ Database is source of truth for balances
- ✅ Tracks all balance changes in `balance_transactions` table
- ✅ Functions:
  - `getBalance()` - Get current balance from database
  - `updateBalance()` - Update balance and log transaction
  - `getTransactionHistory()` - Get transaction history
  - `syncBalanceWithOnChain()` - Verify database matches blockchain
  - `getBalanceInfo()` - Get balance with sync status

### 4. **Token Operations Service** (`token-operations.ts`)
- ✅ Direct SPL Token operations (no Anchor program needed)
- ✅ Handles deposit, withdraw, and reward operations
- ✅ Functions:
  - `depositOBX()` - Deposit OBX → Mint cOBX
  - `withdrawOBX()` - Burn cOBX → Transfer OBX
  - `mintReward()` - Mint cOBX as in-game reward
  - `transferBetweenPlayers()` - Internal token transfers

### 5. **cNFT Storage Service** (`cnft-storage.ts`)
- ✅ Manages cNFT treasury storage
- ✅ All cNFTs stored in treasury wallet until withdrawal
- ✅ Ownership tracked in `player_character_cnfts` table
- ✅ Functions:
  - `getPlayerCNFTs()` - Get all cNFTs for a player
  - `getTreasuryCNFTs()` - Get cNFTs in treasury
  - `withdrawCNFT()` - Withdraw cNFT to player wallet
  - `getCNFTByAssetId()` - Get cNFT by asset ID
  - `updateCNFTMetadata()` - Update metadata
  - `burnCNFT()` - Mark cNFT as burned

### 6. **Types** (`types.ts`)
- ✅ Complete TypeScript interfaces for all data structures
- ✅ Matches database schema from migration
- ✅ Request/response types for all operations

### 7. **Index** (`index.ts`)
- ✅ Centralized exports for all services
- ✅ Clean API for importing services

## Database Schema

The migration (`20250204_offchain_program_integration.sql`) extends existing tables and adds new ones:

### Extended Tables
- **`profiles`**: Added `level`, `wins`, `losses`, `lifetime_obx_earned`, `lifetime_exp_spent`, `pda_deprecated`

### New Tables
- **`player_token_accounts`**: Tracks server-controlled Token-2022 accounts
- **`player_character_cnfts`**: Tracks cNFTs in treasury
- **`balance_transactions`**: Audit log for all balance changes
- **`reward_transactions`**: Tracks reward mints

## Integration Status

### ✅ Completed
- [x] Database migration script
- [x] All core services implemented
- [x] Type definitions
- [x] Service exports
- [x] No linting errors

### 🔄 Next Steps
- [ ] Update routes to use new services
- [ ] Create migration scripts for existing data
- [ ] Test services with real data
- [ ] Update frontend to use new API endpoints
- [ ] Deploy to production

## Usage Example

```typescript
import {
  initializePlayer,
  ensureCOBXAccount,
  mintReward,
  getBalance,
  withdrawCNFT
} from './services/offchain-program';

// Initialize player (no PDA needed)
const player = await initializePlayer({
  userId: 'user-123',
  name: 'PlayerName',
  class: 1
});

// Ensure token account exists
await ensureCOBXAccount(player.id);

// Mint reward
await mintReward({
  playerId: player.id,
  amount: 1000n * 10n ** 9n, // 1000 cOBX (9 decimals)
  rewardType: 'dungeon',
  metadata: { dungeon_id: 'dungeon-1' }
});

// Get balance
const balance = await getBalance(player.id, 'cOBX');

// Withdraw cNFT
await withdrawCNFT({
  playerId: player.id,
  assetId: 'cnft-asset-id',
  walletAddress: 'player-wallet-address'
});
```

## Architecture Benefits

1. **No PDAs**: Eliminates PDA creation costs (~0.002 SOL per player)
2. **Database Source of Truth**: Fast queries, no on-chain lookups
3. **Server-Controlled Accounts**: Server owns token accounts, manages transfers
4. **Treasury Storage**: All cNFTs in one wallet, easy management
5. **Audit Trail**: Complete transaction history in database
6. **Scalable**: No per-player on-chain costs

## Notes

- Services use existing `profiles` table (no new `player_accounts` table)
- Backward compatibility maintained during migration
- All services are typed and linted
- Ready for route integration
