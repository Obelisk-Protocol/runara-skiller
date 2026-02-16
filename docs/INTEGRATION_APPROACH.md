# Off-Chain Program Integration Approach

## 🎯 Integration Strategy

Instead of creating entirely new tables, we **extend and integrate** with the existing database schema.

---

## 📊 Existing Schema Analysis

### Current Tables (That We're Using)

1. **`profiles`** - Main player table
   - `id` (UUID) - Primary key, references `users.id`
   - `player_pda` (TEXT) - **To be deprecated**
   - `wallet_address` (TEXT) - Web3 wallet
   - `character_class`, `character_name` - Player data
   - `cobx_token_account` (TEXT) - **PDA token account to be migrated**
   - `character_cnft_1-5` (TEXT) - Character cNFTs
   - `pda_status`, `pda_created_at`, `pda_creation_cost` - PDA tracking

2. **`nfts`** - Character NFTs
   - `asset_id` (TEXT) - Primary key
   - `player_pda` (TEXT) - **References player_pda (to be migrated to player_id)**
   - Stats, levels, skills, etc.

3. **`player_items`** - Item cNFTs
   - `player_id` (UUID) - **Already references profiles.id ✅**
   - `cnft_address` (TEXT) - Item cNFT
   - Already uses UUID, not PDA ✅

4. **`player_skill_experience`** - Skills
   - `player_pda` (TEXT) - **References player_pda (to be migrated)**

5. **`experience_logs`** - XP logs
   - `player_pda` (TEXT) - **References player_pda (to be migrated)**

---

## 🔄 Integration Approach

### 1. Extend `profiles` Table

**Instead of:** Creating new `player_accounts` table  
**We:** Add new columns to existing `profiles` table

```sql
ALTER TABLE profiles
  ADD COLUMN level INTEGER DEFAULT 1,
  ADD COLUMN wins INTEGER DEFAULT 0,
  ADD COLUMN losses INTEGER DEFAULT 0,
  ADD COLUMN lifetime_obx_earned BIGINT DEFAULT 0,
  ADD COLUMN lifetime_exp_spent BIGINT DEFAULT 0,
  ADD COLUMN pda_deprecated BOOLEAN DEFAULT false;
```

**Benefits:**
- ✅ No data migration needed
- ✅ Existing code continues to work
- ✅ Single source of truth
- ✅ Foreign keys already established

### 2. New Supporting Tables

**Create new tables that reference `profiles.id` (not player_pda):**

- `player_token_accounts` - Token account tracking
- `balance_transactions` - Balance audit trail
- `reward_transactions` - Reward tracking
- `player_character_cnfts` - Character cNFT tracking

**All reference:** `profiles.id` (UUID) instead of `player_pda` (TEXT)

### 3. Extend `nfts` Table

**Add treasury status fields:**

```sql
ALTER TABLE nfts
  ADD COLUMN treasury_status TEXT DEFAULT 'treasury',
  ADD COLUMN withdrawn_to TEXT,
  ADD COLUMN withdrawn_at TIMESTAMPTZ;
```

**Benefits:**
- ✅ Works with existing character NFT system
- ✅ Can track treasury status per NFT
- ✅ No duplicate data

### 4. Backward Compatibility

**During migration period:**
- Keep `player_pda` field (don't delete)
- Add `pda_deprecated` flag
- Create helper functions to map `player_pda` → `profiles.id`
- Gradually migrate references

---

## 🔑 Key Design Decisions

### Use `profiles.id` as Primary Identifier

**Before (PDA-based):**
```typescript
// Everything referenced player_pda
const playerPda = "5R1fB1mDrcf1QcvRiKHTWdws8YCcPDre5pDJkbuAFHvH";
await getPlayerByPDA(playerPda);
```

**After (UUID-based):**
```typescript
// Everything references profiles.id (user_id)
const playerId = "uuid-from-auth-users";
await getPlayerById(playerId);
```

### Token Accounts Reference `profiles.id`

```sql
CREATE TABLE player_token_accounts (
  player_id UUID NOT NULL REFERENCES profiles(id), -- NOT player_pda!
  token_account_address TEXT NOT NULL,
  mint_address TEXT NOT NULL,
  balance BIGINT DEFAULT 0,
  ...
);
```

### cNFTs Reference `profiles.id`

```sql
CREATE TABLE player_character_cnfts (
  player_id UUID NOT NULL REFERENCES profiles(id), -- NOT player_pda!
  asset_id TEXT NOT NULL,
  status TEXT DEFAULT 'treasury',
  ...
);
```

---

## 📋 Migration Path

### Phase 1: Extend Schema ✅
- Add new columns to `profiles`
- Create new supporting tables
- Add treasury status to `nfts`
- **No breaking changes** - existing code still works

### Phase 2: Migrate Token Accounts
- Create new Token-2022 accounts for existing players
- Migrate balances from PDA accounts
- Update `player_token_accounts` table
- Keep `cobx_token_account` in profiles for reference

### Phase 3: Migrate cNFTs
- Transfer all cNFTs from PDAs to treasury
- Update `nfts.treasury_status` to 'treasury'
- Update `player_character_cnfts` table
- Keep `player_pda` in `nfts` for reference

### Phase 4: Update Services
- Update services to use `profiles.id` instead of `player_pda`
- Update routes to use new services
- Keep backward compatibility during transition

### Phase 5: Deprecate PDAs
- Mark all `pda_deprecated = true`
- Eventually remove `player_pda` references (optional)

---

## 🔗 Foreign Key Relationships

### New Structure

```
users (auth.users)
  └─ profiles (id references users.id)
      ├─ player_token_accounts (player_id references profiles.id)
      ├─ balance_transactions (player_id references profiles.id)
      ├─ reward_transactions (player_id references profiles.id)
      ├─ player_character_cnfts (player_id references profiles.id)
      └─ player_items (player_id references profiles.id) ✅ Already correct!
```

### Backward Compatibility

```
profiles (player_pda) -- Deprecated but kept
  ├─ nfts (player_pda) -- Will migrate to player_id
  ├─ player_skill_experience (player_pda) -- Will migrate to player_id
  └─ experience_logs (player_pda) -- Will migrate to player_id
```

---

## 🎯 Benefits of Integration Approach

### 1. No Data Loss
- ✅ All existing data preserved
- ✅ No need to migrate player records
- ✅ Existing foreign keys maintained

### 2. Gradual Migration
- ✅ Can migrate incrementally
- ✅ Backward compatibility during transition
- ✅ No big-bang migration needed

### 3. Single Source of Truth
- ✅ `profiles` table remains the player record
- ✅ No duplicate player data
- ✅ Clear ownership model

### 4. Existing Code Compatibility
- ✅ `player_items` already uses `profiles.id` ✅
- ✅ Can update other tables gradually
- ✅ Services can be updated incrementally

---

## 📝 Service Updates Required

### Services to Update

1. **`player-accounts.ts`** ✅ Updated
   - Now uses `profiles` table
   - References `profiles.id` instead of new table

2. **`token-accounts.ts`** (To be created)
   - References `profiles.id`
   - Works with `player_token_accounts` table

3. **`token-operations.ts`** (To be created)
   - Uses `profiles.id` for all operations
   - Updates `balance_transactions` table

4. **`cnft-storage.ts`** (To be created)
   - Uses `profiles.id` for ownership
   - Works with `nfts` table (extended)
   - Uses `player_character_cnfts` for tracking

5. **Existing services** (To be updated)
   - `database.ts` - Update to use `profiles.id`
   - `nft-skill-experience.ts` - Migrate from `player_pda` to `player_id`
   - Routes - Update to use new services

---

## 🔄 Migration Helper Functions

### Get Player ID from PDA

```sql
CREATE FUNCTION get_player_id_from_pda(p_player_pda TEXT)
RETURNS UUID
AS $$
  SELECT id FROM profiles WHERE player_pda = p_player_pda LIMIT 1;
$$;
```

### Migration Queries

```sql
-- Migrate player_skill_experience from player_pda to player_id
UPDATE player_skill_experience pse
SET player_id = (SELECT id FROM profiles WHERE player_pda = pse.player_pda)
WHERE player_pda IS NOT NULL;

-- Migrate nfts from player_pda to player_id
UPDATE nfts n
SET player_id = (SELECT id FROM profiles WHERE player_pda = n.player_pda)
WHERE player_pda IS NOT NULL;
```

---

## ✅ Summary

**Integration Strategy:**
1. ✅ Extend `profiles` table (don't create new)
2. ✅ Create new supporting tables (reference `profiles.id`)
3. ✅ Extend `nfts` table (add treasury status)
4. ✅ Keep backward compatibility during migration
5. ✅ Gradually migrate from `player_pda` to `profiles.id`

**Key Principle:** Work with existing schema, don't replace it.
