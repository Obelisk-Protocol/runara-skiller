import 'dotenv/config';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';
import { getAssetWithProof } from '@metaplex-foundation/mpl-bubblegum';
import { publicKey } from '@metaplex-foundation/umi';
import { umi, serverSigner } from '../src/config/solana';

const PROGRAM_ID = new PublicKey('C7hwoCsPx8Gb1EzjhdvBtMix5Ew79UpCsSFT3ZwQDA4U');
const TREASURY_WALLET = 'KXHnFbyda9vYLU4iqastL6cahbAoua1qdCvrJ9kAuYV';
const SERVER_WALLET = serverSigner.publicKey.toString();

const failedAssets = [
  { assetId: '4E9Q5o2MNMdeM9k8Gfdc1f6fPYoSbZZA17wKPAunu5dp', fromOwner: '5R1fB1mDrcf1QcvRiKHTWdws8YCcPDre5pDJkbuAFHvH' },
  { assetId: 'FmGYms9Q4UJwkTbj6kiYhLUwzfNBooospjiJ579q5HSd', fromOwner: 'B7QGLFDFxcPoqp3hZXathKzFC4LQumnfoUqGMDCbTT6F' },
  { assetId: 'AXnVv9PbZzdRcdbCtWcEoP6AFvjfnsQtgkV3gx3iPkie', fromOwner: 'B7RKETP28TgY2ST3eAfdvnW46WKqx98fV5jkUsQxZBGY' },
  { assetId: '8Z5XMbJdKQW3kdQ1sQYVDG987z2o1fzjVuvkdtkrRzZP', fromOwner: 'Gu1JmN4hwkkWoKTiiZiMSNfiJK42ffagigdhsbgDnYdt' },
  { assetId: '7imawah43EgLPRM3HMA1TKfgDkh5Lw9MMY8jNSh4z5Vp', fromOwner: 'Gu1JmN4hwkkWoKTiiZiMSNfiJK42ffagigdhsbgDnYdt' },
];

interface ChangeDelegateResult {
  assetId: string;
  success: boolean;
  signature?: string;
  error?: string;
}

async function changeDelegates() {
  console.log('🚀 Starting delegate change for failed cNFTs...');
  console.log(`📦 Treasury wallet: ${TREASURY_WALLET}`);
  console.log(`🔑 Server signer: ${SERVER_WALLET}`);
  console.log(`📋 Program ID: ${PROGRAM_ID.toString()}\n`);

  // Load IDL
  const idlPath = path.join(__dirname, '../../ObeliskParadox/program/target/idl/tower_of_power.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`IDL not found at ${idlPath}. Please build the program first: cd ObeliskParadox/program && anchor build`);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load admin wallet (server wallet)
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(process.env.PRIVATE_SERVER_WALLET || '[]'))
  );

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(adminKeypair),
    { commitment: 'confirmed' }
  );
  anchor.setProvider(provider);

  const program = new anchor.Program(idl, provider);

  // Derive config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
  );

  const results: ChangeDelegateResult[] = [];

  for (const { assetId, fromOwner } of failedAssets) {
    try {
      console.log(`\n📦 Processing ${assetId.slice(0, 8)}...${assetId.slice(-8)}:`);
      console.log(`   Owner PDA: ${fromOwner}`);

      // Get asset proof and data
      const assetWithProof = await getAssetWithProof(umi, publicKey(assetId), {
        truncateCanopy: true,
      });

      const currentOwner = assetWithProof.leafOwner.toString();
      const currentDelegate = (assetWithProof as any)?.leafDelegate?.toString() || null;

      console.log(`   Current Owner: ${currentOwner}`);
      console.log(`   Current Delegate: ${currentDelegate || 'None'}`);

      // Verify it's still in the PDA
      if (currentOwner !== fromOwner) {
        console.log(`   ⚠️  Asset moved from PDA to ${currentOwner} - skipping`);
        results.push({
          assetId,
          success: false,
          error: `Asset moved from PDA to ${currentOwner}`,
        });
        continue;
      }

      // Get merkle tree and derive tree authority
      const merkleTree = new PublicKey(assetWithProof.treeId.toString());
      const [treeAuthority] = PublicKey.findProgramAddressSync(
        [merkleTree.toBuffer()],
        new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY') // Bubblegum program
      );

      // Derive tree config PDA
      const [treeConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('tree_config'), merkleTree.toBuffer()],
        new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY')
      );

      // Decode root, data_hash, creator_hash
      const root = Array.from(new PublicKey(assetWithProof.root.toString()).toBytes()) as any;
      const dataHash = Array.from(new PublicKey(assetWithProof.compression.dataHash.toString()).toBytes()) as any;
      const creatorHash = Array.from(new PublicKey(assetWithProof.compression.creatorHash.toString()).toBytes()) as any;
      const nonce = assetWithProof.compression.leafId;
      const index = assetWithProof.compression.leafId;

      // Get PlayerAccount to determine if web2 or web3
      const playerAccountPda = new PublicKey(fromOwner);
      const playerAccountInfo = await connection.getAccountInfo(playerAccountPda);
      
      if (!playerAccountInfo) {
        console.log(`   ❌ PlayerAccount not found for PDA ${fromOwner}`);
        results.push({
          assetId,
          success: false,
          error: `PlayerAccount not found`,
        });
        continue;
      }

      // Decode PlayerAccount to get authority
      const playerAccountData = program.coder.accounts.decode('playerAccount', playerAccountInfo.data);
      const authority = playerAccountData.authority;
      
      // Determine if web2 or web3 (web2 has web2_id set, web3 has authority = user wallet)
      // For now, we'll try web3 first (using authority), then web2 if that fails
      // Actually, we need web2_id_hash from the database or pass it as parameter
      // For simplicity, let's try web3 first (most common case)
      
      let web2IdHash: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number] | null = null;

      // Try to derive PDA with web3 seeds first
      const [web3Pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('player'), authority.toBuffer()],
        PROGRAM_ID
      );

      if (web3Pda.equals(playerAccountPda)) {
        console.log(`   ✅ Identified as Web3 player (authority: ${authority.toString()})`);
      } else {
        // Try web2 - but we need web2_id_hash
        // For now, we'll need to get it from database or pass as parameter
        console.log(`   ⚠️  Could not determine PDA seeds. Trying with web2_id_hash = null...`);
        // We'll need to update this to fetch web2_id_hash from database
      }

      // Build proof path from remaining accounts
      const proofPath = assetWithProof.proof.map((node: string) => ({
        pubkey: new PublicKey(node),
        isSigner: false,
        isWritable: false,
      }));

      // Call the program instruction
      console.log(`   🔄 Changing delegate from PDA to server wallet...`);
      
      const tx = await program.methods
        .adminChangeCnftDelegate(
          root,
          dataHash,
          creatorHash,
          new anchor.BN(nonce),
          index,
          web2IdHash
        )
        .accounts({
          config: configPda,
          admin: adminKeypair.publicKey,
          playerAccount: playerAccountPda,
          leafOwner: playerAccountPda,
          previousLeafDelegate: playerAccountPda, // Currently PDA is delegate
          newLeafDelegate: new PublicKey(SERVER_WALLET),
          merkleTree: merkleTree,
          treeConfig: treeConfig,
          treeCreator: treeAuthority,
          payer: adminKeypair.publicKey,
          bubblegumProgram: new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY'),
          compressionProgram: new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'),
          logWrapper: new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'),
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .remainingAccounts(proofPath)
        .rpc();

      console.log(`   ✅ Success! Signature: ${tx}`);
      results.push({
        assetId,
        success: true,
        signature: tx,
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
      results.push({
        assetId,
        success: false,
        error: error.message,
      });
    }
  }

  // Save results
  const resultsPath = path.join(__dirname, '../../ObeliskParadox/cnft-delegate-change-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

  console.log(`\n📊 Summary:`);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`   ✅ Successful: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`\n📝 Results saved to: ${resultsPath}`);
}

changeDelegates().catch(console.error);
