# Waitlist Migration (Old → New Railway DB)

Migrates the `waitlist` table from the old Railway PostgreSQL instance to the new one.

## Usage

```bash
cd skiller

# 1. Dry run (check connections, count rows, no writes)
OLD_DATABASE_URL="postgresql://user:pass@old-host:port/db" \
NEW_DATABASE_URL="postgresql://user:pass@new-host:port/db" \
npm run migrate:waitlist:dry

# 2. Migrate (with 3-second confirmation delay)
OLD_DATABASE_URL="..." NEW_DATABASE_URL="..." npm run migrate:waitlist

# 3. Migrate without confirmation prompt
OLD_DATABASE_URL="..." NEW_DATABASE_URL="..." npm run migrate:waitlist -- --yes
```

## What it does

- Connects to both databases
- Ensures the `waitlist` table exists in the NEW db (creates if missing)
- Copies all rows from OLD to NEW
- Uses `ON CONFLICT (wallet_address) DO UPDATE` so existing rows are updated (referral codes preserved)
- Keeps the earlier `created_at` when merging duplicates

## Columns migrated

- `id`, `wallet_address`, `referral_code`, `created_at`, `my_referral_code`
