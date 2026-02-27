/**
 * Cleanup Test Suite
 * Cleans up all test data
 */

import 'dotenv/config';
import { cleanupAllTestData } from './test-utils';

export async function testCleanupAllTestData() {
  await cleanupAllTestData();
  console.log(`   ✅ All test data cleaned up`);
}
