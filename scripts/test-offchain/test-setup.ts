/**
 * Test Setup Suite
 * Validates environment and database connectivity
 */

import 'dotenv/config';
import { pgQuerySingle } from '../../src/utils/pg-helper';
import { assert, assertNotNull } from './test-utils';

export async function testDatabaseConnection() {
  // Debug: Check if DATABASE_URL is set (but don't log the full URL for security)
  const dbUrl = process.env.DATABASE_URL || process.env.SKILLER_DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL or SKILLER_DATABASE_URL not set');
  }
  
  // Log partial URL for debugging (first 20 chars + last 10 chars)
  const urlPreview = dbUrl.length > 30 
    ? `${dbUrl.substring(0, 20)}...${dbUrl.substring(dbUrl.length - 10)}`
    : '***';
  console.log(`   ℹ️  Database URL: ${urlPreview}`);
  
  const result = await pgQuerySingle('SELECT NOW() as current_time');
  if (result.error) {
    throw new Error(`Database connection failed: ${result.error.message}`);
  }
  assertNotNull(result.data, 'Database connection failed');
  assert(result.data?.current_time !== undefined, 'Database query failed');
  console.log(`   ✅ Database connected: ${result.data.current_time}`);
}

export async function testDatabaseSchema() {
  // Check if required tables exist
  const tables = [
    'profiles',
    'player_token_accounts',
    'player_character_cnfts',
    'balance_transactions',
    'reward_transactions',
  ];

  for (const table of tables) {
    const result = await pgQuerySingle(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      ) as exists`,
      [table]
    );

    assertNotNull(result.data, `Failed to check table ${table}`);
    assert(
      result.data?.exists === true,
      `Required table ${table} does not exist. Run migration first!`
    );
    console.log(`   ✅ Table exists: ${table}`);
  }
}

export async function testEnvironmentVariables() {
  const required = [
    'DATABASE_URL',
    'PRIVATE_SERVER_WALLET',
    'SOLANA_CLUSTER',
  ];

  for (const varName of required) {
    assert(
      process.env[varName] !== undefined,
      `Missing required environment variable: ${varName}`
    );
    console.log(`   ✅ Environment variable: ${varName}`);
  }
}

export async function testSolanaConfig() {
  const { getCobxMint, getObxMint, getCluster } = await import('../../src/config/solana');
  
  try {
    const cluster = getCluster();
    console.log(`   ℹ️  Cluster: ${cluster}`);
    
    // Check if mint env vars are set
    const cobxEnv = cluster === 'mainnet-beta' 
      ? process.env.COBX_MINT_MAINNET 
      : process.env.COBX_MINT_DEVNET;
    const obxEnv = cluster === 'mainnet-beta'
      ? process.env.OBX_MINT_MAINNET
      : process.env.OBX_MINT_DEVNET;
    
    if (!cobxEnv) {
      throw new Error(`COBX_MINT_${cluster === 'mainnet-beta' ? 'MAINNET' : 'DEVNET'} not set`);
    }
    if (!obxEnv) {
      throw new Error(`OBX_MINT_${cluster === 'mainnet-beta' ? 'MAINNET' : 'DEVNET'} not set`);
    }
    
    const cobxMint = getCobxMint();
    const obxMint = getObxMint();
    
    assertNotNull(cobxMint, 'cOBX mint not configured');
    assertNotNull(obxMint, 'OBX mint not configured');
    
    console.log(`   ✅ cOBX Mint: ${cobxMint.toBase58()}`);
    console.log(`   ✅ OBX Mint: ${obxMint.toBase58()}`);
  } catch (error: any) {
    throw new Error(`Solana config error: ${error.message}`);
  }
}
