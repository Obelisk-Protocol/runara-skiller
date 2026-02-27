/**
 * cOBX API Routes - Off-Chain Version
 * Uses new off-chain services for token operations
 */

import { Router } from 'express';
import { authenticateUser } from '../utils/auth-helper';
import { z } from 'zod';
import {
  getBalance,
  getBalanceInfo,
  getTransactionHistory,
  updateBalance,
} from '../services/offchain-program';
import {
  ensureCOBXAccount,
  ensureOBXAccount,
} from '../services/offchain-program';
import {
  depositOBX,
  withdrawOBX,
  mintReward,
} from '../services/offchain-program';

const router = Router();

// Validation schemas
const DepositSchema = z.object({
  amount: z.number().positive(),
  signature: z.string().optional(), // OBX deposit transaction signature
});

const WithdrawSchema = z.object({
  amount: z.number().positive(),
  walletAddress: z.string(),
});

const RewardSchema = z.object({
  amount: z.number().positive(),
  rewardType: z.enum(['dungeon', 'quest', 'pvp', 'daily', 'achievement', 'other']),
  metadata: z.record(z.any()).optional(),
});

/**
 * GET /api/cobx/balance-offchain
 * Get cOBX balance from database (off-chain)
 */
router.get('/balance-offchain', async (req: any, res: any) => {
  try {
    console.log('[balance-offchain] Request received');
    const { userId } = await authenticateUser(req);
    console.log('[balance-offchain] Authenticated user:', userId);

    // Try to ensure token account exists (don't fail if creation fails)
    try {
      await ensureCOBXAccount(userId);
      console.log('[balance-offchain] Token account ensured');
    } catch (accountError: any) {
      console.warn('⚠️ Token account creation failed (non-critical):', accountError?.message);
      console.warn('⚠️ Account error stack:', accountError instanceof Error ? accountError.stack : 'No stack');
      // Continue - balance will be 0 if account doesn't exist
    }

    // Get balance info (will return 0 if account doesn't exist)
    console.log('[balance-offchain] Fetching balance info...');
    const balanceInfo = await getBalanceInfo(userId, 'cOBX');
    console.log('[balance-offchain] Balance info retrieved:', {
      balance: Number(balanceInfo.balance),
      accountAddress: balanceInfo.accountAddress
    });

    return res.json({
      balance: Number(balanceInfo.balance),
      formattedBalance: balanceInfo.formattedBalance,
      accountExists: balanceInfo.accountAddress !== 'pending',
      account: balanceInfo.accountAddress || 'pending',
      synced: balanceInfo.synced,
      lastSynced: balanceInfo.lastSynced,
    });

  } catch (error: any) {
    console.error('❌ Error fetching cOBX balance:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('❌ Error details:', {
      message: error?.message,
      name: error?.name,
      code: error?.code
    });
    return res.status(500).json({
      error: 'Failed to fetch balance',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/cobx/deposit-offchain
 * Deposit OBX and mint cOBX (off-chain)
 */
router.post('/deposit-offchain', async (req: any, res: any) => {
  try {
    const { userId } = await authenticateUser(req);
    const { amount, signature } = DepositSchema.parse(req.body);

    // Ensure token accounts exist
    await ensureCOBXAccount(userId);
    await ensureOBXAccount(userId);

    // Convert amount to bigint (OBX has 6 decimals)
    const amountBigInt = BigInt(Math.round(amount * 10 ** 6));

    // Deposit OBX → Mint cOBX
    const result = await depositOBX({
      playerId: userId,
      amount: amountBigInt,
      signature: signature || 'pending', // Note: Transaction verification can be added later for production
    });

    return res.json({
      success: true,
      message: `Deposited ${amount} OBX, minted ${Number(result.amount) / 10 ** 9} cOBX`,
      signature: result.signature,
      amounts: {
        obxDeposited: amount,
        cobxMinted: Number(result.amount) / 10 ** 9,
      }
    });

  } catch (error: any) {
    console.error('Error depositing OBX:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }

    return res.status(500).json({
      error: 'Deposit failed',
      details: error.message
    });
  }
});

/**
 * POST /api/cobx/withdraw-offchain
 * Withdraw cOBX and receive OBX (off-chain)
 */
router.post('/withdraw-offchain', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { amount, walletAddress } = WithdrawSchema.parse(req.body);

    // Validate wallet address
    if (!walletAddress || walletAddress.length < 32) {
      return res.status(400).json({
        error: 'Valid wallet address required'
      });
    }

    // Ensure token accounts exist
    await ensureCOBXAccount(userId);

    // Convert amount to bigint (cOBX has 9 decimals)
    const amountBigInt = BigInt(Math.round(amount * 10 ** 9));

    // Withdraw cOBX → Send OBX
    const result = await withdrawOBX({
      playerId: userId,
      amount: amountBigInt,
      walletAddress,
    });

    return res.json({
      success: true,
      message: `Withdrew ${amount} cOBX, sent ${Number(result.amount) / 10 ** 6} OBX`,
      signature: result.signature,
      amounts: {
        cobxBurned: amount,
        obxWithdrawn: Number(result.amount) / 10 ** 6,
      }
    });

  } catch (error: any) {
    console.error('Error withdrawing cOBX:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }

    if (error.message?.includes('Insufficient balance')) {
      return res.status(400).json({
        error: error.message
      });
    }

    return res.status(500).json({
      error: 'Withdrawal failed',
      details: error.message
    });
  }
});

/**
 * POST /api/cobx/reward-offchain
 * Mint cOBX as in-game reward (off-chain)
 */
router.post('/reward-offchain', async (req: any, res: any) => {
  try {
    const { userId } = await authenticateUser(req);
    const { amount, rewardType, metadata } = RewardSchema.parse(req.body);

    // Ensure token account exists
    await ensureCOBXAccount(userId);

    // Convert amount to bigint (cOBX has 9 decimals)
    const amountBigInt = BigInt(Math.round(amount * 10 ** 9));

    // Mint reward
    const result = await mintReward({
      playerId: userId,
      amount: amountBigInt,
      rewardType,
      metadata,
    });

    return res.json({
      success: true,
      message: `Minted ${amount} cOBX as ${rewardType} reward`,
      signature: result.signature,
      reward: {
        amount,
        reason: rewardType,
        cobxMinted: amount,
      }
    });

  } catch (error: any) {
    console.error('Error minting reward:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.errors 
      });
    }

    return res.status(500).json({
      error: 'Reward minting failed',
      details: error.message
    });
  }
});

/**
 * GET /api/cobx/transactions-offchain
 * Get transaction history for cOBX
 */
router.get('/transactions-offchain', async (req: any, res: any) => {
  try {
    const { userId } = await authenticateUser(req);
    
    const limit = parseInt(req.query.limit || '50');
    const offset = parseInt(req.query.offset || '0');

    const history = await getTransactionHistory(userId, limit, offset);

    return res.json({
      success: true,
      transactions: history.map(tx => ({
        id: tx.id,
        type: tx.transaction_type,
        amount: tx.amount.toString(),
        balance_before: tx.balance_before.toString(),
        balance_after: tx.balance_after.toString(),
        signature: tx.on_chain_signature,
        metadata: tx.metadata,
        created_at: tx.created_at,
      })),
      total: history.length,
    });

  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({
      error: 'Failed to fetch transactions',
      details: error.message
    });
  }
});

export default router;
