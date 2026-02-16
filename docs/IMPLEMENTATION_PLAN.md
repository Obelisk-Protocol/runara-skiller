# Off-Chain Program Implementation Plan

## 📋 Implementation Checklist

### Phase 1: Database Setup ✅
- [ ] Create migration for new tables
- [ ] Migrate existing player data
- [ ] Create indexes for performance

### Phase 2: Core Services ✅
- [ ] `player-accounts.ts` - Player management
- [ ] `token-accounts.ts` - Token account management
- [ ] `token-operations.ts` - Deposit/withdraw/reward
- [ ] `cnft-storage.ts` - cNFT treasury management
- [ ] `balance-manager.ts` - Balance tracking

### Phase 3: Route Updates ✅
- [ ] Update `/api/players/*` routes
- [ ] Update `/api/cobx/*` routes
- [ ] Update `/api/cnft/*` routes
- [ ] Add new endpoints

### Phase 4: Migration Scripts ✅
- [ ] Token account migration
- [ ] cNFT migration to treasury
- [ ] Balance migration

### Phase 5: Testing & Deployment ✅
- [ ] Unit tests
- [ ] Integration tests
- [ ] Deploy to Railway

---

## 🗂️ File Structure

```
obelisk-skiller/
  src/
    services/
      offchain-program/
        index.ts                 # Service exports
        player-accounts.ts       # Player initialization & management
        token-accounts.ts        # Token account creation & management
        token-operations.ts      # Deposit, withdraw, reward operations
        cnft-storage.ts          # cNFT treasury management
        balance-manager.ts       # Balance tracking & syncing
        types.ts                 # TypeScript types
    routes/
      players.ts                 # Updated: Remove PDA creation
      cobx.ts                    # Updated: Use new token operations
      cnft.ts                    # Updated: Use treasury storage
      tokens.ts                  # NEW: Token management endpoints
    migrations/
      20250204_offchain_migration.sql  # Database migration
  scripts/
    migrate-token-accounts.ts   # Migrate from PDAs to token accounts
    migrate-cnfts-to-treasury.ts # Migrate cNFTs to treasury
    verify-migration.ts          # Verify migration success
```

---

## 🔧 Service Implementation Details

### 1. Player Accounts Service

**File**: `src/services/offchain-program/player-accounts.ts`

**Key Functions:**
- `initializePlayer(userId, name, class)` - Database only, no on-chain
- `getPlayer(playerId)` - Get player data
- `updatePlayer(playerId, data)` - Update player data
- `getPlayerWallet(playerId)` - Get wallet address (Web3) or null (Web2)

**No PDA Creation:**
- All data in database
- No on-chain account needed
- Instant initialization

### 2. Token Accounts Service

**File**: `src/services/offchain-program/token-accounts.ts`

**Key Functions:**
- `createTokenAccount(playerId, mint)` - Create Token-2022 account
- `getTokenAccount(playerId, mint)` - Get account address
- `syncBalance(playerId, mint)` - Sync with on-chain
- `ensureTokenAccount(playerId, mint)` - Create if doesn't exist

**Account Strategy:**
- Generate new keypair for each account
- Store address in database
- Server owns all accounts

### 3. Token Operations Service

**File**: `src/services/offchain-program/token-operations.ts`

**Key Functions:**
- `depositOBX(playerId, amount, signature)` - Verify deposit, mint cOBX
- `withdrawOBX(playerId, amount, wallet)` - Burn cOBX, send OBX
- `mintReward(playerId, amount, type)` - Mint cOBX reward
- `transferBetweenPlayers(fromId, toId, amount)` - Internal transfer

**Operations:**
- Direct SPL Token calls
- No Anchor program needed
- Database updates for all operations

### 4. cNFT Storage Service

**File**: `src/services/offchain-program/cnft-storage.ts`

**Key Functions:**
- `mintToTreasury(playerId, metadata)` - Mint cNFT to treasury
- `getPlayerCNFTs(playerId)` - Get all player cNFTs
- `withdrawCNFT(playerId, assetId, wallet)` - Transfer to player
- `getTreasuryCNFTs()` - Get all treasury cNFTs

**Storage Strategy:**
- All cNFTs in treasury wallet
- Ownership tracked in database
- Transfer only on withdrawal

### 5. Balance Manager Service

**File**: `src/services/offchain-program/balance-manager.ts`

**Key Functions:**
- `getBalance(playerId, tokenType)` - Get database balance
- `updateBalance(playerId, tokenType, amount, type)` - Update balance
- `syncOnChainBalance(playerId, tokenType)` - Sync with blockchain
- `getTransactionHistory(playerId)` - Get ledger

**Balance Strategy:**
- Database is source of truth
- Periodic on-chain sync
- Full transaction ledger

---

## 🔄 Migration Strategy

### Step 1: Token Account Migration

**Script**: `scripts/migrate-token-accounts.ts`

```typescript
// For each existing player:
// 1. Get current PDA token account
// 2. Create new Token-2022 account
// 3. Transfer balance from PDA to new account
// 4. Update database with new account address
// 5. Mark old PDA account for closure
```

### Step 2: cNFT Migration

**Script**: `scripts/migrate-cnfts-to-treasury.ts`

```typescript
// For each player cNFT:
// 1. Get current owner (PDA)
// 2. Transfer to treasury wallet
// 3. Update database status to 'treasury'
// 4. Log migration
```

### Step 3: Balance Migration

**Script**: `scripts/migrate-balances.ts`

```typescript
// For each player:
// 1. Get on-chain balance from new token account
// 2. Update database balance
// 3. Create initial ledger entry
// 4. Verify balance matches
```

---

## 🧪 Testing Plan

### Unit Tests
- Service functions
- Database operations
- Balance calculations
- Error handling

### Integration Tests
- Token operations end-to-end
- cNFT operations end-to-end
- Reward minting
- Withdrawal flow

### Load Tests
- Concurrent deposits
- Batch reward minting
- cNFT batch transfers

---

## 📊 Monitoring & Metrics

### Key Metrics
- Token account creation rate
- Deposit/withdraw success rate
- Reward minting rate
- cNFT withdrawal rate
- Database balance vs on-chain balance

### Alerts
- Balance mismatch detected
- Failed token operations
- High withdrawal volume
- Treasury balance low

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] All migrations tested
- [ ] All services tested
- [ ] Routes updated
- [ ] Documentation updated

### Deployment
- [ ] Run database migrations
- [ ] Deploy new code
- [ ] Run migration scripts
- [ ] Verify operations

### Post-Deployment
- [ ] Monitor error rates
- [ ] Verify balance accuracy
- [ ] Check transaction success
- [ ] Monitor performance

---

## 🔐 Security Checklist

### Server Wallet
- [ ] Secure key storage
- [ ] Multi-sig for large operations
- [ ] Regular key rotation plan
- [ ] Backup key management

### Database
- [ ] Encrypted connections
- [ ] Access controls
- [ ] Audit logging
- [ ] Regular backups

### Operations
- [ ] Rate limiting
- [ ] Input validation
- [ ] Transaction verification
- [ ] Error handling

---

## 📝 API Documentation Updates

### New Endpoints

#### `POST /api/players/initialize`
Initialize player (database only)

#### `GET /api/tokens/balance`
Get token balance (database)

#### `POST /api/tokens/deposit`
Deposit OBX, receive cOBX

#### `POST /api/tokens/withdraw`
Withdraw cOBX, receive OBX

#### `POST /api/tokens/reward`
Mint reward (admin)

#### `GET /api/cnfts/player/:playerId`
Get player cNFTs

#### `POST /api/cnfts/withdraw`
Withdraw cNFT to wallet

### Updated Endpoints

#### `GET /api/cobx/balance`
Now uses database balance

#### `POST /api/cobx/deposit`
Now uses new deposit flow

#### `POST /api/cobx/withdraw`
Now uses new withdraw flow

---

## 🎯 Success Criteria

### Functional
- ✅ All players can deposit/withdraw
- ✅ Rewards mint correctly
- ✅ cNFTs stored in treasury
- ✅ Withdrawals work correctly

### Performance
- ✅ Operations < 100ms (database)
- ✅ On-chain operations < 5s
- ✅ No downtime during migration

### Cost
- ✅ No PDA rent costs
- ✅ Reduced transaction costs
- ✅ Efficient batch operations
