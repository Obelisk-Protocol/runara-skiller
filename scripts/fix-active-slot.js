const { Client } = require('pg');

(async () => {
  const client = new Client('postgresql://postgres:MsNGeXHGNhFiiiqLnpUmQfQwmZeeOpGS@shuttle.proxy.rlwy.net:47082/railway');
  await client.connect();

  // Find profiles that have a character but no active slot
  const res = await client.query(
    `SELECT id, character_cnft_1, character_cnft_2, active_character_slot, character_name 
     FROM profiles 
     WHERE active_character_slot IS NULL
     AND (character_cnft_1 IS NOT NULL AND character_cnft_1 != '' AND character_cnft_1 != 'EMPTY' AND character_cnft_1 != 'USED')`
  );

  console.log(`Found ${res.rows.length} profile(s) with characters but no active slot:`);

  for (const row of res.rows) {
    const slot = 1; // They have a character in slot 1
    await client.query('UPDATE profiles SET active_character_slot = $1 WHERE id = $2', [slot, row.id]);
    console.log(`  ✅ Set active_character_slot = ${slot} for profile ${row.id} (${row.character_name || 'unnamed'})`);
  }

  await client.end();
  console.log('Done.');
})();
