/**
 * Debug script: list profiles and their corresponding users.
 *
 * Usage (local):
 *   cd obelisk-skiller
 *   npx tsx scripts/debug-list-profiles.ts
 *
 * This will use DATABASE_URL / SKILLER_DATABASE_URL, so on Railway
 * you can run it via a one-off command using the same environment.
 */

import { getPgClient } from '../src/utils/pg-helper';

async function main() {
  const client = getPgClient();

  try {
    await client.connect();

    console.log('🔎 Fetching all profiles with their matching users (if any)...\n');

    const result = await client.query(
      `
      SELECT
        p.id           AS profile_id,
        p.username     AS profile_username,
        p.user_type,
        p.player_pda,
        p.character_cnft_1,
        p.character_cnft_2,
        p.character_cnft_3,
        p.character_cnft_4,
        p.character_cnft_5,
        u.id           AS user_id,
        u.username     AS user_username,
        u.email        AS user_email
      FROM profiles p
      LEFT JOIN users u ON u.id = p.id
      ORDER BY p.username, p.id
      `
    );

    const rows = result.rows || [];

    console.log(`✅ Found ${rows.length} profile(s)\n`);

    for (const row of rows) {
      console.log('------------------------------------------------------------');
      console.log(`Profile ID:        ${row.profile_id}`);
      console.log(`Profile username:  ${row.profile_username}`);
      console.log(`User type:         ${row.user_type}`);
      console.log(`Player PDA:        ${row.player_pda}`);
      console.log(`Slots:             [${row.character_cnft_1 || 'null'}, ${row.character_cnft_2 || 'null'}, ${row.character_cnft_3 || 'null'}, ${row.character_cnft_4 || 'null'}, ${row.character_cnft_5 || 'null'}]`);
      console.log(`→ User ID:         ${row.user_id || 'NO MATCHING USER'}`);
      console.log(`→ User username:   ${row.user_username || 'NO MATCHING USER'}`);
      console.log(`→ User email:      ${row.user_email || 'NO MATCHING USER'}`);
    }

    console.log('\n🔎 Focused check for username "sadness"...\n');

    const sadnessResult = await client.query(
      `
      SELECT
        'users'   AS source,
        u.id      AS id,
        u.username,
        u.email,
        NULL::text AS player_pda
      FROM users u
      WHERE LOWER(u.username) = LOWER($1)
      UNION ALL
      SELECT
        'profiles' AS source,
        p.id       AS id,
        p.username,
        NULL::text AS email,
        p.player_pda
      FROM profiles p
      WHERE LOWER(p.username) = LOWER($1)
      ORDER BY source, id
      `,
      ['sadness']
    );

    const sRows = sadnessResult.rows || [];
    if (sRows.length === 0) {
      console.log('No rows found for username "sadness" in users or profiles.');
    } else {
      for (const row of sRows) {
        console.log('------------------------------------------------------------');
        console.log(`Source:      ${row.source}`);
        console.log(`ID:          ${row.id}`);
        console.log(`Username:    ${row.username}`);
        console.log(`Email:       ${row.email || 'null'}`);
        console.log(`Player PDA:  ${row.player_pda || 'null'}`);
      }
    }

    console.log('\n✅ Debug listing complete.');
  } catch (err) {
    console.error('❌ Error running debug-list-profiles:', err);
    process.exitCode = 1;
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('❌ Unhandled error in debug-list-profiles:', err);
  process.exit(1);
});

