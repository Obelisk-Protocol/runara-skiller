/**
 * Mint a new Collection NFT for Runara character cNFTs.
 * 
 * Uses PRIVATE_SERVER_WALLET from the environment.
 * Creates a proper Metaplex NFT with metadata + master edition.
 * 
 * Usage:
 *   node scripts/mint-new-collection.js
 * 
 * Requirements:
 *   - Server wallet needs ~0.02 SOL on mainnet
 *   - npm packages already installed in obelisk-skiller
 */

const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { createNft, mplTokenMetadata } = require('@metaplex-foundation/mpl-token-metadata');
const {
  createSignerFromKeypair,
  signerIdentity,
  generateSigner,
  percentAmount,
  publicKey,
} = require('@metaplex-foundation/umi');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// ── Configuration ──
require('dotenv').config();
const RPC_URL = process.env.SOLANA_RPC_URL || process.env.DAS_RPC_URL_MAINNET || process.env.MAINNET_RPC_URL;
const PRIVATE_SERVER_WALLET_JSON = process.env.PRIVATE_SERVER_WALLET || process.env.SERVER_WALLET_KEY;

if (!RPC_URL || !PRIVATE_SERVER_WALLET_JSON) {
  console.error('Set SOLANA_RPC_URL and PRIVATE_SERVER_WALLET in .env');
  process.exit(1);
}

const PRIVATE_SERVER_WALLET = JSON.parse(PRIVATE_SERVER_WALLET_JSON);

(async () => {
  try {
    // 1. Set up UMI and check balance
    const connection = new Connection(RPC_URL, 'confirmed');
    const umi = createUmi(RPC_URL).use(mplTokenMetadata());
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(PRIVATE_SERVER_WALLET));
    const signer = createSignerFromKeypair(umi, umiKeypair);
    umi.use(signerIdentity(signer));

    const serverPubkey = signer.publicKey;
    const balance = await connection.getBalance(serverPubkey);
    console.log(`💰 Server wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      console.error(`❌ Insufficient balance. Need at least 0.01 SOL, have ${balance / LAMPORTS_PER_SOL} SOL`);
      console.error(`   Send SOL to: ${serverPubkey}`);
      process.exit(1);
    }

    // 2. Create collection NFT
    console.log(`🔑 Server wallet: ${signer.publicKey}`);
    console.log(`🌐 RPC: ${RPC_URL}`);
    console.log('');
    console.log('🎨 Creating new Collection NFT...');

    // 3. Create the collection NFT
    const collectionMint = generateSigner(umi);

    const result = await createNft(umi, {
      mint: collectionMint,
      name: 'Runara \u2014 Characters',
      symbol: 'PLAYER',
      uri: 'https://runara.fun/collection.json',
      sellerFeeBasisPoints: percentAmount(0),
      isCollection: true,
      creators: [
        { address: signer.publicKey, verified: true, share: 100 }
      ],
    }).sendAndConfirm(umi, {
      send: { skipPreflight: false },
      confirm: { commitment: 'confirmed' },
    });

    const newCollectionMint = String(collectionMint.publicKey);
    
    // 4. Derive and verify PDAs
    const TOKEN_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const mintPubkey = new PublicKey(newCollectionMint);
    
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM.toBuffer(), mintPubkey.toBuffer()],
      TOKEN_METADATA_PROGRAM
    );
    const [editionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM.toBuffer(), mintPubkey.toBuffer(), Buffer.from('edition')],
      TOKEN_METADATA_PROGRAM
    );

    // Verify accounts exist
    const metaInfo = await connection.getAccountInfo(metadataPda);
    const edInfo = await connection.getAccountInfo(editionPda);

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ NEW COLLECTION NFT CREATED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log(`  Collection Mint:    ${newCollectionMint}`);
    console.log(`  Metadata PDA:       ${metadataPda.toBase58()}`);
    console.log(`  Master Edition:     ${editionPda.toBase58()}`);
    console.log(`  Metadata exists:    ${metaInfo ? '✅ YES' : '❌ NO'}`);
    console.log(`  Edition exists:     ${edInfo ? '✅ YES' : '❌ NO'}`);
    console.log('');
    console.log('📋 NEXT STEPS:');
    console.log(`  1. Update Railway env var COLLECTION_MINT_MAINNET to: ${newCollectionMint}`);
    console.log(`  2. Update Railway env var CNFT_COLLECTION_ADDRESS to: ${newCollectionMint}`);
    console.log(`  3. Update local .env files with the new collection mint`);
    console.log(`  4. Redeploy: railway up`);
    console.log('');

    // Remaining balance
    const newBalance = await connection.getBalance(serverPubkey);
    console.log(`💰 Remaining balance: ${newBalance / LAMPORTS_PER_SOL} SOL (cost: ${(balance - newBalance) / LAMPORTS_PER_SOL} SOL)`);

  } catch (error) {
    console.error('❌ Failed to create collection NFT:', error);
    process.exit(1);
  }
})();
