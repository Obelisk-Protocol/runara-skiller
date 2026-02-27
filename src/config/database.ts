/**
 * PostgreSQL Database Configuration
 * Direct PostgreSQL access via Railway
 */

// Test connection function
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.warn('⚠️ DATABASE_URL not set - cannot test database connection');
      return false;
    }

    const { Client } = await import('pg');
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    
    console.log('✅ PostgreSQL database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error);
    return false;
  }
}
