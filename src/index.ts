import express, { Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { ensureNftTable } from './services/bootstrap';
import { supabase } from './config/database';
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
import cobxRoutes from './routes/cobx';
import marketplaceRoutes from './routes/marketplace';
import playersRoutes from './routes/players';
import itemRoutes from './routes/items';

// Load environment variables
dotenv.config();

// Validate critical environment variables at startup
function validateEnvironment() {
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE',
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

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
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

// Initialize Supabase Storage bucket on startup
(async () => {
  try {
    const { supabase } = await import('./config/database');
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.warn(`⚠️ Failed to check Supabase Storage buckets: ${error.message}`);
      return;
    }

    const bucketExists = buckets?.some(b => b.name === 'character-images');
    
    if (!bucketExists) {
      console.log(`📦 Creating Supabase Storage bucket: character-images`);
      const { error: createError } = await supabase.storage.createBucket('character-images', {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp']
      });
      
      if (createError) {
        console.warn(`⚠️ Failed to create bucket: ${createError.message}`);
      } else {
        console.log(`✅ Supabase Storage bucket 'character-images' ready`);
      }
    } else {
      console.log(`✅ Supabase Storage bucket 'character-images' exists`);
    }
  } catch (error) {
    console.warn(`⚠️ Error initializing Supabase Storage: ${error instanceof Error ? error.message : String(error)}`);
  }
})();

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
// Route alias for Unity compatibility
app.use('/api/character-cnft-slots', slotRoutes);
app.use('/api/cobx', cobxRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/items', itemRoutes);

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
      const thresholdIso = new Date(Date.now() - cooldownMs).toISOString()
      // Find assets with any pending skill update older than cooldown
      const { data, error } = await supabase
        .from('nft_skill_experience')
        .select('asset_id')
        .eq('pending_onchain_update', true)
        .lt('updated_at', thresholdIso)
      if (error) return
      const assetIds = Array.from(new Set((data || []).map((r: any) => r.asset_id))).slice(0, 10)
      for (const assetId of assetIds) {
        try {
          const row = await NftColumns.get(assetId)
          if (!row) { await markAssetSynced(assetId); continue }
          const stats = await NftColumns.columnsToStatsWithSkills(row)
          // Trigger on-chain JSON update using existing flow
          const { updateCharacterCNFT } = await import('./services/cnft')
          const res = await updateCharacterCNFT(assetId, stats, row.player_pda || undefined)
          if (res.success) {
            await markAssetSynced(assetId)
          }
        } catch (e) {
          // leave pending; will retry on next tick
        }
      }
    } catch {}
  }, cooldownMs)
});