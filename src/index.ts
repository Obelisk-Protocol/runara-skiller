import express, { Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { Client } from 'pg';
import { ensureNftTable } from './services/bootstrap';
// Note: supabase import removed - using PostgreSQL directly now
import { getAllSkillXp, markAssetSynced } from './services/nft-skill-experience';
import { NftColumns } from './services/database';

// Import routes
import characterRoutes from './routes/characters';
import characterImageRoutes from './routes/character-images';
import skillRoutes from './routes/skills';
import skillTrainingRoutes from './routes/skill-training';
import cnftRoutes from './routes/cnft';
import healthRoutes from './routes/health';
import metadataRoutes from './routes/metadata';
import dasRoutes from './routes/das';
import slotRoutes from './routes/slots';
import slotOffchainRoutes from './routes/slots-offchain';
import cobxRoutes from './routes/cobx';
import cobxOffchainRoutes from './routes/cobx-offchain';
import marketplaceRoutes from './routes/marketplace';
import playersRoutes from './routes/players';
import playersOffchainRoutes from './routes/players-offchain';
import itemRoutes from './routes/items';
import playerStructureRoutes from './routes/player-structures';
import craftingRoutes from './routes/crafting';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profiles';
import nftRoutes from './routes/nfts';
import characterSelectionRoutes from './routes/character-selection';
import questRoutes from './routes/quests';
import configRoutes from './routes/config';
import characterCustomizationRoutes from './routes/character-customization';

// Load environment variables
dotenv.config();

// Validate critical environment variables at startup
function validateEnvironment() {
  const requiredVars = [
    'DATABASE_URL', // Railway PostgreSQL (required for migration)
    'PRIVATE_SERVER_WALLET',
    'SOLANA_CLUSTER'
  ];

  const missing: string[] = [];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Note: SUPABASE_URL and SUPABASE_SERVICE_ROLE are no longer required
  // Database now uses Railway PostgreSQL directly via DATABASE_URL

  // Validate cluster-specific token mints
  const cluster = (process.env.SOLANA_CLUSTER || '').toLowerCase();
  const isMainnet = cluster === 'mainnet-beta' || cluster === 'mainnet';
  
  if (isMainnet && !process.env.COBX_MINT_MAINNET) {
    console.error('❌ Missing COBX_MINT_MAINNET for mainnet cluster');
    throw new Error('COBX_MINT_MAINNET environment variable is required for mainnet-beta cluster');
  }

  if (!isMainnet && !process.env.COBX_MINT_DEVNET) {
    console.error('❌ Missing COBX_MINT_DEVNET for devnet cluster');
    throw new Error('COBX_MINT_DEVNET environment variable is required for devnet cluster');
  }

  console.log('✅ Environment variables validated');
  console.log(`🌐 Cluster: ${cluster === 'mainnet-beta' || cluster === 'mainnet' ? 'mainnet-beta' : 'devnet'}`);
}

try {
  validateEnvironment();
} catch (error) {
  console.error('❌ Server startup failed:', error);
  process.exit(1);
}

const app = express();
// Railway automatically sets PORT environment variable
// Use PORT if set, otherwise default to 3000 for local development
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware — order and logic restored to pre–CORS-change behavior
app.use(helmet());
app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:3001', 'https://runara.fun', 'https://www.runara.fun'];
    if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
      return callback(null, true);
    }
    if (origin.includes('.pages.dev')) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, process.env.NODE_ENV === 'production' ? false : true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-xp-timestamp', 'x-xp-signature']
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Ensure character images directory exists (for local fallback only)
// CRITICAL: Images are now stored in Supabase Storage for persistence
// Local directory is only used as a fallback for development
const characterImagesDir = process.env.CHARACTER_IMAGES_DIR || 
  path.join(__dirname, '../public/character-images');
if (!fs.existsSync(characterImagesDir)) {
  fs.mkdirSync(characterImagesDir, { recursive: true });
  console.log(`📁 Created character images directory (fallback): ${characterImagesDir}`);
} else {
  console.log(`📁 Character images directory (fallback): ${characterImagesDir}`);
}

// Cloudflare R2 bucket is managed separately via Wrangler CLI
// No initialization needed here - bucket is already created and configured

// Serve character images statically with proper headers
app.use('/character-images', express.static(characterImagesDir, {
  maxAge: '1d', // Cache for 1 day
  etag: true,
  lastModified: true,
  setHeaders: (res: any, filePath: string) => {
    // Set CORS headers for images
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

// Health check endpoint
app.use('/health', healthRoutes);

// API routes
app.use('/api/characters', characterRoutes);
app.use('/api/characters', characterImageRoutes); // Character image generation routes
app.use('/api/skills', skillRoutes);
app.use('/api/skill-training', skillTrainingRoutes);
app.use('/api/cnft', cnftRoutes);
// Serve metadata at both legacy and new paths to match old APIs
app.use('/api/metadata', metadataRoutes);
app.use('/api/player-metadata', metadataRoutes);
app.use('/api/das', dasRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/character-cnft-slots', slotRoutes); // Original routes
app.use('/api/character-cnft-slots', slotOffchainRoutes); // Off-chain routes (no PDAs)
app.use('/api/cobx', cobxRoutes);
app.use('/api/cobx', cobxOffchainRoutes); // Off-chain routes
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/players', playersOffchainRoutes); // Off-chain routes (no PDAs)
app.use('/api/items', itemRoutes);
app.use('/api/player-structures', playerStructureRoutes);
app.use('/api/craft', craftingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/character-customization', characterCustomizationRoutes);
app.use('/api/nfts', nftRoutes);
app.use('/api/character-selection', characterSelectionRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/config', configRoutes);

// Root endpoint
app.get('/', (req: any, res: any) => {
  res.json({
    service: 'Obelisk Skiller Backend',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req: any, res: any) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Obelisk Skiller Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Listening on: 0.0.0.0:${PORT}`);
  console.log(`📌 PORT env var: ${process.env.PORT || 'not set (using default 3000)'}`);
  const configuredBase = (process.env.BACKEND_URL || '').replace(/\/$/, '');
  const localBase = `http://localhost:${PORT}`;
  const backendBase = configuredBase || localBase;
  console.log(`🧭 BACKEND_BASE for metadata fetch: ${backendBase}`);
  
  // Bootstrap database table (non-blocking - server will start even if this fails)
  ensureNftTable().catch(err => {
    console.warn('⚠️ Bootstrap completed with warnings (server continues):', err instanceof Error ? err.message : String(err));
  });

  // Background worker: periodically sync on-chain for assets that recently leveled up
  const cooldownMs = Number(process.env.XP_SYNC_COOLDOWN_MS || 60000)
  setInterval(async () => {
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        console.warn('⚠️ XP sync worker: DATABASE_URL not set, skipping');
        return;
      }

      const thresholdIso = new Date(Date.now() - cooldownMs).toISOString();
      
      // Query PostgreSQL for assets with pending updates
      const sslNeeded = process.env.PGSSL === 'true' || 
                       /supabase\.(co|net)/i.test(dbUrl) || 
                       /render\.com/i.test(dbUrl) ||
                       /railway\.app/i.test(dbUrl) ||
                       process.env.NODE_ENV === 'production';
      
      const client = new Client({
        connectionString: dbUrl,
        ssl: sslNeeded ? { rejectUnauthorized: false } : undefined
      } as any);

      try {
        await client.connect();
        
        interface AssetRow {
          asset_id: string;
        }
        
        const result = await client.query(`
          SELECT DISTINCT asset_id 
          FROM nft_skill_experience 
          WHERE pending_onchain_update = true 
          AND updated_at < $1
          LIMIT 10
        `, [thresholdIso]);

        const rows = result.rows as AssetRow[];
        const assetIds = rows.map((r: AssetRow) => r.asset_id);
        
        for (const assetId of assetIds) {
          try {
            const row = await NftColumns.get(assetId);
            if (!row) { 
              await markAssetSynced(assetId); 
              continue;
            }
            const stats = await NftColumns.columnsToStatsWithSkills(row);
            // Trigger on-chain JSON update using existing flow
            // Note: playerPDA is optional - updateCharacterCNFT will use asset.leafOwner if not provided
            // This works for both old PDA-based cNFTs and new treasury-based cNFTs
            const { updateCharacterCNFT } = await import('./services/cnft');
            // Only pass player_pda if it exists (for backward compatibility with old cNFTs)
            // New off-chain cNFTs are in treasury, so leafOwner will be determined from asset
            const res = await updateCharacterCNFT(assetId, stats, row.player_pda || undefined);
            if (res.success) {
              await markAssetSynced(assetId);
            }
          } catch (e) {
            // leave pending; will retry on next tick
            console.warn(`⚠️ XP sync error for asset ${assetId}:`, e instanceof Error ? e.message : String(e));
          }
        }
      } finally {
        await client.end();
      }
    } catch (err) {
      console.warn('⚠️ XP sync worker error:', err instanceof Error ? err.message : String(err));
    }
  }, cooldownMs)
});