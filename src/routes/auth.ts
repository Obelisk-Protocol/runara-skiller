/**
 * Authentication Routes
 * Handles signin, signup, session validation, and signout
 */

import { Router } from 'express';
import { z } from 'zod';
import { signUp, signIn, getSession } from '../services/auth';
import { Client } from 'pg';

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
      
      const existingUser = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );
      
      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      
      // Check if profile with username exists (from Supabase migration)
      const existingProfile = await client.query(
        'SELECT id FROM profiles WHERE username = $1',
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
 * POST /api/auth/signout
 * Sign out user (client-side token removal, but we log it)
 */
router.post('/signout', async (req: any, res: any) => {
  // Token invalidation would require a token blacklist
  // For now, we just return success - client removes token
  return res.json({ success: true });
});

export default router;
