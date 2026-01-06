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

  const frontendUrl = (process.env.FRONTEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const spriteUrl = `${frontendUrl}/assets/sprites/playablecharacters/baseplayer/${filename}`;

  try {
    // Try fetching from frontend URL first
    const buffer = await fetchSpriteFromUrl(spriteUrl);
    spriteCache.set(filename, buffer);
    return buffer;
  } catch (error) {
    console.warn(`[SpriteLoader] Failed to fetch ${filename} from URL: ${error instanceof Error ? error.message : String(error)}`);
    
    // Fallback to filesystem (if sprites are copied to backend)
    try {
      const localPath = path.join(
        __dirname,
        '../../public/assets/sprites/playablecharacters/baseplayer',
        filename
      );
      
      if (fs.existsSync(localPath)) {
        const buffer = fs.readFileSync(localPath);
        spriteCache.set(filename, buffer);
        return buffer;
      }
    } catch (fsError) {
      console.warn(`[SpriteLoader] Failed to load ${filename} from filesystem: ${fsError instanceof Error ? fsError.message : String(fsError)}`);
    }

    throw new Error(`Failed to load sprite file: ${filename}. Tried URL (${spriteUrl}) and filesystem.`);
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

