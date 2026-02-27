/**
 * Token Accounts Service Tests
 */

import 'dotenv/config';
import {
  createTokenAccount,
  getTokenAccount,
  getPlayerTokenAccounts,
  ensureTokenAccount,
  syncBalance,
  getCOBXAccount,
  getOBXAccount,
} from '../../src/services/offchain-program';
import { getCobxMint, getObxMint } from '../../src/config/solana';
import { createTestContext, assert, assertNotNull, assertEqual } from './test-utils';

let testContext: Awaited<ReturnType<typeof createTestContext>>;
let cobxAccountId: string;
let obxAccountId: string;

export async function testSetup() {
  testContext = await createTestContext();
  
  // Initialize player first
  const { initializePlayer } = await import('../../src/services/offchain-program');
  await initializePlayer({
    userId: testContext.userId,
    name: 'test_token_accounts',
    class: 1,
  });
}

export async function testCreateTokenAccount() {
  const cobxMint = getCobxMint();
  
  const account = await createTokenAccount({
    playerId: testContext.userId,
    mintAddress: cobxMint.toBase58(),
  });

  assertNotNull(account, 'Token account should be created');
  assertNotNull(account.token_account_address, 'Token account address should exist');
  assertEqual(account.player_id, testContext.userId, 'Player ID should match');
  assertEqual(account.mint_address, cobxMint.toBase58(), 'Mint address should match');
  assertEqual(account.balance, 0n, 'Initial balance should be 0');
  
  cobxAccountId = account.id;
  console.log(`   ✅ Created cOBX token account: ${account.token_account_address}`);
}

export async function testGetTokenAccount() {
  const cobxMint = getCobxMint();
  const account = await getTokenAccount(testContext.userId, cobxMint.toBase58());
  
  assertNotNull(account, 'Token account should be found');
  assertEqual(account.id, cobxAccountId, 'Account ID should match');
  console.log(`   ✅ Retrieved token account`);
}

export async function testGetPlayerTokenAccounts() {
  const accounts = await getPlayerTokenAccounts(testContext.userId);
  
  assert(accounts.length >= 1, 'Should have at least one token account');
  assert(accounts.some(a => a.mint_address === getCobxMint().toBase58()), 'Should have cOBX account');
  console.log(`   ✅ Retrieved ${accounts.length} token accounts for player`);
}

export async function testEnsureTokenAccount() {
  const obxMint = getObxMint();
  
  // First call should create
  const account1 = await ensureTokenAccount(testContext.userId, obxMint.toBase58());
  assertNotNull(account1, 'Token account should be created');
  obxAccountId = account1.id;
  
  // Second call should return existing
  const account2 = await ensureTokenAccount(testContext.userId, obxMint.toBase58());
  assertNotNull(account2, 'Token account should be found');
  assertEqual(account1.id, account2.id, 'Should return same account');
  console.log(`   ✅ Ensure token account works (created: ${account1.id === account2.id ? 'no' : 'yes'})`);
}

export async function testGetCOBXAccount() {
  const account = await getCOBXAccount(testContext.userId);
  
  assertNotNull(account, 'cOBX account should be found');
  assertEqual(account.mint_address, getCobxMint().toBase58(), 'Should be cOBX mint');
  console.log(`   ✅ Retrieved cOBX account`);
}

export async function testGetOBXAccount() {
  const account = await getOBXAccount(testContext.userId);
  
  assertNotNull(account, 'OBX account should be found');
  assertEqual(account.mint_address, getObxMint().toBase58(), 'Should be OBX mint');
  console.log(`   ✅ Retrieved OBX account`);
}

export async function testSyncBalance() {
  const cobxMint = getCobxMint();
  const result = await syncBalance(testContext.userId, cobxMint.toBase58());
  
  assertNotNull(result, 'Sync result should be returned');
  assertNotNull(result.balance, 'Balance should exist');
  assertNotNull(result.onChainBalance, 'On-chain balance should exist');
  console.log(`   ✅ Synced balance: DB=${result.balance}, On-chain=${result.onChainBalance}, Synced=${result.synced}`);
}

export async function testCleanup() {
  await testContext.cleanup();
  console.log(`   ✅ Test data cleaned up`);
}
