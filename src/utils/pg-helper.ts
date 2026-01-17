/**
 * PostgreSQL Helper Functions
 * Replaces Supabase client calls with direct PostgreSQL queries
 */

import { Client } from 'pg';

type PgClient = InstanceType<typeof Client>;

function getDatabaseUrl(): string {
  const dbUrl = process.env.DATABASE_URL || process.env.SKILLER_DATABASE_URL;
  
  if (!dbUrl) {
    throw new Error('DATABASE_URL or SKILLER_DATABASE_URL environment variable is not set');
  }
  
  return dbUrl;
}

/**
 * Get a PostgreSQL client for database operations
 */
export function getPgClient(): PgClient {
  const dbUrl = getDatabaseUrl();
  
  return new Client({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

/**
 * Execute a PostgreSQL query and return results
 */
export async function pgQuery<T = any>(
  query: string,
  params?: any[]
): Promise<{ data: T[] | null; error: Error | null }> {
  const client = getPgClient();
  
  try {
    await client.connect();
    const result = await client.query(query, params);
    await client.end();
    
    return {
      data: result.rows || null,
      error: null
    };
  } catch (error) {
    try {
      await client.end();
    } catch {}
    
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Execute a PostgreSQL query and return single row
 */
export async function pgQuerySingle<T = any>(
  query: string,
  params?: any[]
): Promise<{ data: T | null; error: Error | null }> {
  const client = getPgClient();
  
  try {
    await client.connect();
    const result = await client.query(query, params);
    await client.end();
    
    if (!result.rows || result.rows.length === 0) {
      return {
        data: null,
        error: new Error('No rows returned')
      };
    }
    
    return {
      data: result.rows[0] as T,
      error: null
    };
  } catch (error) {
    try {
      await client.end();
    } catch {}
    
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Execute a PostgreSQL function (RPC)
 */
export async function pgRpc<T = any>(
  functionName: string,
  params: Record<string, any>
): Promise<{ data: T | null; error: Error | null }> {
  const paramNames = Object.keys(params);
  const paramValues = Object.values(params);
  const placeholders = paramNames.map((_, i) => `$${i + 1}`).join(', ');
  
  const query = `SELECT * FROM ${functionName}(${placeholders})`;
  
  return pgQuerySingle<T>(query, paramValues);
}
