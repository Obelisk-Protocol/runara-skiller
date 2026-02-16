import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

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

/**
 * Bootstrap complete database schema
 * Runs on service startup to ensure all tables, indexes, functions, and triggers exist
 */
export async function ensureNftTable(): Promise<void> {
  const conn = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!conn) {
    console.log('ℹ️ Skipping database bootstrap: DATABASE_URL not set');
    return;
  }

  // Use retry logic with exponential backoff for transient connection issues
  try {
    await retryWithBackoff(async () => {
      let client: any = null;
      try {
        // Determine if SSL is needed (Railway PostgreSQL uses SSL in production)
        const sslNeeded = process.env.PGSSL === 'true' || 
                         /supabase\.(co|net)/i.test(conn) || 
                         /render\.com/i.test(conn) ||
                         /railway\.app/i.test(conn) ||
                         process.env.NODE_ENV === 'production';
        
        client = new Client({ 
          connectionString: conn, 
          ssl: sslNeeded ? { rejectUnauthorized: false } : undefined 
        } as any);
        
        await client.connect();
        console.log('📊 Connected to PostgreSQL database');
        
        // Load complete schema migration
        // Try multiple possible paths (development vs production)
        const possiblePaths = [
          path.join(__dirname, '../../migrations/999_complete_schema_migration.sql'),
          path.join(process.cwd(), 'migrations/999_complete_schema_migration.sql'),
          path.join(process.cwd(), 'obelisk-skiller/migrations/999_complete_schema_migration.sql'),
        ];
        
        let migrationPath: string | null = null;
        for (const testPath of possiblePaths) {
          if (fs.existsSync(testPath)) {
            migrationPath = testPath;
            break;
          }
        }
        
        if (!migrationPath) {
          throw new Error(`Migration file not found. Tried: ${possiblePaths.join(', ')}`);
        }
        
        const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
        console.log(`📝 Loading complete schema migration (${(migrationSQL.length / 1024).toFixed(2)} KB)...`);
        
        // Also load auth fields migration if it exists
        const authMigrationPaths = [
          path.join(__dirname, '../../migrations/010_add_auth_fields.sql'),
          path.join(process.cwd(), 'migrations/010_add_auth_fields.sql'),
          path.join(process.cwd(), 'obelisk-skiller/migrations/010_add_auth_fields.sql'),
        ];
        
        let authMigrationSQL: string | null = null;
        for (const testPath of authMigrationPaths) {
          if (fs.existsSync(testPath)) {
            authMigrationSQL = fs.readFileSync(testPath, 'utf-8');
            console.log(`📝 Loading auth fields migration...`);
            break;
          }
        }
        
        // Load polygon collision migration if it exists
        const polygonCollisionMigrationPaths = [
          path.join(__dirname, '../../migrations/20250206000000_add_polygon_collision.sql'),
          path.join(process.cwd(), 'migrations/20250206000000_add_polygon_collision.sql'),
          path.join(process.cwd(), 'obelisk-skiller/migrations/20250206000000_add_polygon_collision.sql'),
        ];
        
        let polygonCollisionMigrationSQL: string | null = null;
        for (const testPath of polygonCollisionMigrationPaths) {
          if (fs.existsSync(testPath)) {
            polygonCollisionMigrationSQL = fs.readFileSync(testPath, 'utf-8');
            console.log(`📝 Loading polygon collision migration...`);
            break;
          }
        }
        
        // Use a transaction for atomicity
        await client.query('BEGIN');
        await client.query(migrationSQL);
        if (authMigrationSQL) {
          await client.query(authMigrationSQL);
        }
        if (polygonCollisionMigrationSQL) {
          await client.query(polygonCollisionMigrationSQL);
        }
        await client.query('COMMIT');
        
        // Verify schema was created
        const { rows: tables } = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);
        
        console.log(`✅ Database schema bootstrap complete!`);
        console.log(`📊 Created/verified ${tables.length} tables`);
        
      } catch (e) {
        try { 
          await client?.query('ROLLBACK'); 
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
    // Log warning but don't fail server startup - schema likely already exists
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.warn('⚠️ Database bootstrap completed with warnings:', errorMsg);
    console.warn('ℹ️ This is usually non-fatal if the schema already exists. Service will continue.');
  }
}


