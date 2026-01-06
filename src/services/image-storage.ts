/**
 * Image storage service
 * Saves character images to Supabase Storage and returns public URLs
 * CRITICAL: Railway uses ephemeral filesystems, so we must use Supabase Storage for persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from '../config/database';

const CHARACTER_IMAGES_BUCKET = 'character-images';
const CHARACTER_IMAGES_DIR = process.env.CHARACTER_IMAGES_DIR || 
  path.join(__dirname, '../../public/character-images');

/**
 * Ensure character images directory exists (for local fallback)
 */
function ensureDirectoryExists(): void {
  if (!fs.existsSync(CHARACTER_IMAGES_DIR)) {
    fs.mkdirSync(CHARACTER_IMAGES_DIR, { recursive: true });
  }
}

/**
 * Ensure Supabase Storage bucket exists and is public
 */
async function ensureBucketExists(): Promise<void> {
  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.warn(`⚠️ Failed to list buckets: ${listError.message}`);
      return;
    }

    const bucketExists = buckets?.some(b => b.name === CHARACTER_IMAGES_BUCKET);
    
    if (!bucketExists) {
      // Create bucket if it doesn't exist
      const { error: createError } = await supabase.storage.createBucket(CHARACTER_IMAGES_BUCKET, {
        public: true, // Make bucket public so images can be accessed directly
        fileSizeLimit: 5242880, // 5MB max file size
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp']
      });
      
      if (createError) {
        console.warn(`⚠️ Failed to create bucket ${CHARACTER_IMAGES_BUCKET}: ${createError.message}`);
      } else {
        console.log(`✅ Created Supabase Storage bucket: ${CHARACTER_IMAGES_BUCKET}`);
      }
    }
  } catch (error) {
    console.warn(`⚠️ Error ensuring bucket exists: ${error instanceof Error ? error.message : String(error)}`);
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
 * Save character image to Supabase Storage
 * Uses assetId for filename to avoid issues when character name changes
 * CRITICAL: Saves to Supabase Storage for persistence (Railway filesystem is ephemeral)
 */
export async function saveCharacterImage(
  nameOrAssetId: string,
  buffer: Buffer,
  useAssetId: boolean = false
): Promise<string> {
  // Ensure bucket exists
  await ensureBucketExists();

  // If useAssetId is true, use assetId directly (sanitized)
  // Otherwise, use name (for backward compatibility)
  const sanitized = useAssetId 
    ? sanitizeFilename(nameOrAssetId) // AssetId is already safe, but sanitize just in case
    : sanitizeFilename(nameOrAssetId);
  const filename = `${sanitized}.png`;
  const filePath = `${filename}`; // Path in bucket (just filename for now)

  try {
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(CHARACTER_IMAGES_BUCKET)
      .upload(filePath, buffer, {
        contentType: 'image/png',
        upsert: true, // Overwrite if exists
        cacheControl: '3600', // Cache for 1 hour
      });

    if (error) {
      console.error(`❌ Failed to upload image to Supabase Storage: ${error.message}`);
      // Fallback to local filesystem for development
      ensureDirectoryExists();
      const localPath = path.join(CHARACTER_IMAGES_DIR, filename);
      fs.writeFileSync(localPath, buffer);
      console.log(`💾 Fallback: Saved image to local filesystem: ${localPath}`);
      
      const backendUrl = process.env.BACKEND_BASE_URL || 
                         process.env.BACKEND_URL || 
                         process.env.NEXT_PUBLIC_BACKEND_URL ||
                         'http://localhost:8080';
      return `${backendUrl.replace(/\/$/, '')}/character-images/${filename}`;
    }

    // Get public URL from Supabase Storage
    const { data: urlData } = supabase.storage
      .from(CHARACTER_IMAGES_BUCKET)
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;
    console.log(`✅ Uploaded image to Supabase Storage: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    console.error(`❌ Error saving image to Supabase Storage: ${error instanceof Error ? error.message : String(error)}`);
    // Fallback to local filesystem
    ensureDirectoryExists();
    const localPath = path.join(CHARACTER_IMAGES_DIR, filename);
    fs.writeFileSync(localPath, buffer);
    console.log(`💾 Fallback: Saved image to local filesystem: ${localPath}`);
    
    const backendUrl = process.env.BACKEND_BASE_URL || 
                       process.env.BACKEND_URL || 
                       process.env.NEXT_PUBLIC_BACKEND_URL ||
                       'http://localhost:8080';
    return `${backendUrl.replace(/\/$/, '')}/character-images/${filename}`;
  }
}

/**
 * Get character image URL if it exists in Supabase Storage
 * @deprecated Use database lookup instead (character_image_url column)
 * Kept for backward compatibility
 */
export async function getCharacterImageUrl(nameOrAssetId: string, useAssetId: boolean = false): Promise<string | null> {
  const sanitized = sanitizeFilename(nameOrAssetId);
  const filename = `${sanitized}.png`;
  const filePath = `${filename}`; // Path in bucket

  try {
    // Check if file exists in Supabase Storage
    const { data, error } = await supabase.storage
      .from(CHARACTER_IMAGES_BUCKET)
      .list('', {
        limit: 1000, // List files to check if exists
      });

    if (error) {
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

    // Check if file exists in the list
    const fileExists = data?.some(file => file.name === filename);
    
    if (fileExists) {
      // Get public URL
      const { data: urlData } = supabase.storage
        .from(CHARACTER_IMAGES_BUCKET)
        .getPublicUrl(filePath);
      
      return urlData.publicUrl;
    }

    // Fallback: Check local filesystem
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
  } catch (error) {
    console.warn(`⚠️ Error checking for image in Supabase Storage: ${error instanceof Error ? error.message : String(error)}`);
    // Fallback to local filesystem
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

