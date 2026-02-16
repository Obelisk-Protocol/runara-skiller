/**
 * cNFT Storage Service
 * Manages cNFT treasury storage and withdrawals
 * 
 * All cNFTs are minted to treasury wallet and stored there until withdrawal.
 * Ownership is tracked in database (nfts table + player_character_cnfts table).
 */

import { PublicKey } from '@solana/web3.js';
import { pgQuerySingle, pgQuery } from '../../utils/pg-helper';
import { serverSigner } from '../../config/solana';
import { transferCNFTToWallet } from '../cnft';
import { PlayerCharacterCNFT } from './types';

const TREASURY_WALLET = serverSigner.publicKey.toString();

export interface MintCNFTToTreasuryParams {
  playerId: string; // profiles.id
  metadata: {
    name: string;
    description?: string;
    image?: string;
    attributes?: Array<{ trait_type: string; value: string | number }>;
  };
  slotNumber?: number; // Character slot (1-5)
}

export interface CNFTWithdrawParams {
  playerId: string;
  assetId: string;
  walletAddress: string;
}

/**
 * Mint cNFT to treasury wallet
 * Ownership tracked in database
 */
export async function mintToTreasury(params: MintCNFTToTreasuryParams): Promise<PlayerCharacterCNFT> {
  const { playerId, metadata, slotNumber } = params;

  // TODO: Implement actual cNFT minting to treasury
  // This should use the existing cnft service but mint to treasury instead of player PDA
  // For now, this is a placeholder that shows the structure

  // The actual minting will be done by the existing cnft service
  // but we'll track it in the new player_character_cnfts table

  // Placeholder: In real implementation, call mint service with treasury as owner
  // const mintResult = await mintCompressedNFT({
  //   tree: PLAYER_TREE,
  //   leafOwner: TREASURY_WALLET,
  //   metadata: characterMetadata
  // });

  // For now, return a structure showing what will be stored
  throw new Error('Minting to treasury not yet implemented - use existing cnft service and update tracking');
}

/**
 * Get all cNFTs for a player (from database)
 */
export async function getPlayerCNFTs(playerId: string): Promise<PlayerCharacterCNFT[]> {
  const result = await pgQuery(
    `SELECT * FROM player_character_cnfts 
     WHERE player_id = $1 
     ORDER BY created_at DESC`,
    [playerId]
  );

  if (result.error || !result.data) {
    return [];
  }

  return result.data.map(row => ({
    ...row,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    withdrawn_at: row.withdrawn_at ? new Date(row.withdrawn_at) : null
  })) as PlayerCharacterCNFT[];
}

/**
 * Get cNFTs in treasury (not withdrawn)
 */
export async function getTreasuryCNFTs(playerId?: string): Promise<PlayerCharacterCNFT[]> {
  let query = `SELECT * FROM player_character_cnfts WHERE status = 'treasury'`;
  const params: any[] = [];

  if (playerId) {
    query += ` AND player_id = $1`;
    params.push(playerId);
  }

  query += ` ORDER BY created_at DESC`;

  const result = await pgQuery(query, params);

  if (result.error || !result.data) {
    return [];
  }

  return result.data.map(row => ({
    ...row,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    withdrawn_at: row.withdrawn_at ? new Date(row.withdrawn_at) : null
  })) as PlayerCharacterCNFT[];
}

/**
 * Withdraw cNFT from treasury to player wallet
 */
export async function withdrawCNFT(params: CNFTWithdrawParams): Promise<{ signature: string }> {
  const { playerId, assetId, walletAddress } = params;

  // Get cNFT from database
  const cnft = await pgQuerySingle<PlayerCharacterCNFT>(
    `SELECT * FROM player_character_cnfts 
     WHERE player_id = $1 AND asset_id = $2 AND status = 'treasury'`,
    [playerId, assetId]
  );

  if (cnft.error || !cnft.data) {
    throw new Error('cNFT not found in treasury for this player');
  }

  // Get player PDA for transfer (backward compatibility during migration)
  // TODO: Once fully migrated, we can use treasury wallet directly
  const { getPlayerByPDA } = await import('./player-accounts');
  const { pgQuerySingle: pgQuery } = await import('../../utils/pg-helper');
  
  // Get player_pda from profiles for transfer
  const profile = await pgQuery<{ player_pda: string }>(
    `SELECT player_pda FROM profiles WHERE id = $1`,
    [playerId]
  );

  if (!profile.data || !profile.data[0]?.player_pda) {
    throw new Error('Player PDA not found (needed for transfer during migration)');
  }

  const playerPDA = profile.data[0].player_pda;

  // Transfer cNFT from treasury to player wallet
  // Use existing transferCNFTToWallet function
  const transferResult = await transferCNFTToWallet(
    assetId,
    playerPDA, // Current owner (PDA, but cNFT is actually in treasury)
    walletAddress // New owner
  );

  if (!transferResult.success) {
    throw new Error(`Transfer failed: ${transferResult.error}`);
  }

  // Update database status
  await pgQuery(
    `UPDATE player_character_cnfts 
     SET status = 'withdrawn', 
         withdrawn_to = $1, 
         withdrawn_at = NOW(),
         updated_at = NOW()
     WHERE id = $2`,
    [walletAddress, cnft.data.id]
  );

  // Also update nfts table if it exists
  await pgQuery(
    `UPDATE nfts 
     SET treasury_status = 'withdrawn',
         withdrawn_to = $1,
         withdrawn_at = NOW()
     WHERE asset_id = $2`,
    [walletAddress, assetId]
  );

  console.log(`✅ Withdrew cNFT ${assetId} from treasury to ${walletAddress}`);
  console.log(`   Transaction: ${transferResult.signature}`);

  return {
    signature: transferResult.signature || ''
  };
}

/**
 * Get cNFT by asset ID
 */
export async function getCNFTByAssetId(assetId: string): Promise<PlayerCharacterCNFT | null> {
  const result = await pgQuerySingle<PlayerCharacterCNFT>(
    `SELECT * FROM player_character_cnfts WHERE asset_id = $1`,
    [assetId]
  );

  if (result.error || !result.data) {
    return null;
  }

  return {
    ...result.data,
    created_at: new Date(result.data.created_at),
    updated_at: new Date(result.data.updated_at),
    withdrawn_at: result.data.withdrawn_at ? new Date(result.data.withdrawn_at) : null
  };
}

/**
 * Update cNFT metadata
 */
export async function updateCNFTMetadata(
  assetId: string,
  metadataUri: string
): Promise<void> {
  await pgQuery(
    `UPDATE player_character_cnfts 
     SET metadata_uri = $1, updated_at = NOW()
     WHERE asset_id = $2`,
    [metadataUri, assetId]
  );
}

/**
 * Mark cNFT as burned
 */
export async function burnCNFT(assetId: string): Promise<void> {
  await pgQuery(
    `UPDATE player_character_cnfts 
     SET status = 'burned', updated_at = NOW()
     WHERE asset_id = $1`,
    [assetId]
  );

  // Also update nfts table
  await pgQuery(
    `UPDATE nfts 
     SET treasury_status = 'burned'
     WHERE asset_id = $1`,
    [assetId]
  );
}
