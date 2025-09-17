import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { ensureNftTable } from './services/bootstrap';
import { supabase } from './config/database';
import { getAllSkillXp, markAssetSynced } from './services/nft-skill-experience';
import { NftColumns } from './services/database';

// Import routes
import characterRoutes from './routes/characters';
import skillRoutes from './routes/skills';
import skillTrainingRoutes from './routes/skill-training';
import cnftRoutes from './routes/cnft';
import healthRoutes from './routes/health';
import metadataRoutes from './routes/metadata';
import dasRoutes from './routes/das';
import slotRoutes from './routes/slots';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.use('/health', healthRoutes);

// API routes
app.use('/api/characters', characterRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/skill-training', skillTrainingRoutes);
app.use('/api/cnft', cnftRoutes);
// Serve metadata at both legacy and new paths to match old APIs
app.use('/api/metadata', metadataRoutes);
app.use('/api/player-metadata', metadataRoutes);
app.use('/api/das', dasRoutes);
app.use('/api/slots', slotRoutes);

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

app.listen(PORT, async () => {
  console.log(`🚀 Obelisk Skiller Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  const configuredBase = (process.env.BACKEND_URL || '').replace(/\/$/, '');
  const localBase = `http://localhost:${PORT}`;
  const backendBase = configuredBase || localBase;
  console.log(`🧭 BACKEND_BASE for metadata fetch: ${backendBase}`);
  await ensureNftTable();

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
          const stats = NftColumns.columnsToStats(row)
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