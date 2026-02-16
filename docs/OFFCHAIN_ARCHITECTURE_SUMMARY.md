# Off-Chain Program Architecture - Summary

## 🎯 What We're Building

A complete off-chain replacement for the Solana program that:
- ✅ **Eliminates all PDAs** - No rent costs, no program complexity
- ✅ **Uses server-controlled token accounts** - Regular Token-2022 accounts owned by server
- ✅ **Stores cNFTs in treasury** - All cNFTs minted to treasury wallet until withdrawal
- ✅ **Server holds mint authority** - Can mint rewards instantly without player signatures
- ✅ **Database as source of truth** - All game logic in PostgreSQL

---

## 📁 Files Created

### Documentation
1. **`docs/OFFCHAIN_ARCHITECTURE.md`** - Complete architecture design
2. **`docs/IMPLEMENTATION_PLAN.md`** - Step-by-step implementation guide
3. **`docs/OFFCHAIN_ARCHITECTURE_SUMMARY.md`** - This file (overview)

### Database
4. **`migrations/20250204_offchain_program_integration.sql`** - Database schema integration (extends existing tables)

### Services (Started)
5. **`src/services/offchain-program/types.ts`** - TypeScript types
6. **`src/services/offchain-program/player-accounts.ts`** - Player account management

### Services (To Be Created)
7. **`src/services/offchain-program/token-accounts.ts`** - Token account management
8. **`src/services/offchain-program/token-operations.ts`** - Deposit/withdraw/reward operations
9. **`src/services/offchain-program/cnft-storage.ts`** - cNFT treasury management
10. **`src/services/offchain-program/balance-manager.ts`** - Balance tracking
11. **`src/services/offchain-program/index.ts`** - Service exports

---

## 🏗️ Architecture Overview

### Current System (With Program)
```
Player → PDA → Token Account (PDA) → cNFTs (PDA owned)
         ↓
    Anchor Program
         ↓
    On-chain state
```

### New System (Off-Chain)
```
Player → Database → Token Account (Server-owned) → cNFTs (Treasury)
         ↓
    Direct SPL Token Ops
         ↓
    On-chain only for transfers
```

---

## 🔄 Key Changes

### 1. Player Initialization
**Before:** Create PDA on-chain via Anchor program
**After:** Create database record only (instant, free)

### 2. Token Accounts
**Before:** PDA-derived Token-2022 accounts
**After:** Regular Token-2022 accounts owned by server wallet

### 3. Token Operations
**Before:** Anchor program instructions
**After:** Direct SPL Token operations (mint, burn, transfer)

### 4. cNFT Storage
**Before:** cNFTs owned by player PDAs
**After:** All cNFTs in treasury wallet, ownership in database

### 5. Rewards
**Before:** Program instruction to mint
**After:** Direct mint to player's token account

---

## 💰 Cost Comparison

### Current (With PDAs)
- PDA rent: ~0.001 SOL per player
- Program deployment: 6.5 SOL
- Transaction fees: Per operation
- **Total for 1000 players: ~1 SOL + program costs**

### New (Off-Chain)
- Token account creation: ~0.002 SOL (one-time)
- No PDA rent: $0
- No program: $0
- Transaction fees: Only for actual transfers
- **Total for 1000 players: ~2 SOL (one-time)**

---

## 🚀 Implementation Status

### ✅ Completed
- [x] Architecture design
- [x] Database schema
- [x] TypeScript types
- [x] Player accounts service (basic)

### 🚧 In Progress
- [ ] Token accounts service
- [ ] Token operations service
- [ ] cNFT storage service
- [ ] Balance manager service

### 📋 TODO
- [ ] Route updates
- [ ] Migration scripts
- [ ] Testing
- [ ] Deployment

---

## 📊 Database Schema

### Integration Approach
**We extend existing tables instead of creating new ones:**

1. **`profiles`** (EXTENDED) - Main player table
   - Existing: `id`, `player_pda`, `wallet_address`, `character_class`, `character_name`, `cobx_token_account`
   - **New fields:** `level`, `wins`, `losses`, `lifetime_obx_earned`, `lifetime_exp_spent`, `pda_deprecated`

2. **`player_token_accounts`** (NEW) - Token account tracking
   - References `profiles.id` (not player_pda)

3. **`player_character_cnfts`** (NEW) - Character cNFT tracking
   - References `profiles.id` (not player_pda)

4. **`balance_transactions`** (NEW) - Balance audit trail
   - References `profiles.id` (not player_pda)

5. **`reward_transactions`** (NEW) - Reward tracking
   - References `profiles.id` (not player_pda)

6. **`nfts`** (EXTENDED) - Character NFTs
   - Existing: `asset_id`, `player_pda`, stats, etc.
   - **New fields:** `treasury_status`, `withdrawn_to`, `withdrawn_at`

### Key Features
- Full audit trail
- Indexed for performance
- Foreign key constraints
- Automatic timestamps

---

## 🔐 Security Model

### Server Wallet
- Holds mint authority for cOBX
- Owns all player token accounts
- Stores all cNFTs in treasury
- **Critical:** Must be secured properly

### Database
- Source of truth for balances
- Tracks all transactions
- Full audit trail
- Encrypted connections

### Operations
- All on-chain operations verified
- Transaction signatures logged
- Balance reconciliation
- Error handling

---

## 🎮 Game Flow Examples

### Player Initialization
```typescript
// 1. User signs up
// 2. Backend creates player_accounts record
// 3. No on-chain operation needed
// 4. Instant, free
```

### Deposit OBX
```typescript
// 1. User sends OBX to server wallet
// 2. Backend verifies on-chain
// 3. Backend mints cOBX to player's token account
// 4. Backend updates database balance
```

### Reward Minting
```typescript
// 1. Player completes dungeon
// 2. Backend mints cOBX directly to player's token account
// 3. Backend updates database balance
// 4. No player signature needed
```

### Withdraw OBX
```typescript
// 1. Player requests withdrawal
// 2. Backend burns cOBX from player's token account
// 3. Backend sends OBX to player wallet
// 4. Backend updates database balance
```

### cNFT Withdrawal
```typescript
// 1. Player requests cNFT withdrawal
// 2. Backend transfers cNFT from treasury to player wallet
// 3. Backend updates database status
```

---

## 📈 Benefits

### Cost Savings
- ❌ No PDA rent
- ❌ No program deployment
- ✅ Only pay for transfers

### Performance
- ✅ Instant operations (database)
- ✅ No on-chain delays
- ✅ Fast queries

### Simplicity
- ✅ No Anchor program
- ✅ Direct SPL Token ops
- ✅ Database as source of truth

### Flexibility
- ✅ Easy to add features
- ✅ No program upgrades
- ✅ Can adjust logic instantly

---

## 🧪 Testing Strategy

### Unit Tests
- Service functions
- Database operations
- Balance calculations

### Integration Tests
- Token operations
- cNFT operations
- Reward minting

### End-to-End Tests
- Complete deposit flow
- Complete withdrawal flow
- Reward distribution

---

## 🚀 Next Steps

1. **Review architecture** - Confirm approach
2. **Complete services** - Finish remaining service files
3. **Update routes** - Migrate API endpoints
4. **Create migrations** - Scripts for data migration
5. **Test thoroughly** - Verify all operations
6. **Deploy** - Roll out to production

---

## 📝 Notes

- This architecture completely removes the need for the Solana program
- All game logic moves to the backend
- Blockchain is only used for actual asset transfers
- Database is the source of truth
- Server wallet must be secured properly

---

## 🔗 Related Files

- `docs/OFFCHAIN_ARCHITECTURE.md` - Full architecture details
- `docs/IMPLEMENTATION_PLAN.md` - Implementation checklist
- `docs/INTEGRATION_APPROACH.md` - How we integrate with existing schema
- `migrations/20250204_offchain_program_integration.sql` - Database integration migration
