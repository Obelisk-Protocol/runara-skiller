# Testing Guide - Off-Chain Program Services

## Quick Start

1. **Run Migration** (if not already done):
   ```bash
   psql $DATABASE_URL -f migrations/20250204_offchain_program_integration.sql
   ```

2. **Run Tests**:
   ```bash
   npm run test:offchain
   ```

3. **Cleanup** (when done):
   ```bash
   npm run test:offchain:cleanup
   ```

## Test Suites

All test files are in `scripts/test-offchain/`:

- **test-runner.ts** - Main test runner
- **test-setup.ts** - Environment & database validation
- **test-player-accounts.ts** - Player account service
- **test-token-accounts.ts** - Token account service
- **test-balance-manager.ts** - Balance tracking
- **test-token-operations.ts** - On-chain operations (disabled by default)
- **test-cnft-storage.ts** - cNFT management
- **test-cleanup.ts** - Cleanup utilities

## What Gets Tested

### ✅ Database Operations (All Tested)
- Player account creation/retrieval
- Token account management
- Balance tracking
- Transaction history

### ⚠️ On-Chain Operations (Disabled by Default)
- Token minting
- Token transfers
- cNFT operations

**Note**: On-chain tests are commented out to prevent accidental SOL/token usage. Uncomment in test files to enable.

## Test Results

Results are saved to `scripts/test-offchain/test-results.json`.

## Requirements

- Database migration applied
- Environment variables set (DATABASE_URL, PRIVATE_SERVER_WALLET, etc.)
- Railway deployment (or local database)

## Documentation

- `scripts/test-offchain/README.md` - Full documentation
- `scripts/test-offchain/QUICKSTART.md` - Quick start guide
- `scripts/test-offchain/TEST_SUITE_SUMMARY.md` - Test coverage summary
