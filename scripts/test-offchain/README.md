# Off-Chain Program Services Test Suite

Comprehensive test suite for the off-chain program services.

## Prerequisites

1. **Database Migration**: Run the migration script first:
   ```bash
   # Apply the migration
   psql $DATABASE_URL -f migrations/20250204_offchain_program_integration.sql
   ```

2. **Environment Variables**: Ensure these are set:
   - `DATABASE_URL` - PostgreSQL connection string
   - `PRIVATE_SERVER_WALLET` - Server wallet private key (JSON array)
   - `SOLANA_CLUSTER` - `devnet` or `mainnet-beta`
   - `COBX_MINT_DEVNET` / `COBX_MINT_MAINNET` - cOBX mint address
   - `OBX_MINT_DEVNET` / `OBX_MINT_MAINNET` - OBX mint address

## Running Tests

### Run All Tests
```bash
npm run test:offchain
```

### Run Specific Test Suite
```bash
tsx scripts/test-offchain/test-runner.ts --suite=test-player-accounts
tsx scripts/test-offchain/test-runner.ts --suite=test-token-accounts
tsx scripts/test-offchain/test-runner.ts --suite=test-balance-manager
```

### Cleanup Test Data
```bash
npm run test:offchain:cleanup
```

## Test Suites

### 1. **test-setup** - Environment & Database Validation
- ✅ Database connection
- ✅ Database schema (tables exist)
- ✅ Environment variables
- ✅ Solana configuration

### 2. **test-player-accounts** - Player Account Management
- ✅ Initialize player
- ✅ Get player by user ID
- ✅ Get player by wallet
- ✅ Update player stats
- ✅ Player existence check

### 3. **test-token-accounts** - Token Account Management
- ✅ Create token account
- ✅ Get token account
- ✅ Get all player token accounts
- ✅ Ensure token account (create if missing)
- ✅ Sync balance with on-chain

### 4. **test-balance-manager** - Balance Tracking
- ✅ Get balance
- ✅ Update balance (deposit, reward)
- ✅ Transaction history
- ✅ Balance sync with on-chain
- ✅ Insufficient balance validation

### 5. **test-token-operations** - On-Chain Operations
- ✅ Mint reward (mints real tokens on-chain)
- ✅ Transfer between players (transfers real tokens on-chain)
- ⏭️ Deposit OBX (requires manual OBX deposit transaction)
- ✅ Withdraw OBX (burns cOBX and sends OBX on-chain)

**Note**: On-chain operations will use real SOL and tokens. Be careful on mainnet!

### 6. **test-cnft-storage** - cNFT Management
- ✅ Get player cNFTs
- ✅ Get treasury cNFTs
- ✅ Get cNFT by asset ID
- ⏭️ Mint to treasury (not yet implemented in service)
- ✅ Withdraw cNFT (withdraws real cNFTs on-chain, if available)

### 7. **test-cleanup** - Cleanup
- ✅ Cleanup all test data

## Test Results

Test results are saved to `scripts/test-offchain/test-results.json` after each run.

## Test Data

All test data is prefixed with `test_` in the `character_name` field. The cleanup script removes all test data automatically.

## Safety Notes

⚠️ **On-Chain Operations**: Tests that perform actual on-chain operations (minting, transfers, withdrawals) are **ENABLED** and will use real SOL and tokens.

⚠️ **Mainnet**: Be extremely careful when running on-chain tests on mainnet. They will use real SOL and tokens. The test runner will warn you if running on mainnet.

⚠️ **Devnet**: On devnet, you can use test tokens without real cost, but you still need devnet SOL for transaction fees.

## Troubleshooting

### Database Connection Errors
- Verify `DATABASE_URL` is set correctly
- Check database is accessible from your network
- Ensure migration has been run

### Missing Tables
- Run the migration: `psql $DATABASE_URL -f migrations/20250204_offchain_program_integration.sql`

### Solana Config Errors
- Verify `SOLANA_CLUSTER` is set to `devnet` or `mainnet-beta`
- Check mint addresses are set for the correct cluster
- Verify `PRIVATE_SERVER_WALLET` is a valid JSON array

### Test Failures
- Check test results JSON file for detailed error messages
- Verify environment variables are set correctly
- Ensure database schema matches migration

## Example Output

```
🧪 Off-Chain Program Services Test Runner
════════════════════════════════════════════════════════════
✅ Environment validated
   Database: Connected
   Cluster: devnet

📦 Running test suite: test-setup
────────────────────────────────────────────────────────────
  ✅ Database connected: 2025-02-04T12:00:00.000Z
  ✅ Table exists: profiles
  ✅ Table exists: player_token_accounts
  ...

📊 Test Summary
════════════════════════════════════════════════════════════
✅ test-setup: 5/5 passed (123ms)
✅ test-player-accounts: 8/8 passed (456ms)
✅ test-token-accounts: 7/7 passed (789ms)
...

Total: 25 passed, 0 failed
```
