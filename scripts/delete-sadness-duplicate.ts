/**
 * Delete the duplicate "sadness" (lowercase) user and profile
 * This keeps the real "Sadness" (capital S) profile with the NFT
 */

import { getPgClient } from '../src/utils/pg-helper';

async function main() {
  const client = getPgClient();
  const targetId = 'e7166ee1-2f3a-4ce0-b258-baf3a1c16766'; // lowercase sadness

  try {
    await client.connect();

    console.log('🗑️  Deleting duplicate "sadness" (lowercase) entry...\n');

    // First, check what exists
    const profileCheck = await client.query(
      'SELECT id, username FROM profiles WHERE id = $1',
      [targetId]
    );

    const userCheck = await client.query(
      'SELECT id, username FROM users WHERE id = $1',
      [targetId]
    );

    if (profileCheck.rows.length === 0 && userCheck.rows.length === 0) {
      console.log('✅ No entries found - already deleted or never existed');
      return;
    }

    console.log('📋 Found entries:');
    if (profileCheck.rows.length > 0) {
      console.log(`   Profile: ${profileCheck.rows[0].id} (username: ${profileCheck.rows[0].username})`);
    }
    if (userCheck.rows.length > 0) {
      console.log(`   User: ${userCheck.rows[0].id} (username: ${userCheck.rows[0].username})`);
    }
    console.log('');

    // Delete user first (may have foreign key constraints)
    if (userCheck.rows.length > 0) {
      console.log('🗑️  Deleting user...');
      await client.query('DELETE FROM users WHERE id = $1', [targetId]);
      console.log('✅ User deleted');
    }

    // Delete profile
    if (profileCheck.rows.length > 0) {
      console.log('🗑️  Deleting profile...');
      await client.query('DELETE FROM profiles WHERE id = $1', [targetId]);
      console.log('✅ Profile deleted');
    }

    console.log('\n✅ Successfully deleted duplicate "sadness" entry');
    console.log('✅ The real "Sadness" (capital S) profile remains intact');

  } catch (error) {
    console.error('❌ Error deleting entry:', error);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
