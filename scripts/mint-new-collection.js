/**
 * Mint a new Collection NFT for Runara character cNFTs.
 * 
 * Uses PRIVATE_SERVER_WALLET from the environment (or hardcoded below).
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
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=fe7d2dc0-06de-42b1-b947-0db7c3003797';
const PRIVATE_SERVER_WALLET = [100,48,215,186,81,201,3,197,22,124,134,3,88,142,244,120,207,127,8,102,18,205,159,198,14,138,0,61,70,151,0,102,4,190,179,234,174,99,235,10,191,113,254,205,97,135,16,8,193,69,17,196,162,7,61,166,204,15,165,219,221,251,44,74];

(async () => {
  try {
    // 1. Check balance first
    const connection = new Connection(RPC_URL, 'confirmed');
    const serverPubkey = new PublicKey('KXHnFbyda9vYLU4iqastL6cahbAoua1qdCvrJ9kAuYV');
    const balance = await connection.getBalance(serverPubkey);
    console.log(`💰 Server wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    
    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      console.error(`❌ Insufficient balance. Need at least 0.01 SOL, have ${balance / LAMPORTS_PER_SOL} SOL`);
      console.error(`   Send SOL to: KXHnFbyda9vYLU4iqastL6cahbAoua1qdCvrJ9kAuYV`);
      process.exit(1);
    }

    // 2. Set up UMI
    const umi = createUmi(RPC_URL);
    umi.use(mplTokenMetadata());

    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(PRIVATE_SERVER_WALLET));
    const signer = createSignerFromKeypair(umi, umiKeypair);
    umi.use(signerIdentity(signer));

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
