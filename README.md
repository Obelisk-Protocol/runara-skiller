<div align="center">

# ⚔️ Runara Skiller

**The backend powering Runara — a Solana-native RPG with RuneScape-inspired skills, compressed NFTs, and a hybrid on-chain/off-chain economy.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-9945FF)](https://solana.com/)
[![Metaplex](https://img.shields.io/badge/Metaplex-Bubblegum-5C3EFE)](https://www.metaplex.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

*RuneScape-style skill progression • Compressed NFTs • Token-2022 • Zero-friction onboarding*

</div>

---

## 🎯 What Is This?

**Runara Skiller** is the game backend for [Runara](https://runara.fun) — a hack-and-slash dungeon crawler built on Solana. It handles everything from character cNFT minting and skill XP tracking to crafting, inventory, marketplace listings, and a hybrid economy that lets players **start playing instantly** (no wallet required) while preserving full blockchain ownership when they're ready.

### Why It's Different

| Problem | Our Solution |
|--------|--------------|
| **Wallet fatigue** | Web2 signup → instant play. Link wallet when ready. |
| **Gas for everything** | Off-chain state + batched on-chain sync. Blockchain only when it matters. |
| **cNFT metadata bloat** | 16 skills, combat level, total level — all in standard Metaplex metadata. |
| **Fragmented XP systems** | OSRS-style curves, idempotency, server-authoritative. No client trust. |
| **Complex onboarding** | One backend. One DB. One API. |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         RUNARA SKILLER (Express + PostgreSQL)                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │  Characters │  │   Skills    │  │   cOBX /    │  │   Crafting  │            │
│   │  & cNFTs    │  │  (16 types) │  │   Offchain  │  │  & Items    │            │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│          │                │                │                │                     │
│          └────────────────┴────────────────┴────────────────┘                     │
│                                    │                                              │
│                          ┌─────────▼─────────┐                                    │
│                          │    PostgreSQL     │  profiles, nfts, nft_skill_        │
│                          │  (Railway/Supabase)  experience, player_items,         │
│                          │                   │  player_structures, quests...      │
│                          └─────────┬─────────┘                                    │
│                                    │                                              │
└────────────────────────────────────┼──────────────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│ Solana Mainnet  │      │  Cloudflare R2      │      │   Tick Server /      │
│ • Metaplex      │      │  • Character images │      │   Game Client        │
│   Bubblegum     │      │  • Dynamic portraits│      │ • XP deltas          │
│ • Token-2022    │      │                     │      │ • Action events      │
│ • cOBX mint     │      │                     │      │                      │
└─────────────────┘      └─────────────────────┘      └─────────────────────┘
```

### Design Principles

1. **Database as source of truth** — All game logic, balances, and XP live in PostgreSQL. Blockchain is for ownership and withdrawals.
2. **Off-chain first, on-chain when needed** — New players get instant accounts. Link wallet → withdraw cOBX, withdraw character cNFTs.
3. **Server-authoritative** — XP, crafting, and rewards are validated server-side. Clients send actions; server decides outcomes.
4. **Metaplex-compliant** — Character cNFTs use standard metadata. Listable on any Solana marketplace.

---

## ⚡ Features

### 🎮 16 Skills (RuneScape-Inspired)

| Combat | Gathering | Crafting | Special |
|--------|-----------|----------|---------|
| Attack | Mining | Smithing | Luck |
| Strength | Woodcutting | Crafting | |
| Defense | Fishing | Cooking | |
| Magic | Hunting | Alchemy | |
| Projectiles | | Construction | |
| Vitality | | | |

- **OSRS-style XP curve** — Levels 1–99 with authentic thresholds
- **Per-character tracking** — Each cNFT has its own skill XP
- **Action-based training** — `enemy_kill_basic` → attack XP, `woodcut_tree_medium` → woodcutting XP, etc.
- **Idempotency** — `xp_award_events` table prevents duplicate XP from retries
- **Background sync** — Level-ups queue on-chain metadata updates (configurable cooldown)

### 🧙 Character cNFTs

- **Metaplex Bubblegum** — Compressed NFTs for gas efficiency
- **Metadata includes** — Name, combat level, total level, all 16 skill levels + XP
- **Dynamic images** — Generated from customization + equipment (Sharp), stored in R2 or local fallback
- **5 character slots** — Per player, mix of on-chain and off-chain
- **Treasury storage** — Off-chain cNFTs held in server wallet until withdrawal
- **Deposit / withdraw** — Move cNFTs between treasury and player wallet

### 💰 Hybrid Economy

| Mode | Balance | Characters | Withdrawal |
|------|---------|------------|------------|
| **Off-chain** | DB only | Treasury-held cNFTs | One-time setup |
| **On-chain** | Token-2022 (cOBX) | Player wallet | Instant |

- **cOBX** — In-game currency (Token-2022), minted as rewards
- **OBX** — SPL token for deposits/withdrawals
- **Mines minigame** — Bet cOBX, cash out

### 🛠️ Crafting & Inventory

- **Recipe-based crafting** — Consume ingredients → award items
- **Item definitions** — Types, rarity, sprites, recipes in DB
- **Player inventory** — Move, award, clear; links to `item_definitions`
- **Player structures** — Place/remove structures in world chunks (x, y)

### 🏪 Marketplace

- List, buy, cancel cNFT listings
- Integrates with Anchor program for on-chain settlement

### 🔐 Auth & Profiles

- **Email/password** — bcrypt + JWT
- **Wallet sign-in** — Solana message signing
- **Admin bypass** — For waitlist/gated access
- **Profiles** — Character name, class, slots, customization

### 📋 Other

- **Quests** — CRUD for quest definitions
- **Waitlist** — Join, check status, count
- **Referral codes** — Track signups
- **DAS integration** — Asset lookups via Helius

---

## 🛣️ How We Do Things

### XP Flow

```
Game Client (Phaser)     →  Tick Server / Direct API  →  Runara Skiller
   "enemy_kill_basic"         POST /api/characters/award-action     addSkillXp(assetId, 'attack', 25)
   or raw XP                  POST /api/skills/add-experience       → nft_skill_experience
                                                                     → experience_logs
                                                                     → pending_onchain_update = true
                                                                     
Background worker (60s)  →  updateCharacterCNFT()  →  Metaplex metadata on-chain
                             markAssetSynced()
```

### Character Creation (Off-Chain)

1. `POST /api/players/initialize-web2-offchain` — Create profile, no PDA
2. `POST /api/character-cnft-slots/mint-offchain` — Mint cNFT to treasury, assign to slot 1
3. Player plays; XP accumulates in DB
4. When ready: `POST /api/cnft/withdraw` — Transfer cNFT to player wallet

### API Auth

- **JWT** — For email/password and wallet sign-in
- **x-api-key + x-xp-signature** — For tick server / trusted services (HMAC-SHA256)
- **CORS** — Configurable allowed origins

---

## 🚀 Quick Start

```bash
git clone https://github.com/Obelisk-Protocol/runara-skiller.git
cd runara-skiller
npm install
cp env.example .env
# Edit .env: DATABASE_URL, SOLANA_RPC_URL, PRIVATE_SERVER_WALLET, etc.
npm run dev
```

Apply migrations in order from `migrations/` (PostgreSQL). Key files:

- `001_initial_schema.sql` — Base schema
- `20250118000000_add_skill_tracking.sql` — Skill XP
- `20250119000001_upgrade_existing_supabase_to_18_skills.sql` — 18-skill upgrade
- `20250204_offchain_program_integration.sql` — Off-chain tables

```bash
curl http://localhost:8080/health
```

---

## 📁 Project Structure

```
skiller/
├── src/
│   ├── index.ts              # Express app, routes, XP sync worker
│   ├── routes/               # API handlers (characters, skills, cobx, auth, ...)
│   ├── services/             # Business logic
│   │   ├── cnft.ts           # Metaplex Bubblegum, mint/update/burn
│   │   ├── nft-skill-experience.ts  # XP math, nft_skill_experience
│   │   ├── character.ts      # Stats, combat/total level
│   │   ├── crafting.ts       # Recipe validation, consume, award
│   │   ├── offchain-program/ # Off-chain player, tokens, cNFT storage
│   │   └── ...
│   ├── config/               # Solana, database, Bubblegum
│   └── utils/                # xp-level (OSRS curve), pg-helper, auth
├── migrations/               # SQL migrations
├── scripts/                  # One-off scripts, test runners
├── docs/                     # Architecture, deployment, frontend integration
└── public/                   # Character sprites, static assets
```

---

## 📚 API Overview

| Route | Purpose |
|-------|---------|
| `/health`, `/health/deep` | Health checks |
| `/api/auth/*` | Signup, signin, wallet, admin bypass |
| `/api/characters/*` | Create, train, award XP, generate images |
| `/api/skills/*` | Get XP, add experience, batch, leaderboard |
| `/api/cnft/*` | Metadata, mint, burn, deposit, withdraw |
| `/api/character-cnft-slots/*` | Slots (on-chain + off-chain mint) |
| `/api/cobx/*` | Balance, mint, reward, off-chain ops |
| `/api/players/*` | Items, inventory, off-chain init |
| `/api/craft/*` | Craft items |
| `/api/items/*` | Item definitions, sprites |
| `/api/player-structures/*` | Place structures in chunks |
| `/api/marketplace/*` | List, buy, cancel |
| `/api/quests/*` | Quest CRUD |
| `/api/config/*` | Config init |
| `/api/das/*` | DAS asset lookups |

See `docs/FRONTEND_INTEGRATION.md` for request/response examples.

---

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 18+ |
| Language | TypeScript 5.9 |
| Framework | Express |
| Database | PostgreSQL (Railway, Supabase, or self-hosted) |
| Blockchain | Solana, Metaplex (Bubblegum, Token Metadata), UMI |
| Auth | bcrypt, JWT, TweetNaCl (wallet) |
| Images | Sharp, Cloudflare R2 |
| Validation | Zod |
| Deployment | Railway, Docker |

---

## 📖 Documentation

- **[docs/OFFCHAIN_ARCHITECTURE.md](docs/OFFCHAIN_ARCHITECTURE.md)** — Off-chain design, schema, flows
- **[docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md)** — Railway, migrations, env vars
- **[docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md)** — Endpoint examples for game client
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — How to contribute
- **[SECURITY.md](SECURITY.md)** — Vulnerability reporting

---

## 🧪 Testing

```bash
npm test
npm run test:offchain      # Off-chain integration tests
npm run test:offchain:check-env  # Verify env for tests
npm run lint
npm run build
```

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**Built for [Runara](https://runara.fun)** • [Obelisk Protocol](https://github.com/Obelisk-Protocol)

</div>
