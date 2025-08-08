import { Router } from 'express';
import { testDatabaseConnection } from '../config/database';

const router = Router();

// Health check endpoint
router.get('/', async (req: any, res: any) => {
  try {
    const dbConnected = await testDatabaseConnection();
    
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: dbConnected ? 'connected' : 'disconnected',
        solana: process.env.SOLANA_RPC_URL ? 'configured' : 'not configured'
      },
      environment: process.env.NODE_ENV || 'development'
    };
    
    const statusCode = dbConnected ? 200 : 503;
    res.status(statusCode).json(healthData);
    
  } catch (error) {
    res.status(500).json({
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
        supabase_url: !!process.env.SUPABASE_URL,
        supabase_key: !!process.env.SUPABASE_SERVICE_ROLE,
        solana_rpc: !!process.env.SOLANA_RPC_URL,
        solana_key: !!process.env.PRIVATE_SERVER_WALLET,
        backend_url: !!process.env.BACKEND_URL
      }
    };
    
    const envValues: boolean[] = Object.values(checks.environment as Record<string, boolean>) as boolean[];
    const allHealthy = !!checks.database && envValues.every(v => !!v);
    
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