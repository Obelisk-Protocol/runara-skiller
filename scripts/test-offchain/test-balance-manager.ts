/**
 * Balance Manager Service Tests
 */

import 'dotenv/config';
import {
  getBalance,
  updateBalance,
  getTransactionHistory,
  syncBalanceWithOnChain,
  getBalanceInfo,
} from '../../src/services/offchain-program';
import { ensureCOBXAccount } from '../../src/services/offchain-program';
import { createTestContext, assert, assertEqual, assertNotNull } from './test-utils';

let testContext: Awaited<ReturnType<typeof createTestContext>>;

export async function testSetup() {
  testContext = await createTestContext();
  
  // Initialize player and token account
  const { initializePlayer } = await import('../../src/services/offchain-program');
  await initializePlayer({
    userId: testContext.userId,
    name: 'test_balance_manager',
    class: 1,
  });
  
  await ensureCOBXAccount(testContext.userId);
}

export async function testGetBalance() {
  const balance = await getBalance(testContext.userId, 'cOBX');
  
  assert(balance === 0n, 'Initial balance should be 0');
  console.log(`   ✅ Initial balance: ${balance}`);
}

export async function testUpdateBalance() {
  // Test deposit
  const deposit = await updateBalance(
    testContext.userId,
    'cOBX',
    1000n * 10n ** 9n, // 1000 cOBX
    'deposit',
    'test-signature-1',
    { source: 'test' }
  );

  assertNotNull(deposit, 'Deposit should succeed');
  assertEqual(deposit.balanceBefore, 0n, 'Balance before should be 0');
  assertEqual(deposit.balanceAfter, 1000n * 10n ** 9n, 'Balance after should be 1000 cOBX');
  console.log(`   ✅ Updated balance: ${deposit.balanceBefore} → ${deposit.balanceAfter}`);

  // Test reward
  const reward = await updateBalance(
    testContext.userId,
    'cOBX',
    500n * 10n ** 9n, // 500 cOBX
    'reward',
    'test-signature-2',
    { reward_type: 'dungeon' }
  );

  assertNotNull(reward, 'Reward should succeed');
  assertEqual(reward.balanceBefore, 1000n * 10n ** 9n, 'Balance before should be 1000');
  assertEqual(reward.balanceAfter, 1500n * 10n ** 9n, 'Balance after should be 1500');
  console.log(`   ✅ Updated balance: ${reward.balanceBefore} → ${reward.balanceAfter}`);
}

export async function testGetBalanceAfterUpdate() {
  const balance = await getBalance(testContext.userId, 'cOBX');
  
  assertEqual(balance, 1500n * 10n ** 9n, 'Balance should be 1500 cOBX');
  console.log(`   ✅ Current balance: ${balance}`);
}

export async function testUpdateBalanceInsufficient() {
  try {
    await updateBalance(
      testContext.userId,
      'cOBX',
      -2000n * 10n ** 9n, // Try to withdraw 2000 (only have 1500)
      'withdraw'
    );
    throw new Error('Should have thrown insufficient balance error');
  } catch (error: any) {
    assert(
      error.message.includes('Insufficient balance'),
      'Should throw insufficient balance error'
    );
    console.log(`   ✅ Insufficient balance check works`);
  }
}

export async function testGetTransactionHistory() {
  const history = await getTransactionHistory(testContext.userId, 10, 0);
  
  assert(history.length >= 2, 'Should have at least 2 transactions');
  assertEqual(history[0].transaction_type, 'reward', 'Latest should be reward');
  assertEqual(history[1].transaction_type, 'deposit', 'Second should be deposit');
  console.log(`   ✅ Retrieved ${history.length} transactions`);
}

export async function testSyncBalanceWithOnChain() {
  const sync = await syncBalanceWithOnChain(testContext.userId, 'cOBX');
  
  assertNotNull(sync, 'Sync result should be returned');
  assertNotNull(sync.databaseBalance, 'Database balance should exist');
  assertNotNull(sync.onChainBalance, 'On-chain balance should exist');
  console.log(`   ✅ Synced: DB=${sync.databaseBalance}, On-chain=${sync.onChainBalance}, Synced=${sync.synced}`);
}

export async function testGetBalanceInfo() {
  const info = await getBalanceInfo(testContext.userId, 'cOBX');
  
  assertNotNull(info, 'Balance info should be returned');
  assertNotNull(info.balance, 'Balance should exist');
  assertNotNull(info.formattedBalance, 'Formatted balance should exist');
  assertNotNull(info.onChainBalance, 'On-chain balance should exist');
  console.log(`   ✅ Balance info: ${info.formattedBalance} cOBX (synced: ${info.synced})`);
}

export async function testCleanup() {
  await testContext.cleanup();
  console.log(`   ✅ Test data cleaned up`);
}
