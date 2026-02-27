/**
 * Authentication Routes
 * Handles signin, signup, session validation, signout, and wallet-based auth
 */

import { Router } from 'express';
import { z } from 'zod';
import { signUp, signIn, getSession, resetPassword, generateToken } from '../services/auth';
import { Client } from 'pg';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

const router = Router();

function getPgClient(): InstanceType<typeof Client> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set');
  }
  return new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
}

// Validation schemas
const SignUpSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
  email: z.string().email().optional()
});

const SignInSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const ResetPasswordSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8).max(128)
});

/**
 * POST /api/auth/signup
 * Create new user account
 */
router.post('/signup', async (req: any, res: any) => {
  try {
    const { username, password, email } = SignUpSchema.parse(req.body);
    
    // Check username uniqueness
    const client = getPgClient();
    try {
      await client.connect();
      
      // Check username uniqueness (case-insensitive)
      const existingUser = await client.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );
      
      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      
      // Check if profile with username exists (from Supabase migration) - case-insensitive
      const existingProfile = await client.query(
        'SELECT id FROM profiles WHERE LOWER(username) = LOWER($1)',
        [username]
      );
      
      if (existingProfile.rows.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    } finally {
      await client.end();
    }
    
    const result = await signUp(username, password);
    
    return res.json({
      success: true,
      token: result.token,
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email
      },
      profile: result.user.profile
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    if (error.message === 'Username already taken') {
      return res.status(409).json({ error: error.message });
    }
    
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Failed to create account' });
  }
});

/**
 * POST /api/auth/signin
 * Sign in user
 */
router.post('/signin', async (req: any, res: any) => {
  try {
    const { username, password } = SignInSchema.parse(req.body);
    
    const result = await signIn(username, password);
    
    return res.json({
      success: true,
      token: result.token,
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email
      },
      profile: result.user.profile
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    if (error.message === 'Invalid username or password') {
      return res.status(401).json({ error: error.message });
    }
    
    // Handle accounts that were migrated but do not yet have a password_hash set.
    // These users need to set/reset their password before they can sign in with the new system.
    if (error.message === 'User account needs password reset - please contact support') {
      return res.status(409).json({ error: error.message });
    }
    
    console.error('Signin error:', error);
    return res.status(500).json({ error: 'Failed to sign in' });
  }
});

/**
 * POST /api/auth/session
 * Get current session from token
 */
router.post('/session', async (req: any, res: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    
    const token = authHeader.substring(7);
    const session = await getSession(token);
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    return res.json({
      success: true,
      user: {
        id: session.id,
        username: session.username,
        email: session.email
      },
      profile: session.profile
    });
  } catch (error: any) {
    console.error('Session error:', error);
    return res.status(500).json({ error: 'Failed to validate session' });
  }
});

/**
 * POST /api/auth/wallet-signin
 * Sign in (or auto-register) using a Solana wallet signature.
 *
 * Flow:
 * 1. Client connects wallet and signs a challenge message.
 * 2. This endpoint verifies the signature with nacl.
 * 3. If a profile with that wallet_address exists, we sign the user in.
 * 4. If no profile exists, we auto-create a user + profile (WEB3 type).
 * 5. Returns JWT token + user + profile (same shape as /signin).
 */
const WalletSignInSchema = z.object({
  walletAddress: z.string().min(32).max(64),
  signature: z.string().min(1),
  message: z.string().min(1),
});

router.post('/wallet-signin', async (req: any, res: any) => {
  const client = getPgClient();

  try {
    const { walletAddress, signature, message } = WalletSignInSchema.parse(req.body);

    // Validate wallet address
    let publicKeyBytes: Uint8Array;
    try {
      const pk = new PublicKey(walletAddress);
      publicKeyBytes = pk.toBytes();
      // Ensure canonical base58 matches what was sent
      if (pk.toBase58() !== walletAddress) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // Verify signature
    const messageBytes = new TextEncoder().encode(message);
    let signatureBytes: Uint8Array;
    try {
      // Accept both base64 and comma-separated byte arrays (wallet adapters vary)
      if (signature.includes(',')) {
        signatureBytes = new Uint8Array(signature.split(',').map(Number));
      } else {
        signatureBytes = new Uint8Array(Buffer.from(signature, 'base64'));
      }
    } catch {
      return res.status(400).json({ error: 'Invalid signature format' });
    }

    const isVerified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!isVerified) {
      return res.status(401).json({ error: 'Invalid wallet signature' });
    }

    // Validate message freshness (timestamp must be within 5 minutes)
    const timestampMatch = message.match(/Timestamp:\s*(\d+)/);
    if (timestampMatch) {
      const messageTs = parseInt(timestampMatch[1], 10) * 1000; // to ms
      const now = Date.now();
      if (Math.abs(now - messageTs) > 5 * 60 * 1000) {
        return res.status(401).json({ error: 'Signature expired. Please try again.' });
      }
    }

    await client.connect();

    // Look up existing profile by wallet address
    const profileResult = await client.query(
      'SELECT * FROM profiles WHERE LOWER(wallet_address) = LOWER($1) LIMIT 1',
      [walletAddress]
    );

    let userId: string;
    let username: string | null;
    let email: string | null;
    let profile: any;

    if (profileResult.rows.length > 0) {
      // Existing wallet user — sign them in
      profile = profileResult.rows[0];
      userId = profile.id;

      // Get (or create) users row
      let userResult = await client.query(
        'SELECT id, username, email FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        // Profile exists but no users row (migration edge case) — create one
        const walletUsername = `wallet_${walletAddress.slice(0, 8)}`;
        const walletEmail = `${walletAddress.slice(0, 8)}@wallet.game`;
        await client.query(
          `INSERT INTO users (id, username, email, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [userId, walletUsername, walletEmail]
        );
        userResult = await client.query(
          'SELECT id, username, email FROM users WHERE id = $1',
          [userId]
        );
      }

      const user = userResult.rows[0];
      username = user.username;
      email = user.email;
    } else {
      // New wallet user — auto-register
      const walletShort = walletAddress.slice(0, 8);
      const walletUsername = `wallet_${walletShort}`;
      const walletEmail = `${walletShort}@wallet.game`;

      // Create user row
      const userResult = await client.query(
        `INSERT INTO users (username, email, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id, username, email`,
        [walletUsername, walletEmail]
      );

      const newUser = userResult.rows[0];
      userId = newUser.id;
      username = newUser.username;
      email = newUser.email;

      // Create profile with wallet address
      await client.query(
        `INSERT INTO profiles (id, username, wallet_address, user_type, created_at, updated_at)
         VALUES ($1, $2, $3, 'WEB3', NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET wallet_address = $3, user_type = 'WEB3', updated_at = NOW()`,
        [userId, walletUsername, walletAddress]
      );

      // Re-fetch profile
      const newProfileResult = await client.query(
        'SELECT * FROM profiles WHERE id = $1',
        [userId]
      );
      profile = newProfileResult.rows[0] || {};
    }

    // Generate JWT (same as password signin)
    const token = generateToken(userId, username);

    return res.json({
      success: true,
      token,
      user: { id: userId, username, email },
      profile,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }

    console.error('Wallet signin error:', error);
    return res.status(500).json({ error: 'Failed to sign in with wallet' });
  } finally {
    try { await client.end(); } catch {}
  }
});

/**
 * POST /api/auth/verify-admin-password
 * Verify admin password to unlock the login page. Does NOT sign in - just returns success.
 */
const VerifyAdminSchema = z.object({
  password: z.string().min(1),
});

router.post('/verify-admin-password', async (req: any, res: any) => {
  const adminPassword = process.env.WAITLIST_ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(503).json({ error: 'Admin bypass not configured' });
  }

  try {
    const { password } = VerifyAdminSchema.parse(req.body);
    if (password !== adminPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    return res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * POST /api/auth/admin-bypass
 * Allow admin to bypass waitlist with password. Returns JWT for admin user.
 * Set WAITLIST_ADMIN_PASSWORD in env. Creates runara_admin user if needed.
 */
const AdminBypassSchema = z.object({
  password: z.string().min(1),
});

router.post('/admin-bypass', async (req: any, res: any) => {
  const adminPassword = process.env.WAITLIST_ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(503).json({ error: 'Admin bypass not configured' });
  }

  try {
    const { password } = AdminBypassSchema.parse(req.body);
    if (password !== adminPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const client = getPgClient();
    await client.connect();

    try {
      const adminUsername = 'runara_admin';
      let userResult = await client.query(
        'SELECT id, username FROM users WHERE username = $1',
        [adminUsername]
      );

      let userId: string;
      if (userResult.rows.length === 0) {
        const insertResult = await client.query(
          `INSERT INTO users (username, email, created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW())
           RETURNING id, username`,
          [adminUsername, 'admin@runara.game']
        );
        userId = insertResult.rows[0].id;

        await client.query(
          `INSERT INTO profiles (id, username, user_type, created_at, updated_at)
           VALUES ($1, $2, 'WEB2', NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [userId, adminUsername]
        );
      } else {
        userId = userResult.rows[0].id;
      }

      const token = generateToken(userId, adminUsername);

      return res.json({
        success: true,
        token,
        user: { id: userId, username: adminUsername, email: 'admin@runara.game' },
        profile: { id: userId, username: adminUsername },
      });
    } finally {
      await client.end();
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Admin bypass error:', error);
    return res.status(500).json({ error: 'Admin bypass failed' });
  }
});

/**
 * POST /api/auth/signout
 * Sign out user (client-side token removal, but we log it)
 */
router.post('/signout', async (req: any, res: any) => {
  // Token invalidation would require a token blacklist
  // For now, we just return success - client removes token
  return res.json({ success: true });
});

/**
 * POST /api/auth/reset-password
 * Set or reset a user's password.
 *
 * NOTE: This endpoint is intended for internal/admin use while the project
 * is not public. You should protect it (e.g. behind an admin secret) before
 * exposing it more broadly.
 */
router.post('/reset-password', async (req: any, res: any) => {
  try {
    const { username, password } = ResetPasswordSchema.parse(req.body);

    await resetPassword(username, password);

    return res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }

    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }

    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
