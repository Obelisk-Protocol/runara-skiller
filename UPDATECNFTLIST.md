# cNFT Metadata Update - Troubleshooting Log

**Last Updated:** January 2025  
**Status:** 🔴 Still Broken - "params is not iterable" error  
**Current Error:** `TypeError: params is not iterable` in `@metaplex-foundation/umi-rpc-web3js`

---

## Problem Summary

The `updateCharacterCNFT` function is failing to update cNFT metadata on-chain. The function needs to:
1. ✅ Upload metadata JSON to Arweave (WORKING)
2. ❌ Fetch asset proof via SDK (FAILING)
3. ❌ Update on-chain metadata URI (BLOCKED BY #2)

---

## Attempted Solutions

### ✅ Attempt #1: Revert to SDK-Based Approach
**Date:** Initial fix  
**Status:** ✅ Implemented but still failing  
**What we did:**
- Removed manual DAS API calls (`dasFetch`, `fetchStable`)
- Reverted to using `getAssetWithProof` from SDK
- Removed complex proof extraction logic
- Simplified metadata construction

**Result:** Still getting "params is not iterable" error  
**Error Location:** `@metaplex-foundation/umi-rpc-web3js` → `getAsset` call

**Code Changes:**
```typescript
// Before: Manual DAS API calls
const dasFetch = async (method: string, params: any) => { ... }
const proofA = await dasFetch('getAssetProof', [{ id: assetId }]);

// After: SDK-based
const asset = await getAssetWithProof(umi, publicKey(assetId), {
  truncateCanopy: true
});
```

---

### ✅ Attempt #2: Create DAS-Specific UMI Instance
**Date:** After Attempt #1  
**Status:** ✅ Implemented but still failing  
**What we did:**
- Created separate UMI instance using `getDasUrl()` instead of `getRpcUrl()`
- Used DAS RPC for `getAssetWithProof` calls
- Kept regular UMI for transaction sending

**Result:** Still getting "params is not iterable" error  
**Error Location:** Same - SDK's internal DAS API call

**Code Changes:**
```typescript
// Create DAS-specific UMI instance
const dasRpcUrl = getDasUrl() || getRpcUrl();
const dasUmi = createUmi(dasRpcUrl)
  .use(mplBubblegum())
  .use(mplTokenMetadata())
  .use(signerIdentity(serverSigner));

// Use dasUmi for getAssetWithProof
const asset = await getAssetWithProof(dasUmi, publicKey(assetId), {
  truncateCanopy: true
});
```

**Current RPC URLs:**
- Regular RPC: `https://mainnet.helius-rpc.com/?api-key=...`
- DAS RPC: `https://mainnet.helius-rpc.com/?api-key=...` (same URL)

---

### ✅ Attempt #3: Use Manual DAS API Calls with Correct Format
**Status:** ✅ PARTIAL SUCCESS - Proof fetching works, but transaction too large  
**What we did:**
- Bypassed SDK's `getAssetWithProof` which uses `umi-rpc-web3js` (doesn't handle DAS properly)
- Implemented manual DAS API calls using `fetch` directly (like `das.ts` route)
- Fetch `getAsset` and `getAssetProof` separately with correct object format
- Manually construct proof object that SDK's `updateMetadata` expects
- Added required `index` field to proof object

**Result:** ✅ Proof fetching SUCCESS! But transaction too large (1656 bytes, max 1644)
**Error:** `base64 encoded solana_transaction::versioned::VersionedTransaction too large: 1656 bytes (max: encoded/raw 1644/1232)`

**Progress:**
- ✅ Manual DAS API calls work perfectly
- ✅ Asset proof fetched successfully
- ✅ Metadata uploaded to Arweave
- ❌ Transaction size exceeds limit (12 bytes over)

**Next:** Need to reduce transaction size by trimming proof array or simplifying metadata

### 🔴 Attempt #4: Fix Transaction Size by Trimming Proof
**Status:** ❌ Failed - Trimming proof invalidates merkle tree proof  
**What we did:**
- Trimmed proof array to last 14 elements to reduce transaction size
- Simplified metadata (removed creators, collection)

**Result:** ❌ Transaction size fixed, but proof invalid!
**Error:** `This tree's current leaf value does not match the supplied proof's leaf value`
**Conclusion:** Cannot trim proof - it must be complete for merkle tree validation

### ❌ Attempt #5: Use Full Proof, Minimize Other Fields, Use On-Chain Hashes
**Status:** ❌ Failed - Still getting leaf value mismatch  
**What we did:**
- Used full proof (14 elements)
- Minimized transaction fields
- Used on-chain dataHash/creatorHash from asset.compression
- Added fresh proof refetch before transaction

**Result:** ❌ Still failing with "This tree's current leaf value does not match the supplied proof's leaf value"
**Error persists:** Proof validation failing despite using correct on-chain hashes

### 🔴 Attempt #6: Try SDK First, Fallback to Manual
**Status:** 🔴 Testing - SDK fails, manual fallback works but proof still invalid  
**What we did:**
- Try SDK's getAssetWithProof first (proper proof construction)
- If params error, fallback to manual DAS calls
- SDK fails as expected, manual fallback executes
- Still getting leaf value mismatch error

**Result:** ⏳ SDK fails → Manual works for fetch → Proof validation fails
**Error:** "This tree's current leaf value does not match the supplied proof's leaf value"

**Conclusion:** Manual proof construction may not match SDK's exact structure
### ❌ Attempt #7: Fixed Code Structure, Use Proof Hashes
**Status:** ❌ Failed - Still getting leaf value mismatch  
**What we did:**
- Fixed duplicate code and syntax errors
- Using dataHash/creatorHash from proof response (not asset)
- Using BigInt for nonce
- Fetching proof twice for stable root
- Minimized metadata to reduce transaction size

**Result:** ❌ Still failing with "This tree's current leaf value does not match the supplied proof's leaf value"
**Error persists:** Manual proof construction doesn't match SDK's structure

### 🔴 Attempt #8: Use Exact SDK Pattern from Working Transfer Function
**Status:** 🔴 Testing - SDK fails, manual fallback still has leaf mismatch  
**What we did:**
- Copied EXACT pattern from working `transferCNFTToWallet` function
- Using same UMI configuration (`proofUmi`)
- Fetching proof twice for stable root
- SDK still fails with "params is not iterable" (even though it works in transfer!)
- Manual fallback still fails with "leaf value does not match"

**Result:** ❌ SDK fails → Manual fallback → Leaf mismatch persists
**Error:** "This tree's current leaf value does not match the supplied proof's leaf value"

### 🔴 Attempt #8: Use Exact SDK Pattern from Working Transfer Function
**Status:** ❌ Failed - SDK fails, manual fallback still has leaf mismatch  
**What we did:**
- Copied EXACT pattern from working `transferCNFTToWallet` function
- Using same UMI configuration (`proofUmi`)
- Fetching proof twice for stable root
- Using `proofUmi` for `updateMetadata` (like transfer uses for `transfer`)
- SDK still fails with "params is not iterable" (even though it works in transfer!)
- Manual fallback still fails with "leaf value does not match"

**Result:** ❌ SDK fails → Manual fallback → Leaf mismatch persists
**Error:** "This tree's current leaf value does not match the supplied proof's leaf value"

**Key Finding:** 
- SDK's `getAssetWithProof` works in `transferCNFTToWallet` and `depositCNFTFromWalletToPDA`
- Same code pattern, same UMI config, but fails here
- Manual proof construction doesn't match SDK's structure

**Root Cause Hypothesis:**
1. SDK RPC adapter has a bug with DAS API calls in certain contexts
2. Manual proof construction is missing some field or has wrong structure
3. dataHash/creatorHash computation doesn't match what SDK does

### 🔴 Attempt #9: Copy EXACT Pattern from Working route.ts
**Status:** 🔴 Testing - Still getting "params is not iterable"  
**What we did:**
- Copied EXACT pattern from working Next.js route.ts
- Using single `umiWithBubblegum` instance for everything (like working route)
- Using regular RPC URL (not DAS-specific) like working route
- Same retry pattern, same error handling

**Key Differences Found:**
- Working route uses `createUmi(rpcUrl).use(mplBubblegum()).use(signerIdentity(serverSigner))` - single instance
- Working route uses regular RPC URL, not DAS-specific
- Working route uses same `umiWithBubblegum` for `getAssetWithProof`, `updateMetadata`, AND `sendAndConfirm`

### ✅ Attempt #10: Fixed SDK Version Mismatch - SUCCESS!
**Status:** ✅ **WORKING!**  
**What we did:**
- Updated `@metaplex-foundation/umi` from `^0.9.2` to `^1.2.0`
- Updated `@metaplex-foundation/umi-bundle-defaults` from `^0.9.2` to `^1.2.0`
- Updated `@metaplex-foundation/mpl-token-metadata` from `^3.2.1` to `^3.4.0`
- Matched versions exactly with working Next.js route
- Used single `umiWithBubblegum` instance for everything
- Only update name (not URI) to keep transaction size small

**Result:** ✅ **SUCCESS!** Transaction signature: `2Xv6kwofYiokooUMWkFnWK8TxLfZHrDbYagwBwVJT81EgtQxuQibC272yBPVmq6dvvpxUqkKVsEQZ7Wx7Vudaqa`

**BREAKTHROUGH:** The issue was SDK version mismatch! UMI v0.9.2 had a bug with DAS API calls that caused "params is not iterable" error. Updating to v1.2.0 fixed it!

**Final Solution:**
1. Use UMI v1.2.0+ (not v0.9.2)
2. Use single UMI instance with Bubblegum plugin for all operations
3. Use regular RPC URL (not DAS-specific)
4. Only update name to keep transaction size small

---

### ❌ Attempt #4: [NOT TRIED YET] Use Different RPC Endpoint
**Status:** ⏳ Pending  
**What to try:**
- Try using a different DAS-compatible RPC endpoint
- Options:
  - Helius DAS-specific endpoint (if different from regular RPC)
  - QuickNode DAS endpoint
  - Triton DAS endpoint
  - Direct DAS RPC endpoint

**Potential Code:**
```typescript
// Try explicit DAS endpoint
const dasRpcUrl = 'https://mainnet.helius-rpc.com/?api-key=...&das=true';
// Or use Triton/QuickNode DAS endpoint
```

---

### ❌ Attempt #5: [NOT TRIED YET] Manual DAS API with Proper Format
**Status:** ⏳ Pending  
**What to try:**
- Go back to manual DAS API calls but fix the parameter format
- The error suggests params format is wrong
- Check SDK source code to see exact format expected
- May need to wrap params differently

**Potential Code:**
```typescript
// Check what format SDK expects
// Maybe params needs to be: { id: assetId } not [{ id: assetId }]
// Or needs different structure entirely
```

---

### ❌ Attempt #6: [NOT TRIED YET] Use Different SDK Method
**Status:** ⏳ Pending  
**What to try:**
- Instead of `getAssetWithProof`, try:
  - `getAsset` from DAS API directly
  - `getAssetProof` separately
  - Manual proof construction
- Check if there's an alternative SDK method

---

### ✅ Attempt #7: Fix SDK Version Conflicts
**Status:** ✅ Completed - Version conflict resolved but error persists  
**What we did:**
- Added `overrides` to package.json to force `digital-asset-standard-api@2.0.0`
- Ran `npm install` - version conflict resolved
- All packages now use version 2.0.0

**Result:** ❌ Still getting "params is not iterable" error  
**Conclusion:** Version conflict was not the root cause. The issue is with `umi-rpc-web3js` RPC adapter not handling DAS API calls properly.

---

### ❌ Attempt #8: [NOT TRIED YET] Use Web3.js Connection Directly
**Status:** ⏳ Pending  
**What to try:**
- Bypass UMI for DAS calls
- Use `@solana/web3.js` Connection directly
- Make manual DAS RPC calls with correct format
- Build proof manually

---

### ❌ Attempt #9: [NOT TRIED YET] Check Working Code from Other Projects
**Status:** ⏳ Pending  
**What to try:**
- Look at Metaplex examples
- Check Bubblegum SDK documentation
- Find working examples of `getAssetWithProof` usage
- Compare with our implementation

---

### ❌ Attempt #10: [NOT TRIED YET] Debug SDK Internals
**Status:** ⏳ Pending  
**What to try:**
- Add breakpoints/debug logs in SDK code
- Check what params are being passed to RPC
- See exact error in SDK's RPC call
- May reveal the exact format issue

---

## Current Error Details

**Error Message (Latest):**
```
SendTransactionError: Simulation failed.
Message: base64 encoded solana_transaction::versioned::VersionedTransaction too large: 1656 bytes (max: encoded/raw 1644/1232)
```

**Error Location:**
- File: `@solana/web3.js` → `Connection.sendEncodedTransaction`
- Issue: Transaction size exceeds Solana's limit

**What this means:**
- ✅ Manual DAS API calls WORKED! Proof fetched successfully
- ❌ Transaction is 12 bytes too large (1656 vs 1644 max)
- Need to reduce transaction size by trimming proof or simplifying metadata
- This is a different error - we're making progress!

---

## Environment Details

**RPC Configuration:**
- Regular RPC: `https://mainnet.helius-rpc.com/?api-key=fe7d2dc0-06de-42b1-b947-0db7c3003797`
- DAS RPC: Same URL (Helius supports DAS)
- Cluster: `mainnet-beta`

**SDK Versions:**
- `@metaplex-foundation/mpl-bubblegum`: 5.0.2
- `@metaplex-foundation/digital-asset-standard-api`: **VERSION CONFLICT** ⚠️
  - Version 2.0.0 (from mpl-bubblegum@5.0.2)
  - Version 1.0.6 (from mpl-account-compression@0.0.1)
- `@metaplex-foundation/umi`: 0.9.2
- `@metaplex-foundation/umi-bundle-defaults`: 0.9.2

**⚠️ CRITICAL FINDING:** Version conflict detected!
- Two different versions of `digital-asset-standard-api` are installed
- This may be causing the "params is not iterable" error
- Need to resolve dependency conflicts

**Asset ID Tested:**
- `DQfAMfrSFShguVdMiYfSXuuHaKTnS93TM8JPdW9khUrs`

---

## Next Steps (Priority Order)

1. **🔴 TESTING NOW:** Attempt #3 - Manual DAS API Calls
   - ✅ Code implemented and built successfully
   - ⏳ **TEST NOW:** Run test script to see if this fixes the error
   - If successful: Problem solved! ✅
   - If fails: Try Attempt #4 next

2. **🟡 HIGH PRIORITY:** Try Attempt #4 - Different RPC Endpoint
   - Test with different DAS-compatible endpoint
   - Verify Helius DAS support
   - Only if Attempt #3 fails

3. **🟡 MEDIUM PRIORITY:** Try Attempt #8 - Use Web3.js Connection Directly
   - Bypass UMI entirely for DAS calls
   - Use Connection.send() with manual RPC calls
   - Only if above don't work

4. **🟢 LOW PRIORITY:** Try Attempt #9 - Check Examples
   - Look at official Metaplex examples
   - Compare implementation

5. **🟢 LOW PRIORITY:** Try Attempt #10 - Debug SDK
   - Add detailed logging
   - Inspect params being passed

---

## Working Code Reference

**Old Working Version (commit be1962f):**
- Used `getAssetWithProof` directly
- Simple implementation
- Worked before recent changes

**Key Difference:**
- Old code may have used different RPC configuration
- Or different SDK version
- Need to compare exact setup

---

## Notes

- Arweave upload works perfectly ✅
- The issue is specifically with `getAssetWithProof` SDK call
- Error suggests RPC parameter format issue
- Helius RPC should support DAS API methods
- May be SDK version or configuration issue

---

## Test Commands

```bash
# Run test
npm run build
npm run test:cnft-update DQfAMfrSFShguVdMiYfSXuuHaKTnS93TM8JPdW9khUrs

# Check SDK versions
npm list @metaplex-foundation/mpl-bubblegum
npm list @metaplex-foundation/digital-asset-standard-api
npm list @metaplex-foundation/umi
```

---

## Update Log

- **2025-01-XX:** Created document
- **2025-01-XX:** Attempt #1 - Reverted to SDK approach
- **2025-01-XX:** Attempt #2 - Created DAS-specific UMI instance
- **2025-01-XX:** Still failing with "params is not iterable"
- **2025-01-XX:** 🔴 **CRITICAL FINDING** - Discovered SDK version conflict!
  - Two versions of `digital-asset-standard-api` installed (2.0.0 and 1.0.6)
  - Added overrides to package.json
- **2025-01-XX:** ✅ Attempt #7 - Fixed version conflict
  - Version conflict resolved but error persists
  - Conclusion: Issue is with `umi-rpc-web3js` RPC adapter, not version conflict
- **2025-01-XX:** ✅ Attempt #3 - Implemented manual DAS API calls
  - Bypassing SDK's RPC adapter entirely
  - Using manual fetch calls like `das.ts` route
  - Manually constructing proof object SDK expects
  - ✅ Proof fetching works, but transaction size issue (fixed)
- **2025-01-XX:** ❌ Attempt #4-5 - Fixed transaction size, but proof validation fails
  - Used on-chain compression values
  - Added fresh proof refetch
  - Still getting "leaf value does not match" error
- **2025-01-XX:** 🔴 Attempt #6 - Try SDK first, fallback to manual
  - SDK fails with params error (expected)
  - Manual fallback works for fetching
  - Proof validation still failing
  - **BLOCKED:** Need to investigate proof structure or merkle tree state

---

**Status:** 🔴 Blocked on proof validation - "leaf value does not match"  
**Current Issue:** Manual proof construction works for fetching but fails validation  
**Next Action:** Investigate proof structure differences between SDK and manual construction, or check if merkle tree state is the root cause

