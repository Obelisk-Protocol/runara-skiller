import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { createHash } from 'crypto';
import idl from '../lib/anchor/tower_of_power.json';
import { getRpcUrl, getCluster } from './solana';

// Helper function to get server keypair
export function getServerKeypair(): Keypair {
  const serverWalletJson = process.env.PRIVATE_SERVER_WALLET;
  if (!serverWalletJson) {
    throw new Error('PRIVATE_SERVER_WALLET environment variable not set');
  }

  try {
    const secretKey = JSON.parse(serverWalletJson);
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
  } catch (error) {
    throw new Error('Invalid PRIVATE_SERVER_WALLET format');
  }
}

// Helper to create Web2 ID hash (returns Buffer to match frontend)
export function createWeb2IdHash(userId: string): Buffer {
  const hash = createHash('sha256').update(userId).digest();
  return Buffer.from(hash);
}

// Get Anchor Program ID from IDL
export const PROGRAM_ID = new PublicKey(idl.address);

// Initialize Solana connection
const connection = new Connection(getRpcUrl(), 'confirmed');

// Get server keypair
const serverKeypair = getServerKeypair();

// Create Anchor provider with server wallet
const wallet = {
  publicKey: serverKeypair.publicKey,
  signTransaction: async (tx: any) => {
    tx.sign(serverKeypair);
    return tx;
  },
  signAllTransactions: async (txs: any[]) => {
    txs.forEach((tx: any) => tx.sign(serverKeypair));
    return txs;
  },
} as any;

const provider = new AnchorProvider(connection, wallet, {
  commitment: 'confirmed',
});

// Create Program instance
export const program = new Program(idl as any, provider);

// Token mint helpers (matching frontend exactly)
export function getObxMint(): PublicKey {
  const cluster = getCluster();
  const candidate =
    cluster === 'mainnet-beta'
      ? process.env.OBX_MINT_MAINNET
      : process.env.OBX_MINT_DEVNET;

  if (!candidate) {
    throw new Error('OBX mint not configured for selected cluster');
  }
  return new PublicKey(candidate);
}

export function getCobxMint(): PublicKey {
  const cluster = getCluster();
  const candidate =
    cluster === 'mainnet-beta'
      ? process.env.COBX_MINT_MAINNET
      : process.env.COBX_MINT_DEVNET;

  if (!candidate) {
    throw new Error('cOBX mint not configured for selected cluster');
  }
  return new PublicKey(candidate);
}

// Export connection and server keypair for use in routes
export { connection, serverKeypair, provider };

