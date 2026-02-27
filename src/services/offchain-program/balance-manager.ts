/**
 * Balance Manager Service
 * Manages token balances in database (source of truth)
 * Syncs with on-chain balances periodically
 */

import { pgQuerySingle, pgQuery } from '../../utils/pg-helper';
import { syncBalance } from './token-accounts';
import { BalanceTransaction, TokenType } from './types';

export interface BalanceUpdate {
  balanceBefore: bigint;
  balanceAfter: bigint;
  transactionId: string;
}

/**
 * Get current balance from database (source of truth)
 */
export async function getBalance(
  playerId: string,
  tokenType: TokenType
): Promise<bigint> {
  const mintAddress = tokenType === 'cOBX' 
    ? (await import('../../config/solana')).getCobxMint().toBase58()
    : (await import('../../config/solana')).getObxMint().toBase58();

  const result = await pgQuerySingle<{ balance: string }>(
    `SELECT balance FROM player_token_accounts 
     WHERE player_id = $1 AND mint_address = $2`,
    [playerId, mintAddress]
  );

  if (result.error || !result.data) {
    return 0n;
  }

  return BigInt(result.data.balance);
}

/**
 * Update balance in database and log transaction
 */
export async function updateBalance(
  playerId: string,
  tokenType: TokenType,
  amount: bigint,
  transactionType: BalanceTransaction['transaction_type'],
  onChainSignature?: string,
  metadata?: Record<string, any>
): Promise<BalanceUpdate> {
  // Get current balance
  const balanceBefore = await getBalance(playerId, tokenType);

  // Calculate new balance
  const balanceAfter = balanceBefore + amount;

  if (balanceAfter < 0n) {
    throw new Error(`Insufficient balance. Current: ${balanceBefore}, Requested: ${amount}`);
  }

  const mintAddress = tokenType === 'cOBX' 
    ? (await import('../../config/solana')).getCobxMint().toBase58()
    : (await import('../../config/solana')).getObxMint().toBase58();

  // Update balance in database
  const updateResult = await pgQuerySingle<{ balance: string }>(
    `UPDATE player_token_accounts 
     SET balance = $1
     WHERE player_id = $2 AND mint_address = $3
     RETURNING balance`,
    [balanceAfter.toString(), playerId, mintAddress]
  );

  if (updateResult.error) {
    throw new Error(updateResult.error?.message || 'Failed to update balance');
  }

  // Log transaction
  const logResult = await pgQuerySingle<{ id: string }>(
    `INSERT INTO balance_transactions 
     (player_id, transaction_type, token_type, amount, balance_before, balance_after, on_chain_signature, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      playerId,
      transactionType,
      tokenType,
      amount.toString(),
      balanceBefore.toString(),
      balanceAfter.toString(),
      onChainSignature || null,
      metadata ? JSON.stringify(metadata) : '{}'
    ]
  );

  if (logResult.error) {
    console.error('Failed to log transaction:', logResult.error);
    // Don't throw - balance was updated, just logging failed
  }

  return {
    balanceBefore,
    balanceAfter,
    transactionId: logResult.data?.id || ''
  };
}

/**
 * Get transaction history for a player
 */
export async function getTransactionHistory(
  playerId: string,
  limit: number = 50,
  offset: number = 0
): Promise<BalanceTransaction[]> {
  const result = await pgQuery(
    `SELECT * FROM balance_transactions 
     WHERE player_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2 OFFSET $3`,
    [playerId, limit, offset]
  );

  if (result.error || !result.data) {
    return [];
  }

  return result.data.map(row => ({
    ...row,
    amount: BigInt(row.amount),
    balance_before: BigInt(row.balance_before),
    balance_after: BigInt(row.balance_after),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    created_at: new Date(row.created_at)
  })) as BalanceTransaction[];
}

/**
 * Sync balance with on-chain (verify database matches blockchain)
 */
export async function syncBalanceWithOnChain(
  playerId: string,
  tokenType: TokenType
): Promise<{ synced: boolean; databaseBalance: bigint; onChainBalance: bigint }> {
  const mintAddress = tokenType === 'cOBX' 
    ? (await import('../../config/solana')).getCobxMint().toBase58()
    : (await import('../../config/solana')).getObxMint().toBase58();

  const syncResult = await syncBalance(playerId, mintAddress);
  
  return {
    synced: syncResult.synced,
    databaseBalance: syncResult.balance,
    onChainBalance: syncResult.onChainBalance
  };
}

/**
 * Get balance info (database + on-chain sync status)
 */
export async function getBalanceInfo(
  playerId: string,
  tokenType: TokenType
): Promise<{
  balance: bigint;
  formattedBalance: string;
  onChainBalance: bigint;
  synced: boolean;
  lastSynced: Date | null;
  accountAddress: string;
}> {
  const balance = await getBalance(playerId, tokenType);
  const syncResult = await syncBalanceWithOnChain(playerId, tokenType);

  // Format balance (cOBX has 9 decimals, OBX has 6 decimals)
  const decimals = tokenType === 'cOBX' ? 9 : 6;
  const formattedBalance = (Number(balance) / Math.pow(10, decimals)).toFixed(decimals);

  // Get token account address
  const mintAddress = tokenType === 'cOBX' 
    ? (await import('../../config/solana')).getCobxMint().toBase58()
    : (await import('../../config/solana')).getObxMint().toBase58();
  
  const { getTokenAccount } = await import('./token-accounts');
  const tokenAccount = await getTokenAccount(playerId, mintAddress);
  const accountAddress = tokenAccount?.token_account_address || 'pending';

  return {
    balance,
    formattedBalance,
    onChainBalance: syncResult.onChainBalance,
    synced: syncResult.synced,
    lastSynced: tokenAccount?.last_synced_at || null,
    accountAddress
  };
}
