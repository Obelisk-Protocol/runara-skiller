/**
 * Migrate images from Supabase Storage to Cloudflare R2
 * 
 * This script:
 * 1. Lists all images in Supabase Storage bucket "character-images"
 * 2. Downloads each image
 * 3. Uploads to Cloudflare R2 bucket "obelisk-character-images"
 * 4. Updates database URLs in nfts.character_image_url to point to Cloudflare R2
 */

import { Client as SupabaseClient, createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Client as PgClient } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../cloudflare.env') }); // Load Cloudflare env
dotenv.config(); // Also load from process.env

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  dbUpdated: number;
}

async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function uploadToR2(
  s3Client: S3Client,
  bucketName: string,
  key: string,
  buffer: Buffer,
  contentType: string = 'image/png'
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000', // Cache for 1 year
  });

  await s3Client.send(command);
  return key;
}

async function checkR2Exists(s3Client: S3Client, bucketName: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function migrateImages() {
  // Validate environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const r2AccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const r2BucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'obelisk-character-images';
  const r2PublicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  const databaseUrl = process.env.DATABASE_URL;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, and CLOUDFLARE_R2_SECRET_ACCESS_KEY must be set');
  }

  if (!r2PublicUrl) {
    throw new Error('CLOUDFLARE_R2_PUBLIC_URL must be set');
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set');
  }

  console.log('🚀 Starting image migration from Supabase to Cloudflare R2...\n');

  // Initialize clients
  const supabase = createClient(supabaseUrl, supabaseKey);
  const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });

  const pgClient = new PgClient({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  await pgClient.connect();
  console.log('✅ Connected to databases\n');

  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    dbUpdated: 0,
  };

  try {
    // Step 1: Get all Supabase image URLs from database
    console.log('📋 Getting image URLs from database...');
    const dbResult = await pgClient.query(`
      SELECT asset_id, character_image_url 
      FROM nfts 
      WHERE character_image_url IS NOT NULL 
      AND character_image_url LIKE '%supabase.co%'
      ORDER BY asset_id
    `);

    if (dbResult.rows.length === 0) {
      console.log('ℹ️  No Supabase image URLs found in database');
      return;
    }

    stats.total = dbResult.rows.length;
    console.log(`✅ Found ${dbResult.rows.length} Supabase image URLs to migrate\n`);

    // Step 2: Migrate each image
    for (const row of dbResult.rows) {
      const assetId = row.asset_id;
      const supabaseImageUrl = row.character_image_url;
      
      // Extract filename from URL (last part after last /)
      const fileName = supabaseImageUrl.split('/').pop() || `${assetId.toLowerCase()}.png`;
      const r2Key = fileName; // Keep same filename

      try {
        // Check if already exists in R2
        const existsInR2 = await checkR2Exists(s3Client, r2BucketName, r2Key);
        if (existsInR2) {
          console.log(`   ⏭️  ${fileName}: Already exists in R2, skipping upload`);
          stats.skipped++;
        } else {
          console.log(`   📥 ${fileName}: Downloading from Supabase...`);

          // Download image directly from the public URL
          const imageBuffer = await downloadImage(supabaseImageUrl);

          // Upload to R2
          console.log(`   📤 ${fileName}: Uploading to Cloudflare R2...`);
          await uploadToR2(s3Client, r2BucketName, r2Key, imageBuffer, 'image/png');

          const r2Url = `${r2PublicUrl.replace(/\/$/, '')}/${r2Key}`;
          console.log(`   ✅ ${fileName}: Migrated to ${r2Url}`);
          stats.migrated++;
        }

        // Step 3: Update database URLs
        const newR2Url = `${r2PublicUrl.replace(/\/$/, '')}/${r2Key}`;

        // Check if this asset ID exists in database and has a Supabase URL
        const dbResult = await pgClient.query(
          `SELECT asset_id, character_image_url FROM nfts WHERE asset_id = $1`,
          [assetId]
        );

        if (dbResult.rows.length > 0) {
          const currentUrl = dbResult.rows[0].character_image_url;
          // Only update if URL contains supabase.co
          if (currentUrl && currentUrl.includes('supabase.co')) {
            await pgClient.query(
              `UPDATE nfts SET character_image_url = $1 WHERE asset_id = $2`,
              [newR2Url, assetId]
            );
            console.log(`   🔄 ${assetId}: Updated database URL to Cloudflare R2`);
            stats.dbUpdated++;
          } else if (!currentUrl) {
            // If no URL, set it to R2 URL
            await pgClient.query(
              `UPDATE nfts SET character_image_url = $1 WHERE asset_id = $2`,
              [newR2Url, assetId]
            );
            console.log(`   ➕ ${assetId}: Set database URL to Cloudflare R2`);
            stats.dbUpdated++;
          } else {
            console.log(`   ℹ️  ${assetId}: URL already points to non-Supabase location, skipping update`);
          }
        } else {
          console.log(`   ⚠️  ${assetId}: Asset ID not found in database`);
        }

      } catch (err: any) {
        console.error(`   ❌ ${fileName}: Error - ${err.message}`);
        stats.errors++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total images: ${stats.total}`);
    console.log(`Migrated: ${stats.migrated}`);
    console.log(`Skipped (already exists): ${stats.skipped}`);
    console.log(`Database URLs updated: ${stats.dbUpdated}`);
    console.log(`Errors: ${stats.errors}`);
    console.log('='.repeat(60));

    if (stats.errors === 0) {
      console.log('\n✅ Image migration completed successfully!');
    } else {
      console.log('\n⚠️  Migration completed with errors. Please review the output above.');
    }

  } finally {
    await pgClient.end();
  }
}

// Run migration
migrateImages().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
