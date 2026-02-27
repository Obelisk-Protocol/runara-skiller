/**
 * Test Utilities
 * Shared utilities for off-chain program service tests
 */

// Generate UUID v4
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
import { pgQuery, pgQuerySingle } from '../../src/utils/pg-helper';

// Generate test user ID
export function generateTestUserId(): string {
  return uuidv4();
}

// Generate test wallet address (fake, for testing)
export function generateTestWalletAddress(): string {
  // Generate a fake Solana address (44 characters, base58-like)
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let address = '';
  for (let i = 0; i < 44; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address;
}

// Clean up test data
export async function cleanupTestData(userId: string): Promise<void> {
  try {
    // Delete in order (respecting foreign keys)
    await pgQuery('DELETE FROM balance_transactions WHERE player_id = $1', [userId]);
    await pgQuery('DELETE FROM reward_transactions WHERE player_id = $1', [userId]);
    await pgQuery('DELETE FROM player_token_accounts WHERE player_id = $1', [userId]);
    await pgQuery('DELETE FROM player_character_cnfts WHERE player_id = $1', [userId]);
    await pgQuery('DELETE FROM profiles WHERE id = $1', [userId]);
  } catch (error) {
    console.error(`Failed to cleanup test data for ${userId}:`, error);
  }
}

// Clean up all test data (for cleanup suite)
export async function cleanupAllTestData(): Promise<void> {
  try {
    // Delete test profiles (those with test_ prefix in character_name)
    const testProfiles = await pgQuery(
      `SELECT id FROM profiles WHERE character_name LIKE 'test_%'`
    );

    if (testProfiles.data) {
      for (const profile of testProfiles.data) {
        await cleanupTestData(profile.id);
      }
    }

    console.log(`✅ Cleaned up ${testProfiles.data?.length || 0} test profiles`);
  } catch (error) {
    console.error('Failed to cleanup all test data:', error);
    throw error;
  }
}

// Wait for async operations
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Assert helper
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Assert equals
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message || 'Values not equal'}\n  Expected: ${expected}\n  Actual: ${actual}`
    );
  }
}

// Assert not null
export function assertNotNull<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Assertion failed: ${message || 'Value is null or undefined'}`);
  }
  return value;
}

// Test result helper
export interface TestContext {
  userId: string;
  walletAddress?: string;
  cleanup: () => Promise<void>;
}

export async function createTestContext(walletAddress?: string): Promise<TestContext> {
  const userId = generateTestUserId();
  const testWallet = walletAddress || generateTestWalletAddress();

  return {
    userId,
    walletAddress: testWallet,
    cleanup: () => cleanupTestData(userId),
  };
}
