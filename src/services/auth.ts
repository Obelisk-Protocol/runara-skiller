/**
 * Authentication Service
 * Handles user authentication with password hashing and JWT tokens
 * Supports dual-mode: Supabase tokens (during migration) and JWT tokens (new system)
 */

import { Client } from 'pg';
// @ts-ignore - type definitions may not be available in build
import bcrypt from 'bcrypt';
// @ts-ignore - type definitions may not be available in build
import jwt, { type SignOptions } from 'jsonwebtoken';
// Supabase removed - using PostgreSQL directly

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface AuthUser {
  id: string;
  username: string | null;
  email: string | null;
  profile: any;
}

export interface AuthToken {
  token: string;
  user: AuthUser;
}

/**
 * Get PostgreSQL client
 */
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

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate JWT token for user
 */
export function generateToken(userId: string, username: string | null): string {
  const payload = { userId, username };
  // @ts-ignore - expiresIn type compatibility
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): { userId: string; username: string | null } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}

/**
 * Sign up new user
 */
export async function signUp(username: string, password: string): Promise<AuthToken> {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    // Check if username already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    
    if (existingUser.rows.length > 0) {
      throw new Error('Username already taken');
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Create user
    const email = `${username}@local.game`;
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, email, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, username, email`,
      [username, passwordHash, email]
    );
    
    const user = userResult.rows[0];
    
    // Create profile
    await client.query(
      `INSERT INTO profiles (id, username, user_type, created_at, updated_at)
       VALUES ($1, $2, 'WEB2', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET username = $2`,
      [user.id, username]
    );
    
    // Get profile
    const profileResult = await client.query(
      'SELECT * FROM profiles WHERE id = $1',
      [user.id]
    );
    
    const profile = profileResult.rows[0];
    
    // Generate token
    const token = generateToken(user.id, username);
    
    return {
      token,
      user: {
        id: user.id,
        username,
        email: user.email,
        profile
      }
    };
  } finally {
    await client.end();
  }
}

/**
 * Sign in user
 */
export async function signIn(username: string, password: string): Promise<AuthToken> {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    // Find user by username (check both users table and profiles table for migration)
    const emailFormat = `${username}@local.game`;
    
    // First try to find in users table (case-insensitive)
    let userResult = await client.query(
      `SELECT u.id, u.username, u.email, u.password_hash
       FROM users u
       WHERE LOWER(u.username) = LOWER($1) OR u.email = $1 OR LOWER(u.email) = LOWER($2)`,
      [username, emailFormat]
    );
    
    // If not found, check profiles table (migration from Supabase) - case-insensitive
    if (userResult.rows.length === 0) {
      const profileResult = await client.query(
        `SELECT p.id, p.username
         FROM profiles p
         WHERE LOWER(p.username) = LOWER($1)`,
        [username]
      );
      
      if (profileResult.rows.length > 0) {
        const profile = profileResult.rows[0];
        // Create user record if it doesn't exist
        await client.query(
          `INSERT INTO users (id, username, email, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [profile.id, profile.username, emailFormat]
        );
        
        // Re-query to get user
        userResult = await client.query(
          `SELECT u.id, u.username, u.email, u.password_hash
           FROM users u
           WHERE u.id = $1`,
          [profile.id]
        );
      }
    }
    
    if (userResult.rows.length === 0) {
      throw new Error('Invalid username or password');
    }
    
    const user = userResult.rows[0];
    
    // Check if user has password_hash (new system) or is a migrated account
    if (user.password_hash) {
      // New system: verify password
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        throw new Error('Invalid username or password');
      }
    } else {
      // Migrated account with no password_hash yet:
      // Treat the provided password as the new password, set password_hash, and continue.
      const newHash = await hashPassword(password);
      await client.query(
        `UPDATE users
         SET password_hash = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [user.id, newHash]
      );

      // Update local user object so subsequent logic uses the new hash if needed
      user.password_hash = newHash;
    }
    
    // Get profile
    const profileResult = await client.query(
      'SELECT * FROM profiles WHERE id = $1',
      [user.id]
    );
    
    const profile = profileResult.rows[0] || {};
    
    // Generate token
    const token = generateToken(user.id, user.username);
    
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        profile
      }
    };
  } finally {
    await client.end();
  }
}

/**
 * Reset or set password for a user.
 *
 * This is primarily for migrated accounts that don't yet have a password_hash.
 * It:
 * - Looks up the user by username/email in users
 * - If not found, looks in profiles and ensures a users row exists
 * - Sets/updates password_hash with the new hashed password
 */
export async function resetPassword(username: string, newPassword: string): Promise<void> {
  const client = getPgClient();

  try {
    await client.connect();

    const emailFormat = `${username}@local.game`;

    // Try to find user in users table first
    let userResult = await client.query(
      `SELECT id, username, email
       FROM users
       WHERE username = $1 OR email = $1 OR email = $2`,
      [username, emailFormat]
    );

    // If not found, check profiles and create a users row if needed
    if (userResult.rows.length === 0) {
      const profileResult = await client.query(
        `SELECT id, username
         FROM profiles
         WHERE username = $1`,
        [username]
      );

      if (profileResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const profile = profileResult.rows[0];

      await client.query(
        `INSERT INTO users (id, username, email, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [profile.id, profile.username, emailFormat]
      );

      userResult = await client.query(
        `SELECT id, username, email
         FROM users
         WHERE id = $1`,
        [profile.id]
      );
    }

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];
    const passwordHash = await hashPassword(newPassword);

    await client.query(
      `UPDATE users
       SET password_hash = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id, passwordHash]
    );
  } finally {
    await client.end();
  }
}

/**
 * Get session from token (supports both JWT and Supabase tokens)
 */
export async function getSession(token: string): Promise<AuthUser | null> {
  // Try JWT token first (new system)
  const jwtPayload = verifyToken(token);
  if (jwtPayload) {
    const client = getPgClient();
    try {
      await client.connect();
      
      const profileResult = await client.query(
        'SELECT * FROM profiles WHERE id = $1',
        [jwtPayload.userId]
      );
      
      if (profileResult.rows.length === 0) {
        return null;
      }
      
      const userResult = await client.query(
        'SELECT id, username, email FROM users WHERE id = $1',
        [jwtPayload.userId]
      );
      
      if (userResult.rows.length === 0) {
        return null;
      }
      
      const user = userResult.rows[0];
      const profile = profileResult.rows[0] || {};
      
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        profile
      };
    } finally {
      await client.end();
    }
  }
  
  // Supabase fallback removed - JWT auth only
  return null;
}
