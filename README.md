# Obelisk Skiller Backend

TypeScript backend service for Runara character and skill management on Solana blockchain.

## 🚀 Features

- **Character cNFT Management**: Create, update, and fetch character cNFTs using Metaplex Bubblegum
- **Skill Experience Tracking**: Database-backed skill progression system  
- **Metaplex Standard Compliance**: Full marketplace compatibility with standard metadata format
- **Real-time Database**: Supabase integration for fast skill updates
- **Production Ready**: Built for Railway deployment with Docker

## 🏗️ Architecture

### Services
- **cNFT Service** (`src/services/cnft.ts`): Blockchain operations for character cNFTs
- **Character Service** (`src/services/character.ts`): High-level character management
- **Database Service** (`src/services/database.ts`): Supabase operations and skill tracking
- **Metadata Store**: In-memory storage for character metadata URIs

### API Endpoints

#### Characters (`/api/characters`)
- `POST /` - Create new character
- `GET /:assetId` - Get character by cNFT ID
- `GET /player/:playerId` - Get all characters for player
- `POST /train-skill` - Train a specific skill (+1 level)
- `POST /level-up-stat` - Level up primary stat
- `POST /update-metadata` - Update cNFT metadata
- `POST /sync/:assetId` - Sync character from cNFT to database

#### Skills (`/api/skills`)
- `GET /:playerPDA` - Get player skill experience
- `POST /add-experience` - Add experience to skill
- `POST /mark-synced` - Mark skills as synced to blockchain
- `GET /leaderboard/:skill` - Get skill leaderboard
- `GET /rankings/total-level` - Get total level rankings

#### cNFT (`/api/cnft`)
- `GET /player-metadata/:id` - Serve character metadata (NFT standard)
- `POST /player-metadata/:id` - Store character metadata
- `POST /fetch-player-cnfts-simple` - Fetch player cNFTs (compatibility)
- `POST /update-cnft-metadata` - Update cNFT metadata (compatibility)

#### Health (`/health`)
- `GET /` - Basic health check
- `GET /deep` - Deep health check with service status

## 🛠️ Setup

### Prerequisites
- Node.js 18+
- Supabase project with migrations applied
- Solana wallet with devnet SOL
- Railway account (for deployment)

### Local Development

1. **Clone and install dependencies**:
   ```bash
   cd skiller
   npm install
   ```

2. **Copy environment variables**:
   ```bash
   cp env.example .env
   ```

3. **Configure environment variables** (see `env.example` for full list):
   ```env
   # Database (PostgreSQL - Supabase, Railway, or self-hosted)
   SKILLER_DATABASE_URL=postgresql://user:password@host:port/database
   
   # Solana (use Helius, QuickNode, etc. - get your own API key)
   SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
   PRIVATE_SERVER_WALLET=[1,2,3,4,5,...] # JSON array - NEVER commit
   
   # Backend
   PORT=3000
   NODE_ENV=development
   ```

4. **Apply database migrations**:
   ```sql
   -- Run the SQL files in migrations/ folder in your Supabase SQL editor
   -- 001_initial_schema.sql
   -- 20250118000000_add_skill_tracking.sql
   ```

5. **Start development server**:
   ```bash
   npm run dev
   ```

6. **Test the service**:
   ```bash
   curl http://localhost:3000/health
   ```

## 🚀 Railway Deployment

### 1. Prepare for Deployment

The service is pre-configured for Railway with:
- `Dockerfile` for containerized deployment
- `railway.json` for Railway-specific configuration
- Environment variable templates

### 2. Deploy to Railway

1. **Connect to Railway**:
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Create new project**:
   ```bash
   railway init
   railway link
   ```

3. **Set environment variables**:
   ```bash
   railway variables set SUPABASE_URL=https://your-project.supabase.co
   railway variables set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   railway variables set SOLANA_RPC_URL=https://api.devnet.solana.com
   railway variables set SOLANA_PRIVATE_KEY='[1,2,3,4,5,...]'
   railway variables set NODE_ENV=production
   ```

4. **Deploy**:
   ```bash
   railway up
   ```

5. **Get deployment URL**:
   ```bash
   railway domain
   ```

### 3. Update Environment Variables

After deployment, update:
- `BACKEND_URL` to your Railway domain
- `CORS_ORIGIN` to your frontend domain

## 📊 Database Schema

The service uses the existing Supabase schema with these key tables:

### `characters`
Stores character data for fast access and backup:
- `character_cnft_id`: cNFT asset address
- `player_id`: UUID linking to user
- Character stats, skills, and metadata

### `player_skill_experience`  
Tracks skill progression:
- `player_pda`: Solana wallet address
- XP and levels for each skill
- Sync status with blockchain

### `experience_logs`
Audit trail for all XP gains:
- Source tracking (dungeon, casino, etc.)
- Session and game mode context

## 🔧 Integration with Frontend

### Replacing Frontend cNFT Operations

The backend provides drop-in replacements for your frontend APIs:

**Before (Frontend)**:
```javascript
fetch('/api/update-cnft-metadata', { ... })
```

**After (Backend)**:
```javascript
fetch('https://your-backend.railway.app/api/cnft/update-cnft-metadata', { ... })
```

### Character Management Flow

1. **Create Character**: `POST /api/characters`
2. **Train Skills**: `POST /api/characters/train-skill`  
3. **Save to Blockchain**: `POST /api/characters/update-metadata`
4. **Fetch Characters**: `GET /api/characters/player/:playerId`

### Metadata URI Integration

Characters automatically use backend metadata URIs:
```
https://your-backend.railway.app/api/cnft/player-metadata/{id}
```

This ensures marketplace compatibility and persistent character data.

## 📈 Monitoring

### Health Checks
- Basic: `GET /health`
- Deep: `GET /health/deep`

### Logging
All operations include structured logging:
- Database operations
- Blockchain transactions  
- API requests and responses
- Error tracking

### Metrics
Track key metrics:
- Character creation rate
- Skill training frequency
- cNFT update success rate
- Database sync status

## 🔒 Security

- Service role authentication for Supabase
- Input validation with Zod schemas
- CORS protection
- Helmet middleware for security headers
- Non-root Docker container

## 🧪 Testing

```bash
# Run tests
npm test

# Run linting
npm run lint

# Check types
npm run build
```

## 📚 API Documentation

### Character Creation
```javascript
POST /api/characters
{
  "playerPDA": "5nqtWVqMWo4xXJi5nbJg5PgeK7FuP5zF9iL5V9k3YG7p",
  "playerId": "uuid-here",
  "characterName": "Belacosaur",
  "characterClass": "Adventurer"
}
```

### Skill Training  
```javascript
POST /api/characters/train-skill
{
  "assetId": "82LrWa21iWHPmYEVsjCL8D2rHtxZWWraRV3T4GocoZRd",
  "skillName": "attack",
  "playerPDA": "5nqtWVqMWo4xXJi5nbJg5PgeK7FuP5zF9iL5V9k3YG7p"
}
```

### Experience Addition
```javascript
POST /api/skills/add-experience
{
  "playerPDA": "5nqtWVqMWo4xXJi5nbJg5PgeK7FuP5zF9iL5V9k3YG7p",
  "skill": "combat",
  "experienceGain": 100,
  "source": "dungeon_completion"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## 📄 License

MIT License - see LICENSE file for details