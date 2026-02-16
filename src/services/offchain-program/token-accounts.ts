/**
 * Token Accounts Service
 * Manages server-controlled Token-2022 accounts for players
 * 
 * Each player gets regular Token-2022 accounts (not PDAs) owned by server wallet.
 * Account addresses are stored in database and referenced by profiles.id.
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID, 
  createInitializeAccount3Instruction,
  getAccount,
  getMint,
  Account as TokenAccount
} from '@solana/spl-token';
import { pgQuerySingle, pgQuery } from '../../utils/pg-helper';
import { getCobxMint, getObxMint } from '../../config/solana';
import { connection, serverKeypair } from '../../config/anchor';
import { TokenAccount as TokenAccountType } from './types';

// Note: player_id in player_token_accounts references profiles.id (user_id)

export interface CreateTokenAccountParams {
  playerId: string; // profiles.id (UUID)
  mintAddress: string; // OBX or cOBX mint address
}

export interface TokenAccountInfo {
  accountAddress: string;
  balance: bigint;
  onChainBalance: bigint;
  lastSynced: Date | null;
}

/**
 * Create a new Token-2022 account for a player
 * Account is owned by server wallet, address stored in database
 */
export async function createTokenAccount(
  params: CreateTokenAccountParams
): Promise<TokenAccountType> {
  const { playerId, mintAddress } = params;

  // Check if account already exists
  const existing = await getTokenAccount(playerId, mintAddress);
  if (existing) {
    throw new Error('Token account already exists for this player and mint');
  }

  // Generate new keypair for the token account
  const tokenAccountKeypair = Keypair.generate();
  const tokenAccountAddress = tokenAccountKeypair.publicKey;

  const mint = new PublicKey(mintAddress);

  // Get the space and rent required for a Token-2022 account
  const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
  const space = 165; // Standard token account size
  // Use Connection method (same as rest of codebase)
  const rentExemptAmount = await connection.getMinimumBalanceForRentExemption(space);

  // Build transaction: create account + initialize token account
  const tx = new Transaction();

  // 1. Create the account with SystemProgram
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: serverKeypair.publicKey,
      newAccountPubkey: tokenAccountAddress,
      space,
      lamports: rentExemptAmount,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  // 2. Initialize as Token-2022 account
  tx.add(
    createInitializeAccount3Instruction(
      tokenAccountAddress, // Account address
      mint, // Token mint
      serverKeypair.publicKey, // Owner (server wallet)
      TOKEN_2022_PROGRAM_ID
    )
  );

  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [serverKeypair, tokenAccountKeypair], // Server pays, new account signs
    { commitment: 'confirmed' }
  );

  console.log(`✅ Created Token-2022 account ${tokenAccountAddress.toBase58()} for player ${playerId}`);
  console.log(`   Transaction: ${signature}`);

  // Store account address in database
  const result = await pgQuerySingle<TokenAccountType>(
    `INSERT INTO player_token_accounts (player_id, token_account_address, mint_address, balance, on_chain_balance, last_synced_at)
     VALUES ($1, $2, $3, 0, 0, NOW())
     RETURNING *`,
    [playerId, tokenAccountAddress.toBase58(), mintAddress]
  );

  if (result.error || !result.data) {
    throw new Error(result?.error?.message || 'Failed to store token account in database');
  }

  return {
    ...result.data,
    balance: BigInt(result.data.balance),
    on_chain_balance: BigInt(result.data.on_chain_balance),
    last_synced_at: result.data.last_synced_at ? new Date(result.data.last_synced_at) : null,
    created_at: new Date(result.data.created_at)
  } as TokenAccountType;
}

/**
 * Get token account for a player and mint
 */
export async function getTokenAccount(
  playerId: string,
  mintAddress: string
): Promise<TokenAccountType | null> {
  const result = await pgQuerySingle<TokenAccountType>(
    `SELECT * FROM player_token_accounts 
     WHERE player_id = $1 AND mint_address = $2`,
    [playerId, mintAddress]
  );

  if (result.error || !result.data) {
    return null;
  }

  return {
    ...result.data,
    balance: BigInt(result.data.balance),
    on_chain_balance: BigInt(result.data.on_chain_balance),
    last_synced_at: result.data.last_synced_at ? new Date(result.data.last_synced_at) : null,
    created_at: new Date(result.data.created_at)
  } as TokenAccountType;
}

/**
 * Get all token accounts for a player
 */
export async function getPlayerTokenAccounts(playerId: string): Promise<TokenAccountType[]> {
  const result = await pgQuery(
    `SELECT * FROM player_token_accounts WHERE player_id = $1 ORDER BY created_at`,
    [playerId]
  );

  if (result.error || !result.data) {
    return [];
  }

  return result.data.map(row => ({
    ...row,
    balance: BigInt(row.balance),
    on_chain_balance: BigInt(row.on_chain_balance),
    last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : null,
    created_at: new Date(row.created_at)
  })) as TokenAccountType[];
}

/**
 * Ensure token account exists (create if doesn't exist)
 */
export async function ensureTokenAccount(
  playerId: string,
  mintAddress: string
): Promise<TokenAccountType> {
  let account = await getTokenAccount(playerId, mintAddress);
  
  if (!account) {
    account = await createTokenAccount({ playerId, mintAddress });
  }

  return account;
}

/**
 * Sync database balance with on-chain balance
 */
export async function syncBalance(
  playerId: string,
  mintAddress: string
): Promise<{ balance: bigint; onChainBalance: bigint; synced: boolean }> {
  const account = await getTokenAccount(playerId, mintAddress);
  if (!account) {
    throw new Error('Token account not found');
  }

  const tokenAccountPubkey = new PublicKey(account.token_account_address);
  
  try {
    // Get on-chain balance
    const tokenAccount = await getAccount(
      connection,
      tokenAccountPubkey,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );

    const onChainBalance = BigInt(tokenAccount.amount.toString());

    // Update database with on-chain balance
    const updateResult = await pgQuerySingle<TokenAccountType>(
      `UPDATE player_token_accounts 
       SET on_chain_balance = $1, last_synced_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [onChainBalance.toString(), account.id]
    );

    if (updateResult.error) {
      throw new Error(updateResult.error?.message || 'Failed to sync balance');
    }

    const databaseBalance = BigInt(account.balance.toString());
    const synced = databaseBalance === onChainBalance;

    return {
      balance: databaseBalance,
      onChainBalance,
      synced
    };
  } catch (error: any) {
    // Account might not exist on-chain yet
    if (error.message?.includes('InvalidAccountData') || error.message?.includes('not found')) {
      return {
        balance: BigInt(account.balance.toString()),
        onChainBalance: 0n,
        synced: false
      };
    }
    throw error;
  }
}

/**
 * Get token account info (balance, sync status)
 */
export async function getTokenAccountInfo(
  playerId: string,
  mintAddress: string
): Promise<TokenAccountInfo | null> {
  const account = await getTokenAccount(playerId, mintAddress);
  if (!account) {
    return null;
  }

  const balance = BigInt(account.balance.toString());
  const onChainBalance = BigInt(account.on_chain_balance.toString());

  return {
    accountAddress: account.token_account_address,
    balance,
    onChainBalance,
    lastSynced: account.last_synced_at
  };
}

/**
 * Get cOBX token account for a player (convenience function)
 */
export async function getCOBXAccount(playerId: string): Promise<TokenAccountType | null> {
  const cobxMint = getCobxMint();
  return getTokenAccount(playerId, cobxMint.toBase58());
}

/**
 * Get OBX token account for a player (convenience function)
 */
export async function getOBXAccount(playerId: string): Promise<TokenAccountType | null> {
  const obxMint = getObxMint();
  return getTokenAccount(playerId, obxMint.toBase58());
}

/**
 * Ensure cOBX account exists (convenience function)
 */
export async function ensureCOBXAccount(playerId: string): Promise<TokenAccountType> {
  const cobxMint = getCobxMint();
  return ensureTokenAccount(playerId, cobxMint.toBase58());
}

/**
 * Ensure OBX account exists (convenience function)
 */
export async function ensureOBXAccount(playerId: string): Promise<TokenAccountType> {
  const obxMint = getObxMint();
  return ensureTokenAccount(playerId, obxMint.toBase58());
}
