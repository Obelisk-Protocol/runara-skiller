/**
 * Player Accounts Service Tests
 */

import 'dotenv/config';
import {
  initializePlayer,
  getPlayerByUserId,
  getPlayerById,
  getPlayerByWallet,
  updatePlayer,
  getPlayerWallet,
  playerExists,
} from '../../src/services/offchain-program';
import { createTestContext, assert, assertEqual, assertNotNull } from './test-utils';

let testContext: Awaited<ReturnType<typeof createTestContext>>;

export async function testInitializePlayer() {
  testContext = await createTestContext();
  
  const player = await initializePlayer({
    userId: testContext.userId,
    name: 'test_player_1',
    class: 1,
    walletAddress: testContext.walletAddress,
  });

  assertNotNull(player, 'Player should be created');
  assertEqual(player.id, testContext.userId, 'Player ID should match');
  assertEqual(player.character_name, 'test_player_1', 'Character name should match');
  assertEqual(player.character_class, 1, 'Character class should match');
  assertEqual(player.level, 1, 'Default level should be 1');
  assertEqual(player.wins, 0, 'Default wins should be 0');
  assertEqual(player.losses, 0, 'Default losses should be 0');
  console.log(`   ✅ Created player: ${player.character_name} (${player.id})`);
}

export async function testGetPlayerByUserId() {
  const player = await getPlayerByUserId(testContext.userId);
  
  assertNotNull(player, 'Player should be found');
  assertEqual(player.id, testContext.userId, 'Player ID should match');
  console.log(`   ✅ Retrieved player by user ID`);
}

export async function testGetPlayerById() {
  const player = await getPlayerById(testContext.userId);
  
  assertNotNull(player, 'Player should be found');
  assertEqual(player.id, testContext.userId, 'Player ID should match');
  console.log(`   ✅ Retrieved player by ID`);
}

export async function testGetPlayerByWallet() {
  const player = await getPlayerByWallet(testContext.walletAddress!);
  
  assertNotNull(player, 'Player should be found by wallet');
  assertEqual(player.wallet_address, testContext.walletAddress, 'Wallet address should match');
  console.log(`   ✅ Retrieved player by wallet address`);
}

export async function testUpdatePlayer() {
  const updated = await updatePlayer(testContext.userId, {
    level: 5,
    wins: 10,
    losses: 2,
    lifetime_obx_earned: 1000n,
  });

  assertNotNull(updated, 'Player should be updated');
  assertEqual(updated.level, 5, 'Level should be updated');
  assertEqual(updated.wins, 10, 'Wins should be updated');
  assertEqual(updated.losses, 2, 'Losses should be updated');
  assertEqual(updated.lifetime_obx_earned, 1000n, 'Lifetime OBX should be updated');
  console.log(`   ✅ Updated player stats`);
}

export async function testGetPlayerWallet() {
  const wallet = await getPlayerWallet(testContext.userId);
  
  assertNotNull(wallet, 'Wallet should be returned');
  assertEqual(wallet, testContext.walletAddress, 'Wallet address should match');
  console.log(`   ✅ Retrieved player wallet`);
}

export async function testPlayerExists() {
  const exists = await playerExists(testContext.userId);
  assert(exists === true, 'Player should exist');
  
  const notExists = await playerExists('non-existent-user-id');
  assert(notExists === false, 'Non-existent player should not exist');
  console.log(`   ✅ Player existence check works`);
}

export async function testCleanup() {
  await testContext.cleanup();
  console.log(`   ✅ Test data cleaned up`);
}
