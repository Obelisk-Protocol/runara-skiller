/**
 * Rebrand NFT Metadata in Database
 * 
 * Updates all nft_metadata rows to replace old brand references:
 *   - external_url: obeliskparadox.com -> runara.fun
 *   - image URLs: obelisk-paradox.vercel.app -> runara.fun
 * 
 * Usage:
 *   node scripts/rebrand-nft-metadata.js [--dry-run]
 * 
 * Requirements:
 *   - DATABASE_URL or SKILLER_DATABASE_URL env var set
 *   - Or run from obelisk-skiller directory with .env loaded
 */

const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
  console.log('Loaded .env from:', envPath);
}

const OLD_PATTERNS = [
  { find: 'https://obeliskparadox.com', replace: 'https://runara.fun' },
  { find: 'https://www.obeliskparadox.com', replace: 'https://runara.fun' },
  { find: 'https://obelisk-paradox.vercel.app', replace: 'https://runara.fun' },
];

function getDbUrl() {
  return process.env.DATABASE_URL || process.env.SKILLER_DATABASE_URL || process.env.SUPABASE_DB_URL;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\n=== Rebrand NFT Metadata in Database ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  const dbUrl = getDbUrl();
  if (!dbUrl) {
    console.error('ERROR: No database URL found. Set DATABASE_URL, SKILLER_DATABASE_URL, or SUPABASE_DB_URL.');
    process.exit(1);
  }

  const needsSsl = dbUrl.includes('railway') || dbUrl.includes('supabase.co') || dbUrl.includes('amazonaws.com');
  const client = new Client({
    connectionString: dbUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Fetch all nft_metadata rows
    const result = await client.query('SELECT asset_id, metadata_json FROM nft_metadata');
    console.log(`Found ${result.rows.length} NFT metadata rows.\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of result.rows) {
      const assetId = row.asset_id;
      let metadataJson = row.metadata_json;
      
      if (!metadataJson) {
        skippedCount++;
        continue;
      }

      // Convert to string for replacement
      let jsonStr = typeof metadataJson === 'string' ? metadataJson : JSON.stringify(metadataJson);
      let changed = false;

      for (const pattern of OLD_PATTERNS) {
        if (jsonStr.includes(pattern.find)) {
          jsonStr = jsonStr.split(pattern.find).join(pattern.replace);
          changed = true;
        }
      }

      if (changed) {
        updatedCount++;
        const parsed = JSON.parse(jsonStr);
        
        if (dryRun) {
          console.log(`  [DRY RUN] Would update: ${assetId.substring(0, 12)}...`);
          console.log(`    external_url: ${parsed.external_url || 'N/A'}`);
        } else {
          await client.query(
            'UPDATE nft_metadata SET metadata_json = $1 WHERE asset_id = $2',
            [parsed, assetId]
          );
          console.log(`  Updated: ${assetId.substring(0, 12)}...`);
        }
      } else {
        skippedCount++;
      }
    }

    // 2. Also update nfts.character_image_url if it has old URLs
    console.log('\nChecking nfts.character_image_url...');
    const nftsResult = await client.query(
      "SELECT asset_id, character_image_url FROM nfts WHERE character_image_url LIKE '%obelisk%'"
    );
    
    let imageUrlUpdated = 0;
    for (const row of nftsResult.rows) {
      let url = row.character_image_url;
      let changed = false;
      
      for (const pattern of OLD_PATTERNS) {
        if (url && url.includes(pattern.find)) {
          url = url.split(pattern.find).join(pattern.replace);
          changed = true;
        }
      }
      
      if (changed) {
        imageUrlUpdated++;
        if (dryRun) {
          console.log(`  [DRY RUN] Would update image URL for: ${row.asset_id.substring(0, 12)}...`);
        } else {
          await client.query(
            'UPDATE nfts SET character_image_url = $1 WHERE asset_id = $2',
            [url, row.asset_id]
          );
          console.log(`  Updated image URL: ${row.asset_id.substring(0, 12)}...`);
        }
      }
    }

    console.log('\n=== Summary ===');
    console.log(`  Metadata updated: ${updatedCount}`);
    console.log(`  Metadata skipped (no changes): ${skippedCount}`);
    console.log(`  Image URLs updated: ${imageUrlUpdated}`);
    
    if (dryRun) {
      console.log('\nThis was a dry run. Run without --dry-run to apply changes.');
    } else {
      console.log('\nAll changes applied successfully.');
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
