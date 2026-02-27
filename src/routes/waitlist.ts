/**
 * Waitlist Routes
 * Pre-launch signup: join waitlist with wallet, get count
 */

import { Router } from 'express';
import { z } from 'zod';
import { Client } from 'pg';
import { PublicKey } from '@solana/web3.js';
import crypto from 'crypto';

const router = Router();

/** Generate a short unique referral code (8 alphanumeric chars) */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i % 6] % chars.length];
  }
  return code;
}

function getPgClient(): InstanceType<typeof Client> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set');
  }
  return new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
}

const JoinSchema = z.object({
  walletAddress: z.string().min(32).max(64),
  referralCode: z.string().max(64).optional(),
});

/**
 * POST /api/waitlist/join
 * Add wallet to waitlist. Generates unique my_referral_code. Saves referral_code (who referred them) if valid.
 */
router.post('/join', async (req: any, res: any) => {
  const client = getPgClient();
  try {
    const { walletAddress, referralCode } = JoinSchema.parse(req.body);

    try {
      new PublicKey(walletAddress);
    } catch {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    await client.connect();

    let referredBy: string | null = null;
    if (referralCode && referralCode.trim()) {
      const refTrimmed = referralCode.trim();
      const refCheck = await client.query(
        'SELECT wallet_address FROM waitlist WHERE my_referral_code = $1',
        [refTrimmed]
      );
      if (refCheck.rows.length > 0) {
        referredBy = refTrimmed;
      }
    }

    let myCode: string | null = null;
    const existing = await client.query(
      'SELECT my_referral_code FROM waitlist WHERE wallet_address = $1',
      [walletAddress]
    );

    if (existing.rows.length > 0) {
      myCode = existing.rows[0].my_referral_code;
      if (!myCode) {
        for (let i = 0; i < 5; i++) {
          myCode = generateReferralCode();
          const conflict = await client.query(
            'SELECT 1 FROM waitlist WHERE my_referral_code = $1',
            [myCode]
          );
          if (conflict.rows.length === 0) {
            await client.query(
              'UPDATE waitlist SET my_referral_code = $1, referral_code = COALESCE(referral_code, $2) WHERE wallet_address = $3',
              [myCode, referredBy, walletAddress]
            );
            break;
          }
        }
      } else if (referredBy) {
        await client.query(
          'UPDATE waitlist SET referral_code = $1 WHERE wallet_address = $2 AND referral_code IS NULL',
          [referredBy, walletAddress]
        );
      }
    } else {
      for (let i = 0; i < 5; i++) {
        myCode = generateReferralCode();
        const conflict = await client.query(
          'SELECT 1 FROM waitlist WHERE my_referral_code = $1',
          [myCode]
        );
        if (conflict.rows.length === 0) {
          await client.query(
            `INSERT INTO waitlist (wallet_address, referral_code, my_referral_code)
             VALUES ($1, $2, $3)
             ON CONFLICT (wallet_address) DO UPDATE SET
               referral_code = COALESCE(EXCLUDED.referral_code, waitlist.referral_code),
               my_referral_code = COALESCE(waitlist.my_referral_code, EXCLUDED.my_referral_code)
             RETURNING id, wallet_address, my_referral_code, created_at`,
            [walletAddress, referredBy, myCode]
          );
          break;
        }
      }
    }

    const row = await client.query(
      'SELECT my_referral_code FROM waitlist WHERE wallet_address = $1',
      [walletAddress]
    );
    myCode = row.rows[0]?.my_referral_code ?? myCode;

    return res.json({
      success: true,
      joined: true,
      walletAddress,
      myReferralCode: myCode,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Waitlist join error:', error);
    return res.status(500).json({ error: 'Failed to join waitlist' });
  } finally {
    try {
      await client.end();
    } catch {}
  }
});

/**
 * GET /api/waitlist/me?wallet=...
 * Return the user's referral link and code
 */
router.get('/me', async (req: any, res: any) => {
  const wallet = req.query.wallet;
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'wallet query required' });
  }

  const client = getPgClient();
  try {
    await client.connect();
    const result = await client.query(
      'SELECT my_referral_code FROM waitlist WHERE wallet_address = $1',
      [wallet]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Not on waitlist' });
    }
    const code = row.my_referral_code;
    const baseUrl = (process.env.FRONTEND_BASE_URL || 'https://runara.fun').replace(/\/$/, '');
    return res.json({
      success: true,
      myReferralCode: code,
      referralLink: code ? `${baseUrl}/?ref=${code}` : null,
    });
  } catch (error: any) {
    console.error('Waitlist me error:', error);
    return res.status(500).json({ error: 'Failed to get referral info' });
  } finally {
    try {
      await client.end();
    } catch {}
  }
});

/**
 * GET /api/waitlist/count
 * Return total number of waitlist signups
 */
router.get('/count', async (_req: any, res: any) => {
  const client = getPgClient();
  try {
    await client.connect();

    const result = await client.query(
      'SELECT COUNT(*)::int AS count FROM waitlist'
    );

    const count = result.rows[0]?.count ?? 0;

    return res.json({
      success: true,
      count,
    });
  } catch (error: any) {
    console.error('Waitlist count error:', error);
    return res.status(500).json({ error: 'Failed to get waitlist count' });
  } finally {
    try {
      await client.end();
    } catch {}
  }
});

export default router;
