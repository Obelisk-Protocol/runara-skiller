/**
 * Image storage service
 * Saves character images to Cloudflare R2 and returns public URLs
 * CRITICAL: Railway uses ephemeral filesystems, so we must use Cloudflare R2 for persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const CHARACTER_IMAGES_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'obelisk-character-images';
const CHARACTER_IMAGES_DIR = process.env.CHARACTER_IMAGES_DIR || 
  path.join(__dirname, '../../public/character-images');

/**
 * Get Cloudflare R2 S3 client
 */
function getR2Client(): S3Client | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;

  if (!accountId || !accessKeyId || !secretAccessKey) {
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
 * Ensure character images directory exists (for local fallback)
 */
function ensureDirectoryExists(): void {
  if (!fs.existsSync(CHARACTER_IMAGES_DIR)) {
    fs.mkdirSync(CHARACTER_IMAGES_DIR, { recursive: true });
  }
}

/**
 * Check if object exists in Cloudflare R2
 */
async function checkR2Exists(s3Client: S3Client, bucketName: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize character name for filename
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Save character image to Cloudflare R2
 * Uses assetId for filename to avoid issues when character name changes
 * CRITICAL: Saves to Cloudflare R2 for persistence (Railway filesystem is ephemeral)
 */
export async function saveCharacterImage(
  nameOrAssetId: string,
  buffer: Buffer,
  useAssetId: boolean = false
): Promise<string> {
  const sanitized = useAssetId 
    ? sanitizeFilename(nameOrAssetId) // AssetId is already safe, but sanitize just in case
    : sanitizeFilename(nameOrAssetId);
  const filename = `${sanitized}.png`;
  const key = `character-images/${filename}`; // Path in bucket

  const s3Client = getR2Client();
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

  // Try Cloudflare R2 first
  if (s3Client && publicUrl) {
    try {
      const command = new PutObjectCommand({
        Bucket: CHARACTER_IMAGES_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=31536000', // Cache for 1 year
      });

      await s3Client.send(command);
      const imageUrl = `${publicUrl.replace(/\/$/, '')}/${key}`;
      console.log(`✅ Saved image to Cloudflare R2: ${imageUrl}`);
      return imageUrl;
    } catch (error) {
      console.error(`❌ Error uploading to Cloudflare R2: ${error instanceof Error ? error.message : String(error)}`);
      // Fall through to local filesystem fallback
    }
  } else {
    console.warn('⚠️ Cloudflare R2 not configured, using local filesystem fallback');
  }

  // Fallback to local filesystem (for development or if R2 fails)
  try {
    ensureDirectoryExists();
    const localPath = path.join(CHARACTER_IMAGES_DIR, filename);
    fs.writeFileSync(localPath, buffer);
    console.log(`💾 Saved image to local filesystem (fallback): ${localPath}`);
    
    const backendUrl = process.env.BACKEND_BASE_URL || 
                       process.env.BACKEND_URL || 
                       process.env.NEXT_PUBLIC_BACKEND_URL ||
                       'http://localhost:8080';
    return `${backendUrl.replace(/\/$/, '')}/character-images/${filename}`;
  } catch (error) {
    console.error(`❌ Error saving image to local filesystem: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`Failed to save character image: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get character image URL if it exists in Cloudflare R2
 * @deprecated Use database lookup instead (character_image_url column)
 * Kept for backward compatibility
 */
export async function getCharacterImageUrl(nameOrAssetId: string, useAssetId: boolean = false): Promise<string | null> {
  const sanitized = sanitizeFilename(nameOrAssetId);
  const filename = `${sanitized}.png`;
  const key = `character-images/${filename}`;

  const s3Client = getR2Client();
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

  // Check Cloudflare R2 first
  if (s3Client && publicUrl) {
    try {
      const exists = await checkR2Exists(s3Client, CHARACTER_IMAGES_BUCKET, key);
      if (exists) {
        return `${publicUrl.replace(/\/$/, '')}/${key}`;
      }
    } catch (error) {
      console.error(`❌ Error checking Cloudflare R2: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Fallback to local filesystem check
  ensureDirectoryExists();
  const localPath = path.join(CHARACTER_IMAGES_DIR, filename);
  if (fs.existsSync(localPath)) {
    const backendUrl = process.env.BACKEND_BASE_URL || 
                       process.env.BACKEND_URL || 
                       process.env.NEXT_PUBLIC_BACKEND_URL ||
                       'http://localhost:8080';
    return `${backendUrl.replace(/\/$/, '')}/character-images/${filename}`;
  }
  
  return null;
}

/**
 * Get character image file path
 */
export function getCharacterImagePath(name: string): string {
  ensureDirectoryExists();

  const sanitizedName = sanitizeFilename(name);
  const filename = `${sanitizedName}.png`;
  return path.join(CHARACTER_IMAGES_DIR, filename);
}

