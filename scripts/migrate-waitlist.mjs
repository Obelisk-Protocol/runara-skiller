#!/usr/bin/env node
/**
 * Migrate waitlist from old Railway DB to new Railway DB.
 *
 * Usage:
 *   OLD_DATABASE_URL="postgresql://..." NEW_DATABASE_URL="postgresql://..." node scripts/migrate-waitlist.mjs
 *   node scripts/migrate-waitlist.mjs  (reads from env)
 *
 * Options:
 *   --dry-run    Check connections and count rows only, do not migrate
 *   --yes        Skip confirmation prompt
 */

import pg from 'pg';

const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.NEW_DATABASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_CONFIRM = process.argv.includes('--yes');

if (!OLD_URL || !NEW_URL) {
  console.error('Usage: OLD_DATABASE_URL="..." NEW_DATABASE_URL="..." node scripts/migrate-waitlist.mjs');
  console.error('  --dry-run    Check and count only, no writes');
  console.error('  --yes        Skip confirmation');
  process.exit(1);
}

function redact(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:***@${u.host}${u.pathname}`;
  } catch {
    return '(invalid url)';
  }
}

async function tableExists(client, tableName) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return r.rows.length > 0;
}

async function ensureWaitlistTable(client) {
  const sql = `
    CREATE TABLE IF NOT EXISTS waitlist (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address TEXT NOT NULL UNIQUE,
      referral_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_waitlist_wallet ON waitlist(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at);
    ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS my_referral_code TEXT UNIQUE;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_my_referral_code ON waitlist(my_referral_code) WHERE my_referral_code IS NOT NULL;
  `;
  await client.query(sql);
}

async function main() {
  console.log('🔗 Waitlist migration: OLD → NEW');
  console.log('   Old:', redact(OLD_URL));
  console.log('   New:', redact(NEW_URL));
  console.log('');

  const oldClient = new pg.Client({ connectionString: OLD_URL });
  const newClient = new pg.Client({ connectionString: NEW_URL });

  try {
    await oldClient.connect();
    console.log('✅ Connected to OLD database');

    await newClient.connect();
    console.log('✅ Connected to NEW database');

    // Check tables
    const oldHas = await tableExists(oldClient, 'waitlist');
    const newHas = await tableExists(newClient, 'waitlist');

    if (!oldHas) {
      console.error('❌ OLD database has no waitlist table');
      process.exit(1);
    }
    console.log('   OLD waitlist table: exists');

    if (!newHas) {
      console.log('   NEW waitlist table: creating...');
      await ensureWaitlistTable(newClient);
      console.log('   NEW waitlist table: created');
    } else {
      console.log('   NEW waitlist table: exists');
    }

    // Count in both
    const oldCount = (await oldClient.query('SELECT COUNT(*)::int AS n FROM waitlist')).rows[0].n;
    const newCount = (await newClient.query('SELECT COUNT(*)::int AS n FROM waitlist')).rows[0].n;

    console.log('');
    console.log('📊 Current counts:');
    console.log('   OLD:', oldCount, 'rows');
    console.log('   NEW:', newCount, 'rows');
    console.log('');

    if (oldCount === 0) {
      console.log('Nothing to migrate. Exiting.');
      return;
    }

    if (DRY_RUN) {
      console.log('--dry-run: Skipping migration.');
      return;
    }

    if (!SKIP_CONFIRM) {
      console.log('About to copy', oldCount, 'rows from OLD to NEW.');
      console.log('Existing rows in NEW (by wallet_address) will be updated.');
      console.log('Press Ctrl+C to cancel, or run with --yes to skip this prompt.');
      await new Promise((r) => setTimeout(r, 3000));
    }

    // Fetch all from old
    const rows = (await oldClient.query(
      'SELECT id, wallet_address, referral_code, created_at, my_referral_code FROM waitlist ORDER BY created_at'
    )).rows;

    let migrated = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        await newClient.query(
          `INSERT INTO waitlist (id, wallet_address, referral_code, created_at, my_referral_code)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (wallet_address) DO UPDATE SET
             referral_code = COALESCE(EXCLUDED.referral_code, waitlist.referral_code),
             my_referral_code = COALESCE(waitlist.my_referral_code, EXCLUDED.my_referral_code),
             created_at = LEAST(waitlist.created_at, EXCLUDED.created_at)`,
          [row.id, row.wallet_address, row.referral_code, row.created_at, row.my_referral_code]
        );
        migrated++;
      } catch (err) {
        errors++;
        console.error('   Error for wallet', row.wallet_address, ':', err.message);
      }
    }

    const finalCount = (await newClient.query('SELECT COUNT(*)::int AS n FROM waitlist')).rows[0].n;
    console.log('');
    console.log('✅ Migration complete');
    console.log('   Migrated:', migrated);
    console.log('   Errors:', errors);
    console.log('   Final NEW count:', finalCount);
  } finally {
    await oldClient.end();
    await newClient.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
