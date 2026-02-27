#!/usr/bin/env ts-node
/**
 * Update an existing NFT to use the zoomed PFP image and push metadata on-chain.
 * Usage: npx ts-node scripts/update-existing-nft-image.ts <assetId>
 *
 * Example (from Solscan token page):
 *   npx ts-node scripts/update-existing-nft-image.ts 34cgHizajgRdZHQLCqX8LEwbA22dzq1UVX3vY4Rpd3dU
 *
 * Steps:
 * 1. Load character data from DB
 * 2. Generate zoomed PFP image (head + upper torso, 800×800)
 * 3. Save image to storage, update nfts.character_image_url
 * 4. Call updateCharacterCNFT to push new metadata URI on-chain
 */

import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('✅ Loaded .env from:', envPath);
} else {
  dotenv.config();
}

async function main() {
  const assetId = process.argv[2]?.trim();

  if (!assetId || assetId.length < 32) {
    console.error('❌ Usage: npx ts-node scripts/update-existing-nft-image.ts <assetId>');
    console.error('   Example: npx ts-node scripts/update-existing-nft-image.ts 34cgHizajgRdZHQLCqX8LEwbA22dzq1UVX3vY4Rpd3dU');
    process.exit(1);
  }

  console.log(`🔄 Updating NFT image for asset: ${assetId.substring(0, 12)}...`);

  const { loadCharacterImageData } = await import('../src/services/character-data-loader');
  const { generateCharacterImage } = await import('../src/services/character-image-generator');
  const { saveCharacterImage } = await import('../src/services/image-storage');
  const { updateCharacterCNFT } = await import('../src/services/cnft');
  const { NftColumns } = await import('../src/services/database');
  const { pgQuery } = await import('../src/utils/pg-helper');

  try {
    // 1. Load character data (must exist in nfts + customization)
    const characterData = await loadCharacterImageData(assetId);
    const row = await NftColumns.get(assetId);
    if (!row) {
      console.error('❌ Character not found in database for this asset_id.');
      process.exit(1);
    }

    console.log(`   Name: ${row.name}`);

    // 2. Generate zoomed PFP image
    console.log('🎨 Generating zoomed PFP image...');
    const imageBuffer = await generateCharacterImage({
      customization: characterData.customization,
      includeBackground: false,
    });
    console.log(`   Generated: ${imageBuffer.length} bytes`);

    // 3. Save to storage and update DB
    const imageUrl = await saveCharacterImage(assetId, imageBuffer, true);
    console.log(`   Saved: ${imageUrl}`);

    const { error: updateErr } = await pgQuery(
      'UPDATE nfts SET character_image_url = $1, updated_at = NOW() WHERE asset_id = $2',
      [imageUrl, assetId]
    );
    if (updateErr) {
      console.error('❌ Failed to update nfts.character_image_url:', updateErr.message);
      process.exit(1);
    }
    console.log('   Database updated.');

    // 4. Push metadata on-chain (new URI with new image)
    const characterStats = await NftColumns.columnsToStatsWithSkills(row);
    if (row.name) characterStats.name = row.name;

    const updateResult = await updateCharacterCNFT(
      assetId,
      characterStats,
      row.player_pda ?? undefined,
      imageUrl
    );

    if (updateResult.success) {
      console.log('✅ On-chain metadata updated.');
      console.log(`   Signature: ${updateResult.signature ?? 'N/A'}`);
      console.log(`   Solscan: https://solscan.io/token/${assetId}#metadata`);
    } else {
      console.error('❌ On-chain update failed:', updateResult.error);
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
