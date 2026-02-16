# Off-Chain Integration - Quick Start Guide

## 🎯 Overview

The off-chain integration provides a database-backed alternative to Solana PDAs, eliminating SOL costs for new player accounts and improving performance.

## 🚀 Quick Start

### 1. Run Database Migration

```bash
psql $DATABASE_URL -f migrations/20250204_offchain_program_integration.sql
```

### 2. Deploy Backend

Routes are already registered in `src/index.ts`. Just deploy to Railway.

### 3. Deploy Frontend

Code is already updated. Just deploy to Vercel.

## 📡 New Endpoints

### Player Management
- `POST /api/players/initialize-web2-offchain` - Create player (no PDA)
- `GET /api/players/me-offchain` - Get player data
- `PATCH /api/players/me-offchain` - Update player stats

### Token Operations
- `GET /api/cobx/balance-offchain` - Get balance
- `POST /api/cobx/deposit-offchain` - Deposit OBX
- `POST /api/cobx/withdraw-offchain` - Withdraw cOBX
- `POST /api/cobx/reward-offchain` - Mint reward
- `GET /api/cobx/transactions-offchain` - Transaction history

### Character Slots
- `POST /api/character-cnft-slots/mint-offchain` - Mint character
- `GET /api/character-cnft-slots/offchain` - Get slots

## 🔄 How It Works

1. **New Players**: Use `-offchain` endpoints (no PDA creation)
2. **Existing Players**: Continue using old endpoints (backward compatible)
3. **Frontend**: Automatically tries new endpoints, falls back to old ones

## ✅ Benefits

- No SOL cost for new accounts
- Faster operations (database vs on-chain)
- No PDA management complexity
- Better scalability

## 📚 Documentation

- `INTEGRATION_FINAL_SUMMARY.md` - Complete overview
- `DEPLOYMENT_CHECKLIST.md` - Deployment guide
- `OFFCHAIN_ARCHITECTURE.md` - Architecture details

## ⚠️ Important

- Database migration must be run first
- Old endpoints remain functional
- No breaking changes
