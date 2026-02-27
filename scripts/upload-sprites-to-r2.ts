/**
 * Upload sprite files to Cloudflare R2
 * This ensures sprites are available in production without committing to repo
 */

import * as fs from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const SPRITE_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'obelisk-character-images';
const SPRITE_PREFIX = 'sprites/playablecharacters/baseplayer';

/**
 * Get Cloudflare R2 S3 client
 */
function getR2Client(): S3Client | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.error('❌ Cloudflare R2 credentials not configured');
    console.error('   Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY');
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: endpoint || `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Check if object exists in R2
 */
async function checkR2Exists(s3Client: S3Client, key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: SPRITE_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload sprite file to R2
 */
async function uploadSprite(s3Client: S3Client, filePath: string, filename: string): Promise<boolean> {
  const key = `${SPRITE_PREFIX}/${filename}`;
  
  // Check if already exists
  const exists = await checkR2Exists(s3Client, key);
  if (exists) {
    console.log(`   ⏭️  Skipping ${filename} (already exists in R2)`);
    return true;
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const contentType = filename.endsWith('.png') ? 'image/png' : 
                        filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' :
                        'application/octet-stream';

    const command = new PutObjectCommand({
      Bucket: SPRITE_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // Cache for 1 year
    });

    await s3Client.send(command);
    console.log(`   ✅ Uploaded: ${filename}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to upload ${filename}:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Main upload function
 */
async function main() {
  console.log('📦 Uploading sprites to Cloudflare R2...\n');

  const s3Client = getR2Client();
  if (!s3Client) {
    console.error('❌ Cannot proceed without R2 client');
    process.exit(1);
  }

  // Find sprite directory
  const spriteDir = path.join(__dirname, '../../ObeliskParadox/public/assets/sprites/playablecharacters/baseplayer');
  
  if (!fs.existsSync(spriteDir)) {
    console.error(`❌ Sprite directory not found: ${spriteDir}`);
    console.error('   Please ensure the frontend repo is accessible');
    process.exit(1);
  }

  console.log(`📁 Source directory: ${spriteDir}`);
  console.log(`🪣 R2 bucket: ${SPRITE_BUCKET}`);
  console.log(`📂 R2 prefix: ${SPRITE_PREFIX}\n`);

  // Get all sprite files
  const files = fs.readdirSync(spriteDir).filter(f => 
    f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')
  );

  if (files.length === 0) {
    console.warn('⚠️  No sprite files found');
    process.exit(0);
  }

  console.log(`📋 Found ${files.length} sprite files\n`);

  // Upload each file
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const file of files) {
    const filePath = path.join(spriteDir, file);
    const uploaded = await uploadSprite(s3Client, filePath, file);
    if (uploaded) {
      if (await checkR2Exists(s3Client, `${SPRITE_PREFIX}/${file}`)) {
        successCount++;
      } else {
        skipCount++;
      }
    } else {
      failCount++;
    }
  }

  console.log(`\n✅ Upload complete!`);
  console.log(`   Uploaded: ${successCount}`);
  console.log(`   Skipped (already exists): ${skipCount}`);
  if (failCount > 0) {
    console.log(`   Failed: ${failCount}`);
  }

  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  if (publicUrl) {
    console.log(`\n🌐 Sprites available at: ${publicUrl.replace(/\/$/, '')}/${SPRITE_PREFIX}/`);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
