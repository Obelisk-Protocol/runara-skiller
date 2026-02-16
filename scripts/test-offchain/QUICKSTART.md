# Quick Start - Testing Off-Chain Services

## 1. Run Database Migration First

```bash
# Connect to your Railway database and run:
psql $DATABASE_URL -f migrations/20250204_offchain_program_integration.sql
```

Or if you have the migration file locally:
```bash
# Get DATABASE_URL from Railway dashboard
export DATABASE_URL="postgresql://user:pass@host:port/dbname"
psql $DATABASE_URL -f migrations/20250204_offchain_program_integration.sql
```

## 2. Set Environment Variables

Make sure these are set (Railway should have them):
- `DATABASE_URL` ✅
- `PRIVATE_SERVER_WALLET` ✅
- `SOLANA_CLUSTER` (devnet or mainnet-beta) ✅
- `COBX_MINT_DEVNET` or `COBX_MINT_MAINNET` ✅
- `OBX_MINT_DEVNET` or `OBX_MINT_MAINNET` ✅

## 3. Run Tests

```bash
# Run all tests
npm run test:offchain

# Run specific suite
tsx scripts/test-offchain/test-runner.ts --suite=test-player-accounts

# Cleanup test data
npm run test:offchain:cleanup
```

## 4. Expected Results

You should see:
- ✅ All setup tests pass
- ✅ All player account tests pass
- ✅ All token account tests pass
- ✅ All balance manager tests pass
- ⏭️ Token operations skipped (on-chain, disabled by default)
- ⏭️ cNFT operations skipped (on-chain, disabled by default)

## 5. If Tests Fail

1. **Check database connection**: Verify `DATABASE_URL` is correct
2. **Check migration**: Ensure migration was run successfully
3. **Check environment**: Verify all required env vars are set
4. **Check logs**: Look at test-results.json for detailed errors

## Common Issues

### "Table does not exist"
→ Run the migration script

### "Missing environment variable"
→ Set the required env var in Railway or .env file

### "Database connection failed"
→ Verify DATABASE_URL is correct and database is accessible

### "Solana config error"
→ Check SOLANA_CLUSTER and mint addresses match the cluster
