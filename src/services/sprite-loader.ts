/**
 * Sprite loader service
 * Fetches sprite files from frontend URL with filesystem fallback
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// Cache sprite buffers in memory
const spriteCache = new Map<string, Buffer>();

/**
 * Load sprite file from frontend URL or filesystem fallback
 */
export async function loadSpriteFile(filename: string): Promise<Buffer> {
  // Check cache first
  if (spriteCache.has(filename)) {
    return spriteCache.get(filename)!;
  }

  // Try filesystem first (more reliable than URL fetch)
  // Try multiple possible paths (dev vs production)
  const possiblePaths = [
    // Production: from dist/services/ -> dist/../public/
    path.join(__dirname, '../../public/assets/sprites/playablecharacters/baseplayer', filename),
    // Alternative: from dist/services/ -> public/ (if public is at root)
    path.join(__dirname, '../../../public/assets/sprites/playablecharacters/baseplayer', filename),
    // Development: from src/services/ -> src/../public/
    path.join(process.cwd(), 'public/assets/sprites/playablecharacters/baseplayer', filename),
    // Railway/absolute path fallback
    path.join(process.cwd(), 'dist/public/assets/sprites/playablecharacters/baseplayer', filename),
  ];

  for (const localPath of possiblePaths) {
    try {
      if (fs.existsSync(localPath)) {
        const buffer = fs.readFileSync(localPath);
        spriteCache.set(filename, buffer);
        console.log(`[SpriteLoader] Loaded ${filename} from filesystem: ${localPath}`);
        return buffer;
      }
    } catch (fsError) {
      // Continue to next path
      continue;
    }
  }
  
  console.warn(`[SpriteLoader] Could not find ${filename} in filesystem. Tried paths:`, possiblePaths);

  // Fallback to URL fetch (only if filesystem fails)
  const frontendUrl = (process.env.FRONTEND_BASE_URL || process.env.VITE_PUBLIC_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || '').replace(/\/$/, '');
  
  // Skip URL fetch if it's the old Vercel URL
  if (frontendUrl && frontendUrl.includes('vercel.app')) {
    console.warn(`[SpriteLoader] Skipping Vercel URL: ${frontendUrl}`);
    throw new Error(`Failed to load sprite file: ${filename}. FRONTEND_BASE_URL points to old Vercel deployment. Please configure FRONTEND_BASE_URL to point to your new frontend deployment.`);
  }
  
  // If no frontend URL configured, provide helpful error
  if (!frontendUrl) {
    console.error(`[SpriteLoader] No FRONTEND_BASE_URL configured. Please set FRONTEND_BASE_URL environment variable to your frontend deployment URL (e.g., https://yourdomain.com)`);
    throw new Error(`Failed to load sprite file: ${filename}. No FRONTEND_BASE_URL configured and filesystem path not found. Please set FRONTEND_BASE_URL environment variable.`);
  }
  
  const spriteUrl = `${frontendUrl}/assets/sprites/playablecharacters/baseplayer/${filename}`;
  console.log(`[SpriteLoader] Attempting to fetch sprite from: ${spriteUrl}`);

  try {
    // Try fetching from frontend URL
    const buffer = await fetchSpriteFromUrl(spriteUrl);
    spriteCache.set(filename, buffer);
    console.log(`[SpriteLoader] Successfully loaded ${filename} from ${spriteUrl}`);
    return buffer;
  } catch (error) {
    console.error(`[SpriteLoader] Failed to fetch ${filename} from URL: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`Failed to load sprite file: ${filename}. Tried filesystem and URL (${spriteUrl}). Please ensure FRONTEND_BASE_URL is correct and the frontend is accessible.`);
  }
}

/**
 * Fetch sprite from URL (follows redirects)
 */
function fetchSpriteFromUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const makeRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      client.get(requestUrl, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          const location = res.headers.location;
          if (!location) {
            reject(new Error(`HTTP ${res.statusCode}: No location header`));
            return;
          }
          // Handle relative redirects
          const redirectUrl = location.startsWith('http') ? location : new URL(location, requestUrl).toString();
          makeRequest(redirectUrl, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
        res.on('error', (err) => reject(err));
      }).on('error', (err) => {
        reject(err);
      });
    };

    makeRequest(url);
  });
}

/**
 * Clear sprite cache (useful for testing or reloading)
 */
export function clearSpriteCache(): void {
  spriteCache.clear();
}

