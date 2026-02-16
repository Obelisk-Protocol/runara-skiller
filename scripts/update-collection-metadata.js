/**
 * Update the Collection NFT on-chain metadata for the Runara rebrand.
 * 
 * Changes:
 *   - name: "Obelisk Paradox — Characters" -> "Runara — Characters"
 *   - uri: old collection.json URL -> "https://runara.fun/collection.json"
 * 
 * Usage:
 *   node scripts/update-collection-metadata.js [--dry-run]
 * 
 * Requirements:
 *   - Server wallet needs SOL for transaction fee (~0.000005 SOL)
 *   - Server wallet must be the update authority of the collection NFT
 */

const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { 
  mplTokenMetadata, 
  updateV1, 
  fetchMetadataFromSeeds 
} = require('@metaplex-foundation/mpl-token-metadata');
const {
  createSignerFromKeypair,
  signerIdentity,
  publicKey,
} = require('@metaplex-foundation/umi');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// ── Configuration ──
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=fe7d2dc0-06de-42b1-b947-0db7c3003797';
const PRIVATE_SERVER_WALLET = [100,48,215,186,81,201,3,197,22,124,134,3,88,142,244,120,207,127,8,102,18,205,159,198,14,138,0,61,70,151,0,102,4,190,179,234,174,99,235,10,191,113,254,205,97,135,16,8,193,69,17,196,162,7,61,166,204,15,165,219,221,251,44,74];
const COLLECTION_MINT = '7obTWkfujXNPnqjwrXZYkun4DUiAYox5T4i1ZQ6PQQ9Q';

// New values
const NEW_NAME = 'Runara \u2014 Characters';
const NEW_URI = 'https://runara.fun/collection.json';

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  
  try {
    console.log(`\n=== Update Collection NFT Metadata ${dryRun ? '(DRY RUN)' : ''} ===\n`);

    // 1. Check balance
    const connection = new Connection(RPC_URL, 'confirmed');
    const serverPubkey = new PublicKey('KXHnFbyda9vYLU4iqastL6cahbAoua1qdCvrJ9kAuYV');
    const balance = await connection.getBalance(serverPubkey);
    console.log(`Server wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    // 2. Set up UMI
    const umi = createUmi(RPC_URL);
    umi.use(mplTokenMetadata());

    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(PRIVATE_SERVER_WALLET));
    const signer = createSignerFromKeypair(umi, umiKeypair);
    umi.use(signerIdentity(signer));

    console.log(`Server wallet: ${signer.publicKey}`);
    console.log(`Collection mint: ${COLLECTION_MINT}`);
    console.log('');

    // 3. Fetch current metadata
    const mint = publicKey(COLLECTION_MINT);
    const currentMetadata = await fetchMetadataFromSeeds(umi, { mint });
    
    console.log('Current metadata:');
    console.log(`  Name: "${currentMetadata.name}"`);
    console.log(`  Symbol: "${currentMetadata.symbol}"`);
    console.log(`  URI: "${currentMetadata.uri}"`);
    console.log(`  Update Authority: ${currentMetadata.updateAuthority}`);
    console.log('');

    // Verify we are the update authority
    if (String(currentMetadata.updateAuthority) !== String(signer.publicKey)) {
      console.error('ERROR: Server wallet is NOT the update authority for this collection!');
      console.error(`  Expected: ${signer.publicKey}`);
      console.error(`  Actual:   ${currentMetadata.updateAuthority}`);
      process.exit(1);
    }

    console.log('New metadata:');
    console.log(`  Name: "${NEW_NAME}"`);
    console.log(`  URI: "${NEW_URI}"`);
    console.log('');

    if (dryRun) {
      console.log('[DRY RUN] Would update collection metadata. Run without --dry-run to execute.');
      process.exit(0);
    }

    // 4. Update the metadata
    console.log('Updating collection metadata on-chain...');
    
    const result = await updateV1(umi, {
      mint,
      authority: signer,
      data: {
        ...currentMetadata,
        name: NEW_NAME,
        uri: NEW_URI,
      },
    }).sendAndConfirm(umi, {
      send: { skipPreflight: false },
      confirm: { commitment: 'confirmed' },
    });

    console.log('');
    console.log('=== COLLECTION METADATA UPDATED SUCCESSFULLY ===');
    console.log('');
    console.log(`  Name: "${NEW_NAME}"`);
    console.log(`  URI: "${NEW_URI}"`);
    console.log('');

    // 5. Verify the update
    const updatedMetadata = await fetchMetadataFromSeeds(umi, { mint });
    console.log('Verification:');
    console.log(`  Name: "${updatedMetadata.name}"`);
    console.log(`  URI: "${updatedMetadata.uri}"`);
    
    const newBalance = await connection.getBalance(serverPubkey);
    console.log(`\nRemaining balance: ${newBalance / LAMPORTS_PER_SOL} SOL (cost: ${(balance - newBalance) / LAMPORTS_PER_SOL} SOL)`);

  } catch (error) {
    console.error('Failed to update collection metadata:', error);
    process.exit(1);
  }
})();
