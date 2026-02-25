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
require('dotenv').config();
const RPC_URL = process.env.SOLANA_RPC_URL || process.env.DAS_RPC_URL_MAINNET || process.env.MAINNET_RPC_URL;
const PRIVATE_SERVER_WALLET_JSON = process.env.PRIVATE_SERVER_WALLET || process.env.SERVER_WALLET_KEY;
const COLLECTION_MINT = process.env.COLLECTION_MINT_MAINNET || process.env.CNFT_COLLECTION_ADDRESS;

if (!RPC_URL || !PRIVATE_SERVER_WALLET_JSON || !COLLECTION_MINT) {
  console.error('Set SOLANA_RPC_URL, PRIVATE_SERVER_WALLET, and COLLECTION_MINT_MAINNET in .env');
  process.exit(1);
}

const PRIVATE_SERVER_WALLET = JSON.parse(PRIVATE_SERVER_WALLET_JSON);

// New values
const NEW_NAME = 'Runara \u2014 Characters';
const NEW_URI = 'https://runara.fun/collection.json';

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  
  try {
    console.log(`\n=== Update Collection NFT Metadata ${dryRun ? '(DRY RUN)' : ''} ===\n`);

    // 1. Set up UMI and check balance
    const connection = new Connection(RPC_URL, 'confirmed');
    const umi = createUmi(RPC_URL).use(mplTokenMetadata());
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(PRIVATE_SERVER_WALLET));
    const signer = createSignerFromKeypair(umi, umiKeypair);
    umi.use(signerIdentity(signer));

    const serverPubkey = signer.publicKey;
    const balance = await connection.getBalance(serverPubkey);
    console.log(`Server wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

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
