import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, signerIdentity } from '@metaplex-foundation/umi';

if (!process.env.SOLANA_RPC_URL) {
  throw new Error('Missing SOLANA_RPC_URL environment variable');
}

if (!process.env.PRIVATE_SERVER_WALLET) {
  throw new Error('Missing PRIVATE_SERVER_WALLET environment variable');
}

// Initialize UMI with Solana connection (exactly like frontend)
export const umi = createUmi(process.env.SOLANA_RPC_URL)
  .use(mplBubblegum())
  .use(mplTokenMetadata());

// Create server wallet keypair from private key (exactly like frontend)
const privateKeyArray = JSON.parse(process.env.PRIVATE_SERVER_WALLET);
const serverKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray));
const serverSigner = createSignerFromKeypair(umi, serverKeypair);

umi.use(signerIdentity(serverSigner));

console.log(`🔑 Server wallet: ${serverSigner.publicKey}`);

// Export configured UMI instance and signer
export { serverSigner };

// Collection and tree constants (exactly matching your working frontend)
export const COLLECTION_MINT = '3YW3f5Nt6WmzMJmGNGYbfcjLb82zS7w2e5qqqYMwkSwk';
export const MERKLE_TREE = '8FBkeY1sudjpMLFDUBrQ1MQ6iJhDyVKzm2ZvWScsTYhh'; // Player merkle tree (not items tree)