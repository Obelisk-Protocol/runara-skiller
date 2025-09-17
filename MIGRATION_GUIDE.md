# cNFT Metadata Migration Guide

## 🎯 Overview

This guide explains how to migrate existing cNFTs to the new 18-skill format with full names instead of abbreviations.

## 🚀 Quick Start

### 1. Build the Project
```bash
cd obelisk-skiller
npm run build
```

### 2. Set Environment Variables
Make sure your `.env` file has:
```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
COLLECTION_MINT=your_collection_mint_address
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Run Migration
```bash
npm run migrate-cnfts
```

## 📊 What the Migration Does

### Before (Old Format)
```json
{
  "attributes": [
    { "trait_type": "Att", "value": "15" },
    { "trait_type": "Str", "value": "12" },
    { "trait_type": "Def", "value": "8" },
    { "trait_type": "Mag", "value": "20" },
    { "trait_type": "Pro", "value": "10" },
    { "trait_type": "Vit", "value": "18" },
    { "trait_type": "Cra", "value": "5" },
    { "trait_type": "Luc", "value": "14" },
    { "trait_type": "Gat", "value": "7" }
  ]
}
```

### After (New Format)
```json
{
  "attributes": [
    // Combat Skills
    { "trait_type": "Attack", "value": "15" },
    { "trait_type": "Strength", "value": "12" },
    { "trait_type": "Defense", "value": "8" },
    { "trait_type": "Magic", "value": "20" },
    { "trait_type": "Projectiles", "value": "10" },
    { "trait_type": "Vitality", "value": "18" },
    // Gathering Skills
    { "trait_type": "Mining", "value": "1" },
    { "trait_type": "Woodcutting", "value": "1" },
    { "trait_type": "Fishing", "value": "1" },
    { "trait_type": "Farming", "value": "1" },
    { "trait_type": "Hunting", "value": "1" },
    // Crafting Skills
    { "trait_type": "Smithing", "value": "1" },
    { "trait_type": "Crafting", "value": "5" },
    { "trait_type": "Cooking", "value": "1" },
    { "trait_type": "Alchemy", "value": "1" },
    { "trait_type": "Construction", "value": "1" },
    // Unique Skills
    { "trait_type": "Luck", "value": "14" }
  ]
}
```

## 💰 Cost Breakdown

- **Gas Cost**: ~0.0001 SOL per cNFT
- **100 cNFTs**: ~0.01 SOL (~$0.20)
- **1000 cNFTs**: ~0.1 SOL (~$2.00)
- **10000 cNFTs**: ~1 SOL (~$20.00)

## 🔧 Migration Process

1. **Fetch cNFTs**: Gets all cNFTs from Supabase database
2. **Update Structure**: Ensures all 18 skills are present
3. **Update Metadata**: Calls the cNFT update function
4. **Track Progress**: Shows success/failure for each cNFT

## 📋 Prerequisites

- Node.js 18+
- Server keypair with update permissions
- Supabase access
- Solana RPC endpoint

## 🛠️ Troubleshooting

### Common Issues

**"Missing environment variables"**
- Check your `.env` file has all required variables

**"Failed to load server keypair"**
- Ensure `server-wallet.json` exists and is valid

**"Supabase error"**
- Verify your Supabase credentials and permissions

**"RPC error"**
- Check your Solana RPC endpoint is working

### Debug Mode

Add `DEBUG=true` to your environment for verbose logging:
```bash
DEBUG=true npm run migrate-cnfts
```

## 📊 Migration Results

The script will show:
- Total cNFTs found
- Success/failure count
- Error details for failed updates
- Final summary

Example output:
```
🚀 Starting cNFT metadata migration...
📦 Found 150 cNFTs to migrate

🔄 Migrating 150 cNFTs...
[1/150] ✅ Success
[2/150] ✅ Success
[3/150] ❌ Failed: RPC timeout
...

📊 Migration Summary:
✅ Successful: 148/150
❌ Failed: 2/150

🎉 Migration complete!
```

## 🔄 Rollback

If you need to rollback:
1. The old format is still supported
2. Players can still use existing cNFTs
3. No data is lost during migration

## 🎯 Next Steps

After migration:
1. Verify cNFTs display correctly on marketplaces
2. Test skill progression in-game
3. Monitor for any issues
4. Consider removing legacy abbreviation support

## 💡 Tips

- Run migration during low-traffic periods
- Monitor Solana RPC rate limits
- Keep backups of important data
- Test with a small batch first

## 🆘 Support

If you encounter issues:
1. Check the error logs
2. Verify all prerequisites
3. Test with a single cNFT first
4. Contact the development team
