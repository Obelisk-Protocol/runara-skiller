import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, signerIdentity } from '@metaplex-foundation/umi';

export type ClusterEnv = 'devnet' | 'mainnet-beta'

export function getCluster(): ClusterEnv {
  const raw = (process.env.SOLANA_CLUSTER || '').toLowerCase()
  if (raw === 'mainnet' || raw === 'mainnet-beta') return 'mainnet-beta'
  return 'devnet'
}

export function getRpcUrl(): string {
  const explicit = process.env.SOLANA_RPC_URL
  if (explicit && explicit.trim().length > 0) return explicit
  const c = getCluster()
  if (c === 'mainnet-beta') {
    return process.env.SOLANA_RPC_URL_MAINNET || 'https://api.mainnet-beta.solana.com'
  }
  return process.env.SOLANA_RPC_URL_DEVNET || 'https://api.devnet.solana.com'
}

export function getDasUrl(): string {
  const explicit = process.env.DAS_RPC_URL
  if (explicit && explicit.trim().length > 0) return explicit
  const c = getCluster()
  if (c === 'mainnet-beta') {
    return process.env.DAS_RPC_URL_MAINNET || ''
  }
  return process.env.DAS_RPC_URL_DEVNET || ''
}

const RPC_URL = getRpcUrl()

if (!process.env.PRIVATE_SERVER_WALLET) {
  throw new Error('Missing PRIVATE_SERVER_WALLET environment variable');
}

// Initialize UMI with Solana connection (exactly like frontend)
export const umi = createUmi(RPC_URL)
  .use(mplBubblegum())
  .use(mplTokenMetadata());

// Create server wallet keypair from private key (exactly like frontend)
const privateKeyArray = JSON.parse(process.env.PRIVATE_SERVER_WALLET);
const serverKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray));
const serverSigner = createSignerFromKeypair(umi, serverKeypair);

umi.use(signerIdentity(serverSigner));

console.log(`🔑 Server wallet: ${serverSigner.publicKey}`);
console.log(`🌐 Cluster: ${getCluster()} | RPC: ${RPC_URL}`)

// Export configured UMI instance and signer
export { serverSigner };

// Collection and tree constants per cluster
function getCollectionMint(): string {
  const c = getCluster()
  if (c === 'mainnet-beta') {
    return process.env.COLLECTION_MINT_MAINNET || ''
  }
  return process.env.COLLECTION_MINT_DEVNET || '3YW3f5Nt6WmzMJmGNGYbfcjLb82zS7w2e5qqqYMwkSwk'
}

function getPlayerMerkleTree(): string {
  const c = getCluster()
  if (c === 'mainnet-beta') {
    return process.env.MERKLE_TREE_MAINNET || ''
  }
  return process.env.MERKLE_TREE_DEVNET || '8FBkeY1sudjpMLFDUBrQ1MQ6iJhDyVKzm2ZvWScsTYhh'
}

export const COLLECTION_MINT = getCollectionMint()
export const MERKLE_TREE = getPlayerMerkleTree() // Player merkle tree (not items tree)