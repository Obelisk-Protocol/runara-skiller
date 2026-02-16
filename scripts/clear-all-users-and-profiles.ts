/**
 * Clear all users and profiles from the database (and all dependent rows).
 * Use after switching to a new NFT collection so test accounts with old NFTs are removed.
 *
 * Run: npx tsx scripts/clear-all-users-and-profiles.ts
 * Confirm: npx tsx scripts/clear-all-users-and-profiles.ts --confirm
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

import { getPgClient } from '../src/utils/pg-helper';

const NEED_CONFIRM = !process.argv.includes('--confirm');

async function main() {
  const client = getPgClient();

  try {
    await client.connect();

    if (NEED_CONFIRM) {
      const users = await client.query('SELECT COUNT(*)::int AS c FROM users');
      const profiles = await client.query('SELECT COUNT(*)::int AS c FROM profiles');
      console.log('Current counts:');
      console.log('  users:', users.rows[0].c);
      console.log('  profiles:', profiles.rows[0].c);
      console.log('\nTo clear all users and profiles (and dependent data), run:');
      console.log('  npx tsx scripts/clear-all-users-and-profiles.ts --confirm\n');
      return;
    }

    console.log('Clearing all users and profiles (and dependent data)...\n');

    // Order: delete from tables that reference profiles (no CASCADE), then profiles, then users.
    // Tables with ON DELETE CASCADE to profiles will be cleared when we delete profiles.

    const steps: { name: string; sql: string }[] = [
      { name: 'player_items', sql: 'DELETE FROM player_items' },
      { name: 'player_structures', sql: 'DELETE FROM player_structures' },
      { name: 'pda_creation_log', sql: 'DELETE FROM pda_creation_log' },
      { name: 'characters', sql: 'DELETE FROM characters' },
      { name: 'cnft_sync_records', sql: 'DELETE FROM cnft_sync_records' },
      { name: 'profiles', sql: 'DELETE FROM profiles' },
      { name: 'users', sql: 'DELETE FROM users' },
      { name: 'experience_logs', sql: 'TRUNCATE experience_logs RESTART IDENTITY' },
      { name: 'player_skill_experience', sql: 'DELETE FROM player_skill_experience' },
      { name: 'nfts', sql: 'DELETE FROM nfts' },
    ];

    for (const { name, sql } of steps) {
      try {
        const res = await client.query(sql);
        const count = res.rowCount ?? 0;
        console.log(`  ${name}: ${count} row(s) affected`);
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        if (err.code === '42P01') {
          console.log(`  ${name}: table does not exist (skipped)`);
        } else {
          throw e;
        }
      }
    }

    console.log('\nDone. All users and profiles (and related data) have been cleared.');
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
