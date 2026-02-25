# Frontend Integration Guide - Off-Chain Services

## Overview

The frontend (`runara`) needs to be updated to use the new off-chain backend services instead of the old Anchor program-based routes.

## New Backend Endpoints

### Player Management (No PDAs)

**Old:** `POST /api/players/initialize-web2` (creates PDA)
**New:** `POST /api/players/initialize-web2-offchain` (database only)

```typescript
// New endpoint - no PDA creation
POST /api/players/initialize-web2-offchain
Body: {
  name?: string,
  characterClass?: number,
  walletAddress?: string
}
Response: {
  success: true,
  player: {
    id: string,
    character_name: string,
    character_class: number,
    level: number,
    wins: number,
    losses: number
  }
}
```

**Get Player:**
```typescript
GET /api/players/me-offchain
Response: {
  success: true,
  player: { ... }
}
```

**Update Player:**
```typescript
PATCH /api/players/me-offchain
Body: {
  character_name?: string,
  level?: number,
  wins?: number,
  losses?: number,
  ...
}
```

### Token Operations (Off-Chain)

**Balance:**
```typescript
GET /api/cobx/balance-offchain
Response: {
  balance: number,
  formattedBalance: string,
  accountExists: boolean,
  account: string,
  synced: boolean,
  lastSynced: Date | null
}
```

**Transaction History:**
```typescript
GET /api/cobx/transactions-offchain?limit=50&offset=0
Response: {
  success: true,
  transactions: [...],
  total: number
}
```

## Frontend Changes Required

### 1. Update Player Initialization

**File:** `runara/src/components/auth/auth-provider.tsx`

Change:
```typescript
// OLD
const response = await fetch(`${backendUrl}/api/players/initialize-web2`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'Player',
    characterClass: 0,
  })
})

// NEW
const response = await fetch(`${backendUrl}/api/players/initialize-web2-offchain`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'Player',
    characterClass: 0,
  })
})
```

### 2. Update cOBX Balance Hook

**File:** `runara/src/hooks/use-cobx.ts`

Change balance fetch to use off-chain endpoint:
```typescript
// OLD - uses PDA/on-chain
const response = await fetch(`${backendUrl}/api/cobx/balance`, { ... })

// NEW - uses database
const response = await fetch(`${backendUrl}/api/cobx/balance-offchain`, { ... })
```

### 3. Remove PDA Dependencies

**Files to update:**
- `runara/src/hooks/use-cobx.ts` - Remove PDA checks
- `runara/src/components/auth/auth-provider.tsx` - Remove PDA initialization checks
- `runara/src/hooks/use-player-cnft.ts` - Update to use new endpoints

### 4. Update Profile Fetching

**File:** `runara/src/lib/backend-api.ts`

The existing `fetchProfile` should work, but ensure it doesn't require `player_pda` for new players.

## Migration Strategy

1. **Backward Compatibility**: Old endpoints still work for existing players with PDAs
2. **New Players**: Use `-offchain` endpoints (no PDA creation)
3. **Gradual Migration**: Existing players can continue using old endpoints until migrated

## Benefits

- ✅ No SOL cost for player account creation
- ✅ Faster operations (database vs on-chain)
- ✅ No PDA management complexity
- ✅ Easier to scale
