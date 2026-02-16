# Deployment Checklist - Off-Chain Integration

## Pre-Deployment

### ✅ Code Status
- [x] All routes created and registered in `index.ts`
- [x] Frontend updated with fallback support
- [x] No linting errors
- [x] All imports resolved
- [x] Backward compatibility maintained

### Database Migration
- [ ] Run migration on Railway database:
  ```bash
  psql $DATABASE_URL -f migrations/20250204_offchain_program_integration.sql
  ```
- [ ] Verify tables created:
  - `player_accounts` (if separate table needed)
  - `player_token_accounts`
  - `player_character_cnfts`
  - `balance_transactions`
  - `reward_transactions`
- [ ] Verify `profiles` table updated with new columns

### Environment Variables
- [ ] `DATABASE_URL` - Railway PostgreSQL connection string
- [ ] `PRIVATE_SERVER_WALLET` - Server wallet private key (JSON array)
- [ ] `SOLANA_CLUSTER` - `devnet` or `mainnet-beta`
- [ ] `SOLANA_RPC_URL` - RPC endpoint URL
- [ ] `COBX_MINT_DEVNET` / `COBX_MINT_MAINNET` - cOBX mint address
- [ ] `OBX_MINT_DEVNET` / `OBX_MINT_MAINNET` - OBX mint address
- [ ] `COLLECTION_MINT_DEVNET` / `COLLECTION_MINT_MAINNET` - Collection mint
- [ ] `MERKLE_TREE_DEVNET` / `MERKLE_TREE_MAINNET` - Merkle tree address

## Deployment Steps

### 1. Backend (Railway)
- [ ] Push code to repository
- [ ] Railway auto-deploys (or trigger manual deploy)
- [ ] Verify deployment logs show no errors
- [ ] Check health endpoint: `GET /api/health`
- [ ] Verify routes are accessible

### 2. Frontend (Vercel)
- [ ] Push code to repository
- [ ] Vercel auto-deploys (or trigger manual deploy)
- [ ] Verify build succeeds
- [ ] Check environment variables in Vercel dashboard
- [ ] Test frontend loads correctly

## Post-Deployment Testing

### Backend Endpoints
- [ ] `POST /api/players/initialize-web2-offchain` - Create new player
- [ ] `GET /api/players/me-offchain` - Get player data
- [ ] `GET /api/cobx/balance-offchain` - Get balance
- [ ] `POST /api/cobx/reward-offchain` - Mint reward (test with small amount)
- [ ] `GET /api/cobx/transactions-offchain` - Get transaction history
- [ ] `POST /api/character-cnft-slots/mint-offchain` - Mint character (slot 1 is free)

### Frontend Integration
- [ ] New user signup creates account via off-chain endpoint
- [ ] Balance displays correctly
- [ ] Character minting works
- [ ] Fallback to old endpoints works for existing players

### Backward Compatibility
- [ ] Old endpoints still work for existing players
- [ ] Existing players can continue using old system
- [ ] No breaking changes observed

## Monitoring

### Logs to Watch
- [ ] No errors in Railway logs
- [ ] No errors in Vercel build logs
- [ ] Database connection successful
- [ ] Token account creation working
- [ ] Balance updates working

### Metrics to Track
- [ ] New player registrations
- [ ] Balance operations success rate
- [ ] Character minting success rate
- [ ] Error rates (should be low)

## Rollback Plan

If issues occur:
1. **Backend**: Revert to previous deployment on Railway
2. **Frontend**: Revert to previous deployment on Vercel
3. **Database**: Migration is additive, no rollback needed (old endpoints still work)

## Notes

- All new endpoints have `-offchain` suffix
- Old endpoints remain functional
- Frontend automatically falls back to old endpoints
- No breaking changes for existing players
- Database migration is safe (additive only)

## Support

If issues arise:
1. Check Railway logs for backend errors
2. Check Vercel logs for frontend errors
3. Verify database connection
4. Verify environment variables
5. Test endpoints directly with Postman/curl
