# Test Issues Found

## Issues to Fix

### 1. Database Connection Error
```
Error: getaddrinfo ENOTFOUND base
```

**Problem**: DATABASE_URL appears to be malformed. The error suggests the hostname might be "base" instead of a proper database host.

**Solution**: Check DATABASE_URL format. Should be:
```
postgresql://user:password@host:port/database
```

### 2. Missing Mint Configuration
```
Error: cOBX mint not configured for selected cluster
Error: OBX mint not configured for selected cluster
```

**Problem**: Environment variables `COBX_MINT_MAINNET` and `OBX_MINT_MAINNET` are not set.

**Solution**: Set these in Railway environment variables:
- `COBX_MINT_MAINNET` - Your cOBX mint address on mainnet
- `OBX_MINT_MAINNET` - Your OBX mint address on mainnet

### 3. Test Execution Order
**Problem**: Tests run in alphabetical order, causing cleanup to run before setup.

**Solution**: Fixed in test-runner.ts - tests now sort with setup first, cleanup last.

## Quick Fixes

1. **Check DATABASE_URL**:
   ```bash
   echo $DATABASE_URL
   # Should be: postgresql://user:pass@host:port/dbname
   ```

2. **Set Mint Addresses** (in Railway):
   - `COBX_MINT_MAINNET=your-cobx-mint-address`
   - `OBX_MINT_MAINNET=your-obx-mint-address`

3. **Re-run tests**:
   ```bash
   npm run test:offchain
   ```

## Current Test Status

- ✅ 4 tests passed (cNFT storage, cleanup)
- ❌ 38 tests failed (mostly due to config issues)
- ⚠️ Running on MAINNET - be careful!
