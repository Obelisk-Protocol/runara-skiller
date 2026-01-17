/**
 * Auth Helper Functions
 * Replaces Supabase auth with JWT verification
 */

import { verifyToken } from '../services/auth';
import { pgQuerySingle } from './pg-helper';

/**
 * Verify JWT token and return user info
 * Replaces supabase.auth.getUser()
 */
export async function verifyAuthToken(token: string): Promise<{ data: { user: { id: string } }; error: null } | { data: null; error: Error }> {
  try {
    const result = verifyToken(token);
    
    if (!result) {
      return {
        data: null,
        error: new Error('Invalid token')
      };
    }
    
    return {
      data: { user: { id: result.userId } },
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Authenticate user and return profile
 * Replaces supabase auth + profile lookup
 */
export async function authenticateUser(req: any): Promise<{ userId: string; profile: any }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized - missing or invalid auth header');
  }

  const token = authHeader.substring(7);
  const authResult = await verifyAuthToken(token);
  
  if (authResult.error || !authResult.data?.user) {
    throw new Error('Unauthorized - invalid token');
  }

  const profileResult = await pgQuerySingle<any>(
    'SELECT * FROM profiles WHERE id = $1',
    [authResult.data.user.id]
  );
  
  if (profileResult.error || !profileResult.data) {
    throw new Error('Profile not found');
  }

  return { userId: authResult.data.user.id, profile: profileResult.data };
}
