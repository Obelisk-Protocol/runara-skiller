import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { transferCNFTToWallet } from '../src/services/cnft';
import { serverSigner } from '../src/config/solana';

const TREASURY_WALLET = 'KXHnFbyda9vYLU4iqastL6cahbAoua1qdCvrJ9kAuYV';

interface ScanResult {
  owner: string;
  assets: Array<{
    id: string;
    owner: string;
    tree: string;
    groups: Array<{
      group_key: string;
      group_value: string;
      verified: boolean;
    }>;
  }>;
}

interface TransferResult {
  assetId: string;
  fromOwner: string;
  success: boolean;
  signature?: string;
  error?: string;
}

async function withdrawAllCNFTs() {
  console.log('🚀 Starting bulk cNFT withdrawal to treasury...');
  console.log(`📦 Treasury wallet: ${TREASURY_WALLET}`);
  console.log(`🔑 Server signer: ${serverSigner.publicKey.toString()}`);

  // Check if we should retry failures
  const resultsPath = path.join(__dirname, '../../ObeliskParadox/cnft-withdrawal-results.json');
  let transfers: Array<{ assetId: string; fromOwner: string }> = [];

  if (fs.existsSync(resultsPath)) {
    const previousResults = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    if (previousResults.failures && previousResults.failures.length > 0) {
      console.log(`🔄 Found ${previousResults.failures.length} previous failures - retrying those...`);
      transfers = previousResults.failures.map((f: TransferResult) => ({
        assetId: f.assetId,
        fromOwner: f.fromOwner,
      }));
    }
  }

  // If no failures to retry, do full scan
  if (transfers.length === 0) {
    // Load scan results
    const scanResultPath = path.join(__dirname, '../../ObeliskParadox/cnft-scan-result.json');
    if (!fs.existsSync(scanResultPath)) {
      throw new Error(`Scan results not found at ${scanResultPath}`);
    }

    const scanResults: ScanResult[] = JSON.parse(fs.readFileSync(scanResultPath, 'utf-8'));
    console.log(`📊 Loaded ${scanResults.length} owner groups from scan results`);

    // Collect all assets that need to be transferred (skip ones already in treasury)
    for (const group of scanResults) {
      if (group.owner === TREASURY_WALLET) {
        console.log(`⏭️  Skipping ${group.assets.length} assets already in treasury`);
        continue;
      }

      for (const asset of group.assets) {
        transfers.push({
          assetId: asset.id,
          fromOwner: group.owner,
        });
      }
    }
  }

  console.log(`\n🎯 Found ${transfers.length} cNFTs to transfer to treasury`);
  const uniqueOwners = new Set(transfers.map(t => t.fromOwner));
  console.log(`   From ${uniqueOwners.size} different owners\n`);

  if (transfers.length === 0) {
    console.log('✅ All cNFTs are already in treasury!');
    return;
  }

  // Execute transfers with rate limiting
  const results: TransferResult[] = [];
  const failures: TransferResult[] = [];

  for (let i = 0; i < transfers.length; i++) {
    const { assetId, fromOwner } = transfers[i];
    const shortId = `${assetId.slice(0, 8)}...${assetId.slice(-8)}`;
    const shortOwner = `${fromOwner.slice(0, 8)}...${fromOwner.slice(-8)}`;

    console.log(`[${i + 1}/${transfers.length}] Transferring ${shortId} from ${shortOwner}...`);

    try {
      // Use the existing transferCNFTToWallet function
      // It handles both PDA->wallet and server->wallet paths
      const result = await transferCNFTToWallet(
        assetId,
        fromOwner, // playerPDA (or server wallet if already in escrow)
        TREASURY_WALLET
      );

      if (result.success) {
        console.log(`   ✅ Success! TX: ${result.signature}`);
        results.push({
          assetId,
          fromOwner,
          success: true,
          signature: result.signature,
        });
      } else {
        console.log(`   ❌ Failed: ${result.error}`);
        failures.push({
          assetId,
          fromOwner,
          success: false,
          error: result.error,
        });
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message || error}`);
      failures.push({
        assetId,
        fromOwner,
        success: false,
        error: error.message || String(error),
      });
    }

    // Rate limiting: wait 500ms between transfers to avoid RPC throttling
    if (i < transfers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TRANSFER SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${results.length}`);
  console.log(`❌ Failed: ${failures.length}`);
  console.log(`📦 Total processed: ${transfers.length}`);

  // Save results
  const outputPath = path.join(__dirname, '../../ObeliskParadox/cnft-withdrawal-results.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        treasuryWallet: TREASURY_WALLET,
        summary: {
          total: transfers.length,
          successful: results.length,
          failed: failures.length,
        },
        successful: results,
        failures: failures,
      },
      null,
      2
    )
  );

  console.log(`\n💾 Results saved to: ${outputPath}`);

  if (failures.length > 0) {
    console.log('\n⚠️  Some transfers failed. Check the results file for details.');
    process.exit(1);
  } else {
    console.log('\n🎉 All cNFTs successfully transferred to treasury!');
  }
}

// Run it
withdrawAllCNFTs().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
