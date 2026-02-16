# Off-Chain Program Architecture

## 🎯 Overview

Complete migration from Solana program (PDAs) to centralized off-chain backend with direct on-chain token operations. This architecture eliminates all PDAs, reduces costs, and simplifies operations while maintaining blockchain verifiability for withdrawals.

## 🏗️ Core Principles

1. **No PDAs** - All player state in database
2. **Server-Controlled Token Accounts** - Regular Token-2022 accounts owned by server wallet
3. **Treasury cNFT Storage** - All cNFTs minted to treasury, transferred on withdrawal
4. **Server Mint Authority** - Server controls reward token minting
5. **Database as Source of Truth** - All game logic in PostgreSQL
6. **On-Chain Only for Transfers** - Blockchain used only for actual asset movements

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Obelisk Skiller Backend                   │
│                    (Railway/PostgreSQL)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Database   │  │   Services   │  │    Routes    │     │
│  │  (PostgreSQL)│  │              │  │   (Express)  │     │
│  │              │  │  - Players   │  │              │     │
│  │  - profiles  │  │  - Tokens    │  │  /api/players│     │
│  │  - balances  │  │  - cNFTs     │  │  /api/tokens │     │
│  │  - cnfts     │  │  - Rewards   │  │  /api/cnfts  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Direct SPL Token Operations
                            │ (No Anchor Program)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Solana Blockchain                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Server Wallet (Treasury)                   │    │
│  │  - Mint Authority (cOBX)                            │    │
│  │  - Token Accounts (one per player)                  │    │
│  │  - cNFT Storage (all player cNFTs)                  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Player Wallets (Web3)                       │    │
│  │  - OBX Holdings                                     │    │
│  │  - Withdrawn cNFTs                                  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema

### Core Tables

**Note:** This architecture **extends** the existing `profiles` table instead of creating new tables.

```sql
-- EXTENDED: profiles table (existing, with new fields added)
-- Existing fields: id, player_pda, wallet_address, character_class, character_name, cobx_token_account
-- New fields added:
ALTER TABLE profiles
  ADD COLUMN level INTEGER DEFAULT 1,
  ADD COLUMN wins INTEGER DEFAULT 0,
  ADD COLUMN losses INTEGER DEFAULT 0,
  ADD COLUMN lifetime_obx_earned BIGINT DEFAULT 0,
  ADD COLUMN lifetime_exp_spent BIGINT DEFAULT 0,
  ADD COLUMN pda_deprecated BOOLEAN DEFAULT false;
```

-- NEW: Token accounts (replaces PDA Token-2022 accounts)
-- References profiles.id (user_id) instead of player_pda
CREATE TABLE player_token_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- References profiles.id
  token_account_address TEXT NOT NULL UNIQUE, -- On-chain Token-2022 account
  mint_address TEXT NOT NULL, -- OBX or cOBX mint
  balance BIGINT DEFAULT 0, -- Database balance (source of truth)
  on_chain_balance BIGINT DEFAULT 0, -- Cached on-chain balance
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, mint_address)
);

-- NEW: Character cNFT tracking (complements existing nfts table)
-- References profiles.id instead of player_pda
CREATE TABLE player_character_cnfts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- References profiles.id
  asset_id TEXT NOT NULL UNIQUE, -- cNFT asset ID
  tree_address TEXT NOT NULL,
  metadata_uri TEXT,
  status TEXT NOT NULL DEFAULT 'treasury', -- 'treasury', 'withdrawn', 'burned'
  withdrawn_to TEXT, -- Wallet address if withdrawn
  withdrawn_at TIMESTAMPTZ,
  slot_number INTEGER CHECK (slot_number >= 1 AND slot_number <= 5), -- Character slot (1-5)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- EXTENDED: nfts table (existing, with new fields)
-- Existing: asset_id, player_pda, name, level, stats, etc.
-- New fields:
ALTER TABLE nfts
  ADD COLUMN treasury_status TEXT DEFAULT 'treasury' CHECK (treasury_status IN ('treasury', 'withdrawn', 'burned')),
  ADD COLUMN withdrawn_to TEXT,
  ADD COLUMN withdrawn_at TIMESTAMPTZ;

-- NEW: Balance ledger (audit trail)
-- References profiles.id instead of player_pda
CREATE TABLE balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- References profiles.id
  transaction_type TEXT NOT NULL, -- 'deposit', 'withdraw', 'reward', 'purchase', 'refund', 'transfer'
  token_type TEXT NOT NULL, -- 'OBX' or 'cOBX'
  amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  on_chain_signature TEXT, -- Transaction signature if on-chain
  metadata JSONB DEFAULT '{}', -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NEW: Reward tracking
-- References profiles.id instead of player_pda
CREATE TABLE reward_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- References profiles.id
  reward_type TEXT NOT NULL, -- 'dungeon', 'quest', 'pvp', 'daily', 'achievement', 'other'
  amount BIGINT NOT NULL,
  minted_at TIMESTAMPTZ DEFAULT NOW(),
  on_chain_signature TEXT, -- Mint transaction signature
  metadata JSONB DEFAULT '{}'
);
```

---

## 🔑 Token Account Strategy

### Server-Controlled Token Accounts

**Key Design:**
- Each player gets a **regular Token-2022 account** (not a PDA)
- Account is **owned by server wallet** (not player)
- Account address stored in database
- Server can mint/burn/transfer without player signatures

**Account Creation:**
```typescript
// Create Token-2022 account for player
const tokenAccount = Keypair.generate(); // New keypair for each account
const createAccountIx = createInitializeAccount3Instruction(
  tokenAccount.publicKey,  // Account address
  COBX_MINT,               // Token mint
  serverWallet.publicKey,  // Owner (server)
  TOKEN_2022_PROGRAM_ID
);

// Store account address in database
await db.insert('player_token_accounts', {
  player_id: playerId,
  token_account_address: tokenAccount.publicKey.toBase58(),
  mint_address: COBX_MINT.toBase58()
});
```

**Benefits:**
- ✅ No PDA rent costs
- ✅ Server can mint rewards instantly
- ✅ No player signatures needed for in-game operations
- ✅ Can batch operations
- ✅ Easy to manage

---

## 🎮 cNFT Strategy

### Treasury Storage Model

**Key Design:**
- All cNFTs minted to **treasury wallet** (server wallet)
- Ownership tracked in **database**
- Transferred to player wallet only on **withdrawal**

**Minting Flow:**
```typescript
// 1. Mint cNFT to treasury
const mintResult = await mintCompressedNFT({
  tree: PLAYER_TREE,
  leafOwner: TREASURY_WALLET, // Always treasury
  metadata: characterMetadata
});

// 2. Store in database
await db.insert('player_cnfts', {
  player_id: playerId,
  asset_id: mintResult.assetId,
  tree_address: PLAYER_TREE,
  status: 'treasury'
});
```

**Withdrawal Flow:**
```typescript
// 1. Transfer from treasury to player wallet
await transferCompressedNFT({
  from: TREASURY_WALLET,
  to: playerWallet,
  assetId: cnft.asset_id,
  proof: await getAssetProof(cnft.asset_id)
});

// 2. Update database
await db.update('player_cnfts', {
  status: 'withdrawn',
  withdrawn_to: playerWallet.toBase58(),
  withdrawn_at: new Date()
});
```

**Benefits:**
- ✅ No PDA needed for cNFT ownership
- ✅ Instant minting (no player wallet needed)
- ✅ Server controls all cNFTs until withdrawal
- ✅ Can batch transfers
- ✅ Easy to manage inventory

---

## 💰 Token Operations

### Deposit (OBX → cOBX)

```typescript
// 1. User sends OBX to server wallet
// 2. Server mints cOBX to player's token account
async function depositOBX(playerId: string, amount: bigint) {
  // Verify OBX received on-chain
  const obxReceived = await verifyOBXDeposit(playerId, amount);
  if (!obxReceived) throw new Error('OBX not received');
  
  // Mint cOBX to player's token account
  const playerAccount = await getPlayerTokenAccount(playerId, 'cOBX');
  const mintIx = createMintToInstruction(
    COBX_MINT,
    playerAccount.token_account_address,
    serverWallet.publicKey, // Mint authority
    amount * 1000n, // Convert OBX (6 decimals) to cOBX (9 decimals)
    [],
    TOKEN_2022_PROGRAM_ID
  );
  
  const tx = new Transaction().add(mintIx);
  const signature = await sendAndConfirmTransaction(connection, tx, [serverKeypair]);
  
  // Update database
  await db.transaction(async (tx) => {
    await updateBalance(playerId, 'cOBX', amount * 1000n, 'deposit');
    await logTransaction(playerId, 'deposit', 'cOBX', amount, signature);
  });
}
```

### Withdraw (cOBX → OBX)

```typescript
async function withdrawOBX(playerId: string, amount: bigint) {
  // Check database balance
  const balance = await getBalance(playerId, 'cOBX');
  if (balance < amount) throw new Error('Insufficient balance');
  
  // Burn cOBX from player's token account
  const playerAccount = await getPlayerTokenAccount(playerId, 'cOBX');
  const burnIx = createBurnInstruction(
    playerAccount.token_account_address,
    COBX_MINT,
    serverWallet.publicKey, // Authority (server owns account)
    amount,
    [],
    TOKEN_2022_PROGRAM_ID
  );
  
  // Transfer OBX to player wallet
  const playerWallet = await getPlayerWallet(playerId);
  const transferIx = createTransferInstruction(
    serverOBXAccount,
    playerOBXAccount,
    serverWallet.publicKey,
    amount / 1000n, // Convert cOBX (9 decimals) to OBX (6 decimals)
    [],
    TOKEN_PROGRAM_ID
  );
  
  const tx = new Transaction().add(burnIx, transferIx);
  const signature = await sendAndConfirmTransaction(connection, tx, [serverKeypair]);
  
  // Update database
  await db.transaction(async (tx) => {
    await updateBalance(playerId, 'cOBX', -amount, 'withdraw');
    await logTransaction(playerId, 'withdraw', 'OBX', amount / 1000n, signature);
  });
}
```

### Reward Minting

```typescript
async function mintReward(playerId: string, amount: bigint, rewardType: string) {
  // Mint directly to player's token account
  const playerAccount = await getPlayerTokenAccount(playerId, 'cOBX');
  const mintIx = createMintToInstruction(
    COBX_MINT,
    playerAccount.token_account_address,
    serverWallet.publicKey, // Mint authority
    amount,
    [],
    TOKEN_2022_PROGRAM_ID
  );
  
  const tx = new Transaction().add(mintIx);
  const signature = await sendAndConfirmTransaction(connection, tx, [serverKeypair]);
  
  // Update database
  await db.transaction(async (tx) => {
    await updateBalance(playerId, 'cOBX', amount, 'reward');
    await logReward(playerId, rewardType, amount, signature);
  });
}
```

---

## 🎨 Service Architecture

### New Service Structure

```
obelisk-skiller/src/
  services/
    offchain-program/          # NEW: Off-chain program logic
      player-accounts.ts       # Player initialization (no PDAs)
      token-accounts.ts        # Token account management
      token-operations.ts      # Deposit/withdraw/reward operations
      cnft-storage.ts          # cNFT treasury management
      balance-manager.ts       # Balance tracking and syncing
      reward-engine.ts         # Reward minting system
    cnft.ts                    # Keep: cNFT minting/transfer (update to use treasury)
    database.ts                # Keep: Database operations
```

### Key Services

#### `player-accounts.ts`
- Initialize player (database only, no on-chain)
- Get/update player data
- No PDA creation needed

#### `token-accounts.ts`
- Create/manage Token-2022 accounts
- Account address generation and storage
- Balance syncing with on-chain

#### `token-operations.ts`
- Deposit OBX → cOBX
- Withdraw cOBX → OBX
- Direct SPL Token operations (no program)

#### `cnft-storage.ts`
- Mint cNFTs to treasury
- Track ownership in database
- Transfer on withdrawal

#### `balance-manager.ts`
- Database balance management
- On-chain balance syncing
- Transaction logging

---

## 🔄 Migration Path

### Phase 1: Database Setup
1. Create new tables
2. Migrate existing player data
3. Map old PDAs to new system

### Phase 2: Token Account Migration
1. Create Token-2022 accounts for existing players
2. Transfer balances from PDA accounts to new accounts
3. Update database with new account addresses

### Phase 3: cNFT Migration
1. Transfer all cNFTs from PDAs to treasury
2. Update database with treasury ownership
3. Mark all as 'treasury' status

### Phase 4: Service Implementation
1. Implement new services
2. Update routes to use new services
3. Remove Anchor program dependencies

### Phase 5: Testing & Deployment
1. Test all operations
2. Deploy to Railway
3. Monitor and verify

---

## 🔒 Security Considerations

### Server Wallet Security
- **Critical**: Server wallet holds mint authority and all token accounts
- Use hardware wallet or secure key management
- Implement multi-sig for large operations
- Regular security audits

### Database Security
- Encrypt sensitive data at rest
- Use connection pooling
- Implement rate limiting
- Audit logs for all operations

### On-Chain Verification
- Verify all deposits before crediting
- Use transaction signatures for audit trail
- Implement withdrawal limits
- Monitor for suspicious activity

---

## 📈 Performance Optimizations

### Batch Operations
- Batch token mints for rewards
- Batch cNFT transfers
- Reduce transaction costs

### Caching
- Cache on-chain balances
- Cache token account addresses
- Reduce RPC calls

### Database Indexing
- Index player_id on all tables
- Index asset_id on cnfts
- Index transaction_type on ledger

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

## 📝 API Changes

### New Endpoints

```
POST /api/players/initialize
  - No on-chain operation needed
  - Creates database record only

GET /api/tokens/balance
  - Returns database balance (fast)
  - Optional: sync with on-chain

POST /api/tokens/deposit
  - User sends OBX to server
  - Server mints cOBX

POST /api/tokens/withdraw
  - Server burns cOBX
  - Server sends OBX to user

POST /api/tokens/reward
  - Server mints cOBX reward
  - Updates database

GET /api/cnfts/player/:playerId
  - Returns cNFTs from database
  - Status: treasury/withdrawn

POST /api/cnfts/withdraw
  - Transfers cNFT from treasury to player
  - Updates database
```

---

## 🎯 Benefits Summary

### Cost Savings
- ❌ No PDA rent costs
- ❌ No program deployment costs
- ✅ Only pay for actual transfers

### Simplicity
- ✅ No Anchor program complexity
- ✅ Direct SPL Token operations
- ✅ Database as single source of truth

### Performance
- ✅ Instant in-game operations
- ✅ No on-chain transactions for gameplay
- ✅ Fast database queries

### Flexibility
- ✅ Easy to add new features
- ✅ No program upgrade needed
- ✅ Can adjust logic without deployment

---

## 🚀 Next Steps

1. **Review this architecture** - Confirm approach
2. **Create database migrations** - Set up new tables
3. **Implement services** - Build off-chain program logic
4. **Update routes** - Migrate API endpoints
5. **Test thoroughly** - Verify all operations
6. **Deploy** - Roll out to production
