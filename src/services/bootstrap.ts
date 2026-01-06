import { Client } from 'pg'

const CREATE_TABLE_SQL = `
create table if not exists nfts (
  asset_id text primary key,
  player_pda text,
  name text not null,
  level int not null default 1,
  combat_level int not null default 1,
  total_level int not null default 9,
  version text not null default '2.0.0',

  -- Combat Skills
  attack int not null default 1,
  strength int not null default 1,
  defense int not null default 1,
  magic int not null default 1,
  projectiles int not null default 1,
  vitality int not null default 1,
  crafting int not null default 1,
  luck int not null default 1,
  
  -- Gathering Skills
  mining int not null default 1,
  woodcutting int not null default 1,
  fishing int not null default 1,
  hunting int not null default 1,
  
  -- Crafting Skills
  smithing int not null default 1,
  cooking int not null default 1,
  alchemy int not null default 1,
  construction int not null default 1,

  last_arweave_uri text,
  last_update_sig text,
  state_version int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_nfts_player_pda on nfts(player_pda);

-- Add missing columns if they don't exist (for existing tables)
-- Also rename old abbreviated columns to full names
do $$
begin
  -- Rename old abbreviated columns to full names (if they exist)
  if exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'att') then
    alter table nfts rename column att to attack;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'str') then
    alter table nfts rename column str to strength;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'def') then
    alter table nfts rename column def to defense;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'mag') then
    alter table nfts rename column mag to magic;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'pro') then
    alter table nfts rename column pro to projectiles;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'vit') then
    alter table nfts rename column vit to vitality;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'cra') then
    alter table nfts rename column cra to crafting;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'luc') then
    alter table nfts rename column luc to luck;
  end if;
  
  -- Add gathering skills if missing
  if not exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'mining') then
    alter table nfts add column mining int not null default 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'woodcutting') then
    alter table nfts add column woodcutting int not null default 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'fishing') then
    alter table nfts add column fishing int not null default 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'hunting') then
    alter table nfts add column hunting int not null default 1;
  end if;
  
  -- Add crafting skills if missing
  if not exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'smithing') then
    alter table nfts add column smithing int not null default 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'cooking') then
    alter table nfts add column cooking int not null default 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'alchemy') then
    alter table nfts add column alchemy int not null default 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'nfts' and column_name = 'construction') then
    alter table nfts add column construction int not null default 1;
  end if;
end $$;
`;

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.log(`⚠️ Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export async function ensureNftTable(): Promise<void> {
  const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!conn) {
    console.log('ℹ️ Skipping NFT table bootstrap: SUPABASE_DB_URL/DATABASE_URL not set');
    return;
  }

  // Use retry logic with exponential backoff for transient connection issues
  try {
    await retryWithBackoff(async () => {
      let client: any = null;
      try {
        const sslNeeded = process.env.PGSSL === 'true' || /supabase\.(co|net)/i.test(conn) || /render\.com/i.test(conn);
        client = new Client({ 
          connectionString: conn, 
          ssl: sslNeeded ? { rejectUnauthorized: false } : undefined 
        } as any);
        await client.connect();
        
        // Use a transaction for atomicity
        await client.query('begin');
        await client.query(CREATE_TABLE_SQL);
        await client.query('commit');
        
        console.log('✅ Ensured nfts table and index exist');
      } catch (e) {
        try { 
          await client?.query('rollback'); 
        } catch (rollbackError) {
          // Ignore rollback errors
        }
        // Re-throw to trigger retry
        throw e;
      } finally {
        try { 
          await client?.end(); 
        } catch (endError) {
          // Ignore cleanup errors
        }
      }
    }, 3, 1000); // 3 retries, starting with 1 second delay
  } catch (e: any) {
    // Log warning but don't fail server startup - table likely already exists
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.warn('⚠️ Failed to ensure nfts table after retries:', errorMsg);
    console.warn('ℹ️ This is usually non-fatal if the table already exists. Service will continue.');
    console.warn('ℹ️ The service will use Supabase REST API if direct PostgreSQL connection fails.');
  }
}


