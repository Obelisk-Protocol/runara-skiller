/**
 * Runara fresh setup: mint new collection NFT + create new merkle tree.
 * Use this when starting completely fresh for the Runara rebrand (clean install with no legacy migration).
 *
 * Usage:
 *   node scripts/setup-runara-fresh.js                # dry-run both steps
 *   node scripts/setup-runara-fresh.js --confirm      # mint collection + create tree (real txs)
 *   node scripts/setup-runara-fresh.js --confirm --write-env  # also update .env with new values
 *
 * Requirements:
 *   - PRIVATE_SERVER_WALLET (or SERVER_WALLET_KEY) with enough SOL (~0.02 SOL total)
 *   - .env in obelisk-skiller
 *   - MAINNET deps installed for tree step:  cd MAINNET && npm install
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

// Load .env: first value wins for duplicate keys
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) return;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  });
  console.log('Loaded .env from:', envPath);
}

const RPC_URL = process.env.MAINNET_RPC_URL || process.env.SOLANA_RPC_URL || process.env.DAS_RPC_URL_MAINNET || 'https://mainnet.helius-rpc.com/?api-key=fe7d2dc0-06de-42b1-b947-0db7c3003797';
const PRIVATE_KEY = process.env.PRIVATE_SERVER_WALLET || process.env.SERVER_WALLET_KEY;
const confirm = process.argv.includes('--confirm');
const writeEnv = process.argv.includes('--write-env');

async function mintRunaraCollection() {
  const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
  const { createNft, mplTokenMetadata } = require('@metaplex-foundation/mpl-token-metadata');
  const {
    createSignerFromKeypair,
    signerIdentity,
    generateSigner,
    percentAmount,
  } = require('@metaplex-foundation/umi');
  const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

  const secret = typeof PRIVATE_KEY === 'string' && PRIVATE_KEY.startsWith('[')
    ? JSON.parse(PRIVATE_KEY)
    : PRIVATE_KEY;
  if (!secret || !Array.isArray(secret)) {
    throw new Error('PRIVATE_SERVER_WALLET or SERVER_WALLET_KEY (JSON array) required');
  }

  const connection = new Connection(RPC_URL, 'confirmed');
  const umi = createUmi(RPC_URL);
  umi.use(mplTokenMetadata());
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(secret));
  const signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(signerIdentity(signer));

  const serverPubkey = new PublicKey(signer.publicKey);
  const balance = await connection.getBalance(serverPubkey);
  const balanceSol = balance / LAMPORTS_PER_SOL;
  const minRequired = 0.02;
  console.log('Server wallet:', serverPubkey.toBase58(), '| Balance:', balanceSol.toFixed(4), 'SOL');

  if (!confirm) {
    console.log('\n[DRY RUN] Would mint Runara collection NFT. Run with --confirm to execute.');
    if (balanceSol < minRequired) {
      console.log('Note: Need at least', minRequired, 'SOL for collection + tree. Send SOL to the address above.');
    }
    return null;
  }

  if (balance < minRequired * LAMPORTS_PER_SOL) {
    throw new Error(
      'Insufficient SOL. Need at least ' + minRequired + ' SOL for collection mint + merkle tree (have ' + balanceSol.toFixed(4) + ' SOL). Send SOL to: ' + serverPubkey.toBase58()
    );
  }

  const collectionMint = generateSigner(umi);
  await createNft(umi, {
    mint: collectionMint,
    name: 'Runara \u2014 Characters',
    symbol: 'PLAYER',
    uri: 'https://runara.fun/collection.json',
    sellerFeeBasisPoints: percentAmount(0),
    isCollection: true,
    creators: [{ address: signer.publicKey, verified: true, share: 100 }],
  }).sendAndConfirm(umi, { send: { skipPreflight: false }, confirm: { commitment: 'confirmed' } });

  const newCollectionMint = String(collectionMint.publicKey);
  console.log('\nRunara collection minted:', newCollectionMint);
  return newCollectionMint;
}

function createMerkleTree(confirmTree) {
  const mainnetDir = path.join(__dirname, '..', 'MAINNET');
  const treeScript = path.join(mainnetDir, 'create-merkle-tree.js');
  if (!fs.existsSync(treeScript)) {
    throw new Error('MAINNET/create-merkle-tree.js not found. Cannot create merkle tree.');
  }

  const env = {
    ...process.env,
    SERVER_WALLET_KEY: process.env.SERVER_WALLET_KEY || process.env.PRIVATE_SERVER_WALLET,
    MAINNET_RPC_URL: process.env.MAINNET_RPC_URL || process.env.SOLANA_RPC_URL || RPC_URL,
  };

  const args = confirmTree ? ['--confirm'] : ['--dry-run'];
  const result = spawnSync('node', ['create-merkle-tree.js', ...args], {
    cwd: mainnetDir,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    const msg = 'create-merkle-tree.js exited with ' + result.status + '. If you see MODULE_NOT_FOUND, run: cd MAINNET && npm install';
    throw new Error(msg);
  }

  const outPath = path.join(mainnetDir, process.env.OUTPUT_JSON || 'outputs.json');
  if (!confirmTree || !fs.existsSync(outPath)) return null;
  const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  return data.MERKLE_TREE || null;
}

async function main() {
  console.log('=== Runara fresh setup ===\n');

  const collectionMint = await mintRunaraCollection();
  if (!confirm) {
    console.log('\nMerkle tree: run with --confirm to create collection and tree.');
    console.log('  node scripts/setup-runara-fresh.js --confirm');
    return;
  }

  if (!collectionMint) {
    console.log('Skipping merkle tree (no collection minted).');
    return;
  }

  console.log('\nCreating new merkle tree...');
  const merkleTree = createMerkleTree(true);
  if (!merkleTree) {
    console.log('Merkle tree step did not return tree address. Check MAINNET/outputs.json.');
    return;
  }

  const snippet = [
    '# Runara fresh setup – add to .env and Railway',
    'COLLECTION_MINT_MAINNET=' + collectionMint,
    'CNFT_COLLECTION_ADDRESS=' + collectionMint,
    'MERKLE_TREE_MAINNET=' + merkleTree,
    '',
  ].join('\n');

  const outFile = path.join(__dirname, '..', 'runara-env.txt');
  fs.writeFileSync(outFile, snippet);
  console.log('\n--- Runara env (saved to runara-env.txt) ---');
  console.log(snippet);

  if (writeEnv) {
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const updates = [
      { key: 'COLLECTION_MINT_MAINNET', value: collectionMint },
      { key: 'CNFT_COLLECTION_ADDRESS', value: collectionMint },
      { key: 'MERKLE_TREE_MAINNET', value: merkleTree },
    ];
    for (const { key, value } of updates) {
      const re = new RegExp('^(' + key + ')=.*$', 'm');
      if (re.test(envContent)) {
        envContent = envContent.replace(re, key + '=' + value);
      } else {
        envContent = envContent.trimEnd() + '\n' + key + '=' + value + '\n';
      }
    }
    fs.writeFileSync(envPath, envContent);
    console.log('Updated obelisk-skiller/.env with new collection and merkle tree.');
  } else {
    console.log('Update obelisk-skiller/.env, envs.txt, and Railway with the above.');
    console.log('Or re-run with --write-env to update .env automatically.');
  }
  console.log('Then redeploy backend and set frontend NEXT_PUBLIC_CNFT_COLLECTION / NEXT_PUBLIC_PLAYER_MERKLE_TREE.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
