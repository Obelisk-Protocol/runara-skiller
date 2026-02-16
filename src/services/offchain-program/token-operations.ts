/**
 * Token Operations Service
 * Handles deposit, withdraw, and reward operations
 * Direct SPL Token operations (no Anchor program needed)
 */

import { 
  Connection, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction,
  SystemProgram
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  createBurnInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';
import { getCobxMint, getObxMint } from '../../config/solana';
import { connection, serverKeypair } from '../../config/anchor';
import { ensureTokenAccount, getTokenAccount } from './token-accounts';
import { updateBalance } from './balance-manager';
import { getPlayerWallet } from './player-accounts';
import { DepositRequest, WithdrawRequest, RewardRequest } from './types';

// Decimal conversion: OBX (6 decimals) <-> cOBX (9 decimals)
const OBX_DECIMALS = 6;
const COBX_DECIMALS = 9;
const DECIMAL_DIFF = COBX_DECIMALS - OBX_DECIMALS; // 3
const DECIMAL_MULTIPLIER = 10n ** BigInt(DECIMAL_DIFF); // 1000n

/**
 * Deposit OBX → Mint cOBX
 * 1. User sends OBX to server wallet
 * 2. Server verifies receipt
 * 3. Server mints cOBX to player's token account
 */
export async function depositOBX(request: DepositRequest): Promise<{ signature: string; amount: bigint }> {
  const { playerId, amount, signature: depositSignature } = request;

  // TODO: Verify OBX deposit transaction signature
  // For now, we'll trust the amount provided
  // In production, verify the transaction on-chain

  // Ensure player has cOBX token account
  const { getCobxMint } = await import('../../config/solana');
  const cobxAccount = await ensureTokenAccount(
    playerId,
    getCobxMint().toBase58()
  );

  // Convert OBX amount (6 decimals) to cOBX amount (9 decimals)
  const cobxAmount = amount * DECIMAL_MULTIPLIER; // Multiply by 1000

  // Mint cOBX to player's token account
  const cobxMint = getCobxMint();
  const mintIx = createMintToInstruction(
    cobxMint,
    new PublicKey(cobxAccount.token_account_address),
    serverKeypair.publicKey, // Mint authority (server)
    cobxAmount,
    [],
    TOKEN_2022_PROGRAM_ID
  );

  const tx = new Transaction().add(mintIx);
  const mintSignature = await sendAndConfirmTransaction(
    connection,
    tx,
    [serverKeypair],
    { commitment: 'confirmed' }
  );

  // Update database balance
  await updateBalance(
    playerId,
    'cOBX',
    cobxAmount,
    'deposit',
    mintSignature,
    { 
      obx_deposit_signature: depositSignature,
      obx_amount: amount.toString(),
      cobx_amount: cobxAmount.toString()
    }
  );

  console.log(`✅ Deposited ${amount} OBX → ${cobxAmount} cOBX for player ${playerId}`);
  console.log(`   Mint signature: ${mintSignature}`);

  return {
    signature: mintSignature,
    amount: cobxAmount
  };
}

/**
 * Withdraw cOBX → Send OBX
 * 1. Burn cOBX from player's token account
 * 2. Transfer OBX from server to player wallet
 */
export async function withdrawOBX(request: WithdrawRequest): Promise<{ signature: string; amount: bigint }> {
  const { playerId, amount, walletAddress } = request;

  // Check database balance
  const { getBalance } = await import('./balance-manager');
  const balance = await getBalance(playerId, 'cOBX');
  if (balance < amount) {
    throw new Error(`Insufficient balance. Current: ${balance}, Requested: ${amount}`);
  }

  // Get player's cOBX token account
  const cobxAccount = await getTokenAccount(
    playerId,
    getCobxMint().toBase58()
  );
  if (!cobxAccount) {
    throw new Error('cOBX token account not found');
  }

  // Convert cOBX amount (9 decimals) to OBX amount (6 decimals)
  const obxAmount = amount / DECIMAL_MULTIPLIER; // Divide by 1000
  if (obxAmount <= 0n) {
    throw new Error('Amount too small after decimal conversion');
  }

  const cobxMint = getCobxMint();
  const obxMint = getObxMint();
  const playerWallet = new PublicKey(walletAddress);

  // Build transaction: burn cOBX + transfer OBX
  const tx = new Transaction();

  // 1. Burn cOBX from player's token account
  const burnIx = createBurnInstruction(
    new PublicKey(cobxAccount.token_account_address),
    cobxMint,
    serverKeypair.publicKey, // Authority (server owns the account)
    amount,
    [],
    TOKEN_2022_PROGRAM_ID
  );
  tx.add(burnIx);

  // 2. Transfer OBX to player wallet
  // Get or create player's OBX ATA
  const playerOBXATA = getAssociatedTokenAddressSync(obxMint, playerWallet);
  const obxATAInfo = await connection.getAccountInfo(playerOBXATA);
  
  if (!obxATAInfo) {
    // Create ATA if doesn't exist
    const createATAIx = createAssociatedTokenAccountInstruction(
      serverKeypair.publicKey, // Payer
      playerOBXATA,
      playerWallet, // Owner
      obxMint
    );
    tx.add(createATAIx);
  }

  // Get server's OBX account (or use treasury)
  // TODO: Get actual server OBX account address from config
  const serverOBXAccount = getAssociatedTokenAddressSync(obxMint, serverKeypair.publicKey);
  
  const transferIx = createTransferInstruction(
    serverOBXAccount,
    playerOBXATA,
    serverKeypair.publicKey, // Authority
    obxAmount,
    [],
    TOKEN_PROGRAM_ID
  );
  tx.add(transferIx);

  // Send transaction
  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [serverKeypair],
    { commitment: 'confirmed' }
  );

  // Update database balance
  await updateBalance(
    playerId,
    'cOBX',
    -amount, // Negative for withdrawal
    'withdraw',
    signature,
    {
      obx_amount: obxAmount.toString(),
      cobx_amount: amount.toString(),
      wallet_address: walletAddress
    }
  );

  console.log(`✅ Withdrew ${amount} cOBX → ${obxAmount} OBX for player ${playerId}`);
  console.log(`   Transaction: ${signature}`);

  return {
    signature,
    amount: obxAmount
  };
}

/**
 * Mint reward (server-initiated)
 * Mints cOBX directly to player's token account
 */
export async function mintReward(request: RewardRequest): Promise<{ signature: string; amount: bigint }> {
  const { playerId, amount, rewardType, metadata } = request;

  // Ensure player has cOBX token account
  const cobxAccount = await ensureTokenAccount(
    playerId,
    getCobxMint().toBase58()
  );

  // Mint cOBX to player's token account
  const cobxMint = getCobxMint();
  const mintIx = createMintToInstruction(
    cobxMint,
    new PublicKey(cobxAccount.token_account_address),
    serverKeypair.publicKey, // Mint authority (server)
    amount,
    [],
    TOKEN_2022_PROGRAM_ID
  );

  const tx = new Transaction().add(mintIx);
  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [serverKeypair],
    { commitment: 'confirmed' }
  );

  // Update database balance
  await updateBalance(
    playerId,
    'cOBX',
    amount,
    'reward',
    signature,
    {
      reward_type: rewardType,
      ...metadata
    }
  );

  // Log reward transaction
  await logRewardTransaction(playerId, rewardType, amount, signature, metadata);

  console.log(`✅ Minted ${amount} cOBX reward (${rewardType}) for player ${playerId}`);
  console.log(`   Transaction: ${signature}`);

  return {
    signature,
    amount
  };
}

/**
 * Log reward transaction
 */
async function logRewardTransaction(
  playerId: string,
  rewardType: string,
  amount: bigint,
  signature: string,
  metadata?: Record<string, any>
): Promise<void> {
  const { pgQuery } = await import('../../utils/pg-helper');
  
  await pgQuery(
    `INSERT INTO reward_transactions (player_id, reward_type, amount, on_chain_signature, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      playerId,
      rewardType,
      amount.toString(),
      signature,
      metadata ? JSON.stringify(metadata) : '{}'
    ]
  );
}

/**
 * Transfer tokens between players (internal transfer)
 */
export async function transferBetweenPlayers(
  fromPlayerId: string,
  toPlayerId: string,
  amount: bigint,
  tokenType: 'OBX' | 'cOBX'
): Promise<{ signature: string }> {
  // Get token accounts
  const mintAddress = tokenType === 'cOBX' 
    ? getCobxMint().toBase58()
    : getObxMint().toBase58();

  const fromAccount = await getTokenAccount(fromPlayerId, mintAddress);
  const toAccount = await ensureTokenAccount(toPlayerId, mintAddress);

  if (!fromAccount) {
    throw new Error('Source token account not found');
  }

  // Check balance
  const { getBalance } = await import('./balance-manager');
  const balance = await getBalance(fromPlayerId, tokenType);
  if (balance < amount) {
    throw new Error(`Insufficient balance. Current: ${balance}, Requested: ${amount}`);
  }

  const programId = tokenType === 'cOBX' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const mint = tokenType === 'cOBX' ? getCobxMint() : getObxMint();

  // Transfer on-chain
  const transferIx = createTransferInstruction(
    new PublicKey(fromAccount.token_account_address),
    new PublicKey(toAccount.token_account_address),
    serverKeypair.publicKey, // Authority (server owns both accounts)
    amount,
    [],
    programId
  );

  const tx = new Transaction().add(transferIx);
  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [serverKeypair],
    { commitment: 'confirmed' }
  );

  // Update database balances
  await updateBalance(
    fromPlayerId,
    tokenType,
    -amount,
    'transfer',
    signature,
    { to_player_id: toPlayerId }
  );

  await updateBalance(
    toPlayerId,
    tokenType,
    amount,
    'transfer',
    signature,
    { from_player_id: fromPlayerId }
  );

  console.log(`✅ Transferred ${amount} ${tokenType} from ${fromPlayerId} to ${toPlayerId}`);
  console.log(`   Transaction: ${signature}`);

  return { signature };
}
