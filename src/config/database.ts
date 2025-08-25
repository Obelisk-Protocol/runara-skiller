import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

if (!process.env.SUPABASE_SERVICE_ROLE) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE environment variable');
}

// Create Supabase client with service role key for backend operations
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Log DB hosts for visibility
try {
  const supaHost = new URL(process.env.SUPABASE_URL || '').host
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || ''
  const dbHost = (() => { try { return new URL(dbUrl).host } catch { return dbUrl.slice(0, 32) } })()
  // eslint-disable-next-line no-console
  console.log(`[DB] Supabase REST host=${supaHost} PG host=${dbHost} (fallback allowed=${process.env.ALLOW_DATABASE_URL_FALLBACK === 'true'})`)
} catch {}

// Test connection function
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('player_skill_experience')
      .select('player_pda')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection test failed:', error);
      return false;
    }
    
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error);
    return false;
  }
}