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

  att int not null default 1,
  str int not null default 1,
  def int not null default 1,
  mag int not null default 1,
  pro int not null default 1,
  vit int not null default 1,
  cra int not null default 1,
  luc int not null default 1,
  gat int not null default 1,

  last_arweave_uri text,
  last_update_sig text,
  state_version int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_nfts_player_pda on nfts(player_pda);
`;

export async function ensureNftTable(): Promise<void> {
  const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!conn) {
    console.log('ℹ️ Skipping NFT table bootstrap: SUPABASE_DB_URL/DATABASE_URL not set');
    return;
  }
  let client: any = null;
  try {
    const sslNeeded = process.env.PGSSL === 'true' || /supabase\.(co|net)/i.test(conn) || /render\.com/i.test(conn);
    client = new Client({ connectionString: conn, ssl: sslNeeded ? { rejectUnauthorized: false } : undefined } as any);
    await client.connect();
    await client.query('begin');
    await client.query(CREATE_TABLE_SQL);
    await client.query('commit');
    console.log('✅ Ensured nfts table and index exist');
  } catch (e) {
    try { await client?.query('rollback'); } catch {}
    console.error('❌ Failed to ensure nfts table:', e);
  } finally {
    try { await client?.end(); } catch {}
  }
}


