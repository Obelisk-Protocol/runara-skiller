import { Router } from 'express';
import { testDatabaseConnection } from '../config/database';

const router = Router();

// Health check endpoint — always return 200 when the app is up so Railway/proxies route traffic.
// DB status is in the body for monitoring; 503 would cause 502 at the load balancer.
router.get('/', async (req: any, res: any) => {
  try {
    const dbConnected = await testDatabaseConnection();
    const healthData = {
      status: dbConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: dbConnected ? 'connected' : 'disconnected',
        solana: process.env.SOLANA_RPC_URL ? 'configured' : 'not configured'
      },
      environment: process.env.NODE_ENV || 'development'
    };
    res.status(200).json(healthData);
  } catch (error) {
    res.status(200).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Deep health check
router.get('/deep', async (req: any, res: any) => {
  try {
    const checks = {
      database: await testDatabaseConnection(),
      environment: {
        database_url: !!process.env.DATABASE_URL,
        cloudflare_account_id: !!process.env.CLOUDFLARE_ACCOUNT_ID,
        cloudflare_r2_access_key: !!process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        cloudflare_r2_secret: !!process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        chunk_server_url: !!process.env.CHUNK_SERVER_URL,
        solana_rpc: !!process.env.SOLANA_RPC_URL,
        solana_key: !!process.env.PRIVATE_SERVER_WALLET
      }
    };
    
    // Database is required, others are recommended
    const requiredChecks = [checks.database, checks.environment.database_url];
    const optionalChecks = Object.values(checks.environment).filter((v, i) => i > 0); // Skip database_url (already checked)
    const allHealthy = requiredChecks.every(v => !!v) && optionalChecks.some(v => !!v);
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;