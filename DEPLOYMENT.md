# 🚀 Railway Deployment Guide

Complete guide for deploying the Obelisk Skiller backend to Railway.

## Prerequisites

- Railway account (free tier available)
- Supabase project with migrations applied
- Solana wallet with devnet SOL
- Environment variables from your working frontend

## Step 1: Prepare Environment Variables

From your working frontend `.env.local`, you'll need:

```env
# From your frontend .env.local
SUPABASE_URL=https://wejhmpfwttgcfmikznyp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=[your,private,key,array]
```

## Step 2: Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

## Step 3: Create Railway Project

```bash
cd obelisk-skiller
railway init obelisk-skiller-backend
railway link
```

## Step 4: Set Environment Variables

Copy your exact values from the frontend:

```bash
# Supabase (use exact values from your .env.local)
railway variables set SUPABASE_URL="https://wejhmpfwttgcfmikznyp.supabase.co"
railway variables set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Solana (use exact values from your .env.local)  
railway variables set SOLANA_RPC_URL="https://api.devnet.solana.com"
railway variables set SOLANA_PRIVATE_KEY='[your,private,key,array]'

# Backend specific
railway variables set NODE_ENV="production"
railway variables set PORT="3000"

# Will be updated after deployment
railway variables set BACKEND_URL="https://placeholder.railway.app"
railway variables set CORS_ORIGIN="*"
```

## Step 5: Deploy

```bash
railway up
```

This will:
- Build the Docker container
- Deploy to Railway
- Provide you with a domain

## Step 6: Update Backend URL

After deployment, get your domain:

```bash
railway domain
```

Update the backend URL:

```bash
railway variables set BACKEND_URL="https://your-actual-domain.railway.app"
```

Redeploy:

```bash
railway up
```

## Step 7: Test Deployment

Test the health endpoint:

```bash
curl https://your-domain.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-18T...",
  "version": "1.0.0",
  "services": {
    "database": "connected",
    "solana": "configured"
  }
}
```

## Step 8: Test Character Operations

### Create a character:
```bash
curl -X POST https://your-domain.railway.app/api/characters \
  -H "Content-Type: application/json" \
  -d '{
    "playerPDA": "5nqtWVqMWo4xXJi5nbJg5PgeK7FuP5zF9iL5V9k3YG7p",
    "playerId": "your-player-uuid",
    "characterName": "TestCharacter",
    "characterClass": "Warrior"
  }'
```

### Train a skill:
```bash
curl -X POST https://your-domain.railway.app/api/characters/train-skill \
  -H "Content-Type: application/json" \
  -d '{
    "assetId": "character-cnft-id",
    "skillName": "attack"
  }'
```

## Step 9: Update Frontend

Replace your frontend API calls:

**Before:**
```javascript
// In your frontend
fetch('/api/update-cnft-metadata', { ... })
```

**After:**
```javascript
// Point to Railway backend
fetch('https://your-domain.railway.app/api/cnft/update-cnft-metadata', { ... })
```

## Step 10: Production Configuration

### Set CORS for production:
```bash
railway variables set CORS_ORIGIN="https://your-frontend-domain.com"
```

### Monitor logs:
```bash
railway logs
```

### Scale if needed:
```bash
railway up --replicas 2
```

## Railway Configuration Files

The deployment uses these files:

### `railway.json`
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### `Dockerfile`
Optimized for Railway with:
- Node.js 18 Alpine (smaller image)
- Non-root user for security
- Health checks
- Production build

## Monitoring & Maintenance

### Health Checks
- Basic: `GET /health`
- Deep: `GET /health/deep`

### View Logs
```bash
railway logs --tail
```

### Restart Service
```bash
railway redeploy
```

### Update Environment Variables
```bash
railway variables set KEY="value"
```

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check TypeScript compilation: `npm run build`
   - Verify dependencies: `npm install`

2. **Database Connection Issues**
   - Verify Supabase URL and key
   - Check Supabase service status
   - Test connection: `GET /health/deep`

3. **Solana RPC Issues**
   - Verify RPC endpoint is accessible
   - Check private key format (JSON array)
   - Test with devnet first

4. **Memory/Performance Issues**
   - Monitor Railway metrics
   - Consider upgrading plan
   - Optimize caching

### Debug Mode

Set debug logging:
```bash
railway variables set DEBUG="*"
```

### Service Restart

If issues persist:
```bash
railway redeploy
```

## Cost Optimization

### Railway Free Tier
- 512MB RAM
- $5 credit monthly
- Perfect for development/testing

### Production Scaling
- Monitor usage in Railway dashboard
- Scale resources as needed
- Consider caching for performance

## Security Checklist

- ✅ Service role key (not anon key) for Supabase
- ✅ Private key securely stored in Railway variables
- ✅ CORS properly configured
- ✅ No sensitive data in logs
- ✅ Health checks enabled
- ✅ Non-root Docker container

## Success Criteria

Your deployment is successful when:

1. ✅ Health check returns 200 status
2. ✅ Database connection is established
3. ✅ Character creation works
4. ✅ Skill training functions
5. ✅ cNFT updates complete
6. ✅ Metadata URIs serve correctly
7. ✅ Frontend integration works

## Next Steps

After successful deployment:

1. **Update Frontend**: Point all cNFT operations to backend
2. **Test Thoroughly**: Verify all character operations
3. **Monitor Performance**: Watch Railway metrics
4. **Scale as Needed**: Upgrade Railway plan if required
5. **Setup Monitoring**: Add error tracking (Sentry, etc.)

🎉 **Congratulations!** Your Obelisk Skiller backend is now running on Railway!