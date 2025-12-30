/**
 * 🎯 PURE BUBBLEGUM CONFIGURATION FOR ITEMS
 * 
 * Item merkle tree configuration (separate from player tree)
 */

import { getCluster, getRpcUrl } from './solana';

export interface BubblegumConfig {
  COLLECTION_MINT: string;
  MERKLE_TREE: string; // Item merkle tree (not player tree)
  RPC_URL: string;
}

function getItemCollectionMint(): string {
  const c = getCluster();
  if (c === 'mainnet-beta') {
    return process.env.ITEM_COLLECTION_MINT_MAINNET || process.env.COLLECTION_MINT_MAINNET || '';
  }
  return process.env.ITEM_COLLECTION_MINT_DEVNET || process.env.COLLECTION_MINT_DEVNET || '3YW3f5Nt6WmzMJmGNGYbfcjLb82zS7w2e5qqqYMwkSwk';
}

function getItemMerkleTree(): string {
  const c = getCluster();
  if (c === 'mainnet-beta') {
    return process.env.ITEM_MERKLE_TREE_MAINNET || '';
  }
  // Use item tree if specified, otherwise fall back to player tree (for compatibility)
  return process.env.ITEM_MERKLE_TREE_DEVNET || process.env.MERKLE_TREE_DEVNET || 'AN3cvCd5BzHK2mvoj5txHiLE7dkZzNfAyquwx7ww3ekT';
}

export function getBubblegumConfig(): BubblegumConfig {
  return {
    COLLECTION_MINT: getItemCollectionMint(),
    MERKLE_TREE: getItemMerkleTree(),
    RPC_URL: getRpcUrl()
  };
}

// Updated collection config for PURE Bubblegum Items
export const OBELISK_ITEM_COLLECTION_V2 = {
  name: "Obelisk Paradox Items V2",
  symbol: "OPI2", 
  description: "Pure Bubblegum compressed NFT items from Obelisk Paradox",
  image: "https://obeliskparadox.com/images/collection-cover.png",
  external_url: "https://obeliskparadox.com",
  family: "Obelisk Paradox",
  category: "gaming",
  attributes: [
    { trait_type: "Collection Type", value: "Pure Bubblegum cNFTs" },
    { trait_type: "Blockchain", value: "Solana" },
    { trait_type: "Standard", value: "Metaplex Bubblegum v2" }
  ]
};

