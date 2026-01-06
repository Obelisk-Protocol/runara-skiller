# Dynamic NFT Image Generation System

## Overview

This document outlines the system for dynamically generating PNG images of characters (torso + head) and updating NFT metadata to reflect the character's current appearance. As players level up, change equipment, and customize their characters, their NFT image will automatically update to match.

## Goals

1. ✅ **Generate character portraits**: Create PNG images showing character torso + head (800×800px PFP style)
2. ⏳ **Dynamic updates**: Automatically regenerate images when character changes (level up, equipment, customization)
3. ⏳ **NFT integration**: Update cNFT metadata `image` field with generated image URL
4. ✅ **Local hosting**: Store images on our server (no Arweave dependency for images)
5. ⏳ **Performance**: Fast generation (< 1 second) with caching (caching not yet implemented)

---

## Current Sprite System

### Sprite Structure

**Location**: `ObeliskParadox/public/assets/sprites/playablecharacters/baseplayer/`

**Files**:
- `idle.png` - Base character idle animation (448x898, 8 rows × 4 columns)
- `idlearmor.png` - Outfit/armor layer for idle (448x898, 8 rows × 4 columns)
- `walk.png` - Walking animation (672x896, 8 rows × 6 columns)
- `walkarmor.png` - Outfit/armor layer for walk
- `run.png` - Running animation (672x448, 4 rows × 6 columns)
- `runarmor.png` - Outfit/armor layer for run
- `punch.png` - Attack animation
- `sowrd.png` - Sword attack animation

**Frame Dimensions**: 112×112 pixels per frame

**Direction Mapping** (for idle):
- Row 0: Up (backward)
- Row 1: Left
- Row 2: Right
- Row 3: Down (forward) ← **Use this for NFT portrait**

**Current Customization**:
- Outfit selection (via `idlearmor.png` or other armor files)
- Hair (coming soon)
- Eyes (coming soon)

**Equipment Slots** (from codebase):
- `weapon` - Weapon equipped
- `armor` - Chest armor
- `helmet` - Head armor
- `boots` - Foot armor
- `gloves` - Hand armor
- `accessory` - Accessory items

---

## Technical Architecture

### Components

```
obelisk-skiller/
├── src/
│   ├── services/
│   │   ├── character-image-generator.ts  (NEW - Core image generation)
│   │   ├── sprite-loader.ts              (NEW - Load sprite files)
│   │   └── image-storage.ts               (NEW - Save/retrieve images)
│   ├── routes/
│   │   └── characters.ts                  (ADD - Image generation endpoint)
│   └── config/
│       └── sprite-paths.ts               (NEW - Sprite file path mapping)
├── public/
│   └── character-images/                 (NEW - Generated PNG files)
└── package.json                          (ADD - sharp dependency)
```

### Data Flow (Current Implementation)

```
Character Customization Data
    ↓
Generate Image Service ✅
    ├── Load base sprite (idle.png) from URL/FS
    ├── Load outfit layer (idlearmor.png) from URL/FS
    ├── Extract frame (row 3, col 0 = idle down, 112×112px)
    ├── Composite layers (base → outfit) at native size
    ├── Convert composite to buffer (ensures layers merged)
    ├── Scale to 1600×1600
    ├── Extract top 60% (1600×960) for head + torso
    ├── Scale to 1200×1200
    ├── Extract 800×800 from position (200, 400) for PFP positioning
    ├── Load optional background (scaled to 800×800)
    └── Composite character on background
    ↓
Save Image Service ✅
    ├── Save PNG to filesystem (public/character-images/)
    └── Return public URL (/character-images/{name}.png)
    ↓
Update NFT Metadata ⏳ (TODO)
    ├── Update cNFT metadata.image field
    └── Store image URL in database
```

---

## Tools & Dependencies

### Recommended: Sharp

**Package**: `sharp` (v0.33.0+)

**Why Sharp?**
- ✅ **Fast**: Native C++ bindings, very performant
- ✅ **Efficient**: Low memory usage, optimized for server environments
- ✅ **Compositing**: Excellent layer compositing support
- ✅ **Scaling**: High-quality nearest-neighbor scaling (pixel-perfect)
- ✅ **Production-ready**: Used by major companies, well-maintained
- ✅ **Serverless-friendly**: Works in Railway, Vercel, AWS Lambda

**Installation**:
```bash
npm install sharp
```

**Alternative: node-canvas**
- Full Canvas API compatibility
- Heavier (requires native dependencies)
- Better for complex drawing operations
- Not recommended for this use case

### Image Storage Options

**Option 1: Local Filesystem** (MVP)
- Store in `public/character-images/`
- Serve via Express static middleware
- Simple, works for MVP
- **Limitation**: Not scalable, lost on server restart (unless persisted)

**Option 2: Cloud Storage** (Production)
- AWS S3, Cloudflare R2, or similar
- Scalable, persistent, CDN-ready
- Requires cloud storage setup

**Option 3: Database** (Not recommended)
- Store as base64 in database
- Inefficient for large images
- Not recommended

---

## MVP Implementation Plan

### Phase 1: Prove PNG Generation Works ✅ COMPLETE

**Goal**: Generate a single PNG image from sprite files without any integration.

**Status**: ✅ **COMPLETE** - MVP proven and working

**Scope**:
1. ✅ Install Sharp
2. ✅ Create sprite loader service (load sprite files from filesystem or URL)
3. ✅ Create image generator service (composite base + outfit, extract frame, scale, position)
4. ✅ Create image storage service (save PNG files, return URLs)
5. ✅ Create test script to generate one image
6. ✅ Add static file serving for character images
7. ✅ Add optional background support
8. ✅ Verify output PNG is correct

**Deliverables**:
- ✅ Working PNG generation from sprites
- ✅ Test script that outputs a sample character image (`npm run test:image-gen`)
- ✅ Documentation of sprite file paths and frame extraction (`.cursor/rules/09-sprite-framing-scaling.mdc`)
- ✅ Background image support (optional)

**Implementation Details**:
- **Output**: 800×800px PNG
- **Process**: 
  1. Extract frame (112×112) from idle spritesheet (row 3, col 0)
  2. Composite base + outfit layers
  3. Scale to 1600×1600
  4. Extract top 60% (1600×960) for head + torso
  5. Scale to 1200×1200
  6. Extract 800×800 from position (200, 400) to position character at top
  7. Composite on optional background (scaled to 800×800)
- **Background**: Optional, loaded from `public/background/image.png`, scaled with `fit: 'cover'`
- **Positioning**: Character head positioned near top of frame (finalExtractY = 400)

**Success Criteria**: ✅ All Met
- ✅ Can generate PNG from base + outfit sprites
- ✅ Image shows character torso + head correctly
- ✅ PNG is properly formatted and viewable (800×800px)
- ✅ Background compositing works
- ✅ Image URL is accessible via HTTP

### Phase 2: Integration with Character System ✅ COMPLETE

**Goal**: Generate images based on actual character data.

**Status**: ✅ **COMPLETE** - API endpoint created and integrated with character data system

**Scope**:
1. ✅ Create API endpoint: `POST /api/characters/:assetId/generate-image`
2. ✅ Load character customization from database (profiles.character_customization)
3. ✅ Load character equipment from database (player_items) - extensible for future
4. ✅ Generate image with real character data
5. ✅ Save image to filesystem (image-storage.ts already implemented)
6. ✅ Return image URL (image-storage.ts already implemented)

**Deliverables**:
- ✅ API endpoint: `POST /api/characters/:assetId/generate-image`
- ✅ Image saved to `public/character-images/{characterName}.png`
- ✅ Image URL returned in response
- ✅ Integration with existing character data system
- ✅ Character data loader service (`character-data-loader.ts`)
- ✅ Database migration for `character_customization` column

**Current State**:
- ✅ Image generation service ready (`character-image-generator.ts`)
- ✅ Image storage service ready (`image-storage.ts`)
- ✅ Sprite loader ready (`sprite-loader.ts`)
- ✅ API endpoint created (`routes/character-images.ts`)
- ✅ Database integration added (`character-data-loader.ts`)

### Phase 3: NFT Metadata Integration ✅ COMPLETE

**Goal**: Update NFT metadata with generated image.

**Status**: ✅ **COMPLETE** - NFT metadata update integrated with image generation

**Scope**:
1. ✅ Update cNFT metadata.image field with generated image URL
2. ✅ Store image URL in database (nfts table)
3. ✅ Handle errors gracefully
4. ✅ Uses existing retry logic in `updateCharacterCNFT`

**Deliverables**:
- ✅ NFT metadata updated with new image URL
- ✅ Image URL stored in database (nfts.character_image_url)
- ✅ Image persists across server restarts
- ✅ Error handling for failed generations
- ✅ Uses existing retry mechanism in `updateCharacterCNFT`

**Integration Points**:
- ✅ Updated `updateCharacterCNFT` function in `cnft.ts` to accept optional `imageUrl` parameter
- ✅ Update metadata.image field with generated image URL
- ✅ Store URL in database (nfts.character_image_url) for quick lookup
- ✅ Database migration created for `character_image_url` column

### Phase 4: Automatic Updates ⏳ PENDING

**Goal**: Automatically regenerate images when character changes.

**Status**: ⏳ **PENDING** - Depends on Phase 2 & 3 completion

**Scope**:
1. ⏳ Hook into character level-up events
2. ⏳ Hook into equipment change events
3. ⏳ Hook into customization change events
4. ⏳ Add caching to avoid unnecessary regenerations
5. ⏳ Queue system for batch updates (optional)

**Deliverables**:
- Images auto-update on character changes
- Efficient regeneration (only when needed)
- Caching system to prevent duplicate generations
- Background job system (optional)

**Implementation Strategy**:
- Add hooks in character update functions
- Check if character state changed before regenerating
- Use hash of character state (stats + customization + equipment) for cache key
- Queue regeneration jobs for non-critical updates

---

## MVP Implementation Details

### Step 1: Setup Dependencies

```bash
cd obelisk-skiller
npm install sharp
npm install --save-dev @types/sharp
```

### Step 2: Create Sprite Loader Service

**File**: `obelisk-skiller/src/services/sprite-loader.ts`

```typescript
import sharp from 'sharp'
import path from 'path'
import fs from 'fs/promises'

/**
 * Sprite file paths configuration
 */
const SPRITE_BASE_PATH = process.env.SPRITE_BASE_PATH || 
  path.join(__dirname, '../../../../ObeliskParadox/public/assets/sprites/playablecharacters/baseplayer')

/**
 * Load sprite file from filesystem or URL
 */
export async function loadSpriteFile(filename: string): Promise<Buffer> {
  const filepath = path.join(SPRITE_BASE_PATH, filename)
  
  // Check if file exists
  try {
    await fs.access(filepath)
    return await fs.readFile(filepath)
  } catch (error) {
    // Fallback: try loading from URL (if sprites are served from frontend)
    const frontendUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:3000'
    const url = `${frontendUrl}/assets/sprites/playablecharacters/baseplayer/${filename}`
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load sprite: ${filename}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}

/**
 * Get sprite path for a specific animation and layer
 */
export function getSpritePath(animation: 'idle' | 'walk' | 'run', layer: 'base' | 'armor'): string {
  const filename = layer === 'base' 
    ? `${animation}.png`
    : `${animation}armor.png`
  return path.join(SPRITE_BASE_PATH, filename)
}
```

### Step 3: Create Image Generator Service

**File**: `obelisk-skiller/src/services/character-image-generator.ts`

```typescript
import sharp from 'sharp'
import { loadSpriteFile } from './sprite-loader'
import type { CharacterStats } from '../types/character'
import type { CharacterCustomization } from '../types/character'

export interface CharacterImageOptions {
  characterStats: CharacterStats
  customization: CharacterCustomization
  equippedGear?: {
    helmet?: string
    armor?: string
    weapon?: string
    boots?: string
    gloves?: string
    accessory?: string
  }
  outputSize?: { width: number; height: number }
  cropToTorso?: boolean
  frameIndex?: number // Which frame to use (0-3 for idle)
}

/**
 * Generate character portrait PNG (torso + head)
 */
export async function generateCharacterImage(
  options: CharacterImageOptions
): Promise<Buffer> {
  const {
    characterStats,
    customization,
    equippedGear = {},
    outputSize = { width: 448, height: 268 }, // 4x scale, cropped to torso
    cropToTorso = true,
    frameIndex = 0
  } = options

  // Frame dimensions
  const frameWidth = 112
  const frameHeight = 112
  
  // Idle animation: row 3 = down direction (front-facing for portrait)
  const row = 3
  const col = Math.min(frameIndex, 3) // Clamp to valid frame
  
  const srcX = col * frameWidth
  const srcY = row * frameHeight

  // 1. Load base sprite
  const baseSpriteBuffer = await loadSpriteFile('idle.png')
  let composite = sharp(baseSpriteBuffer)
    .extract({ 
      left: srcX, 
      top: srcY, 
      width: frameWidth, 
      height: frameHeight 
    })

  // 2. Composite outfit layer
  if (customization.outfit) {
    try {
      const outfitPath = customization.outfit === 'default' 
        ? 'idlearmor.png'
        : `idlearmor_${customization.outfit}.png`
      
      const outfitBuffer = await loadSpriteFile(outfitPath)
      const outfitFrame = await sharp(outfitBuffer)
        .extract({ 
          left: srcX, 
          top: srcY, 
          width: frameWidth, 
          height: frameHeight 
        })
        .toBuffer()
      
      composite = composite.composite([{
        input: outfitFrame,
        blend: 'over'
      }])
    } catch (error) {
      console.warn(`Failed to load outfit sprite: ${customization.outfit}`, error)
      // Continue without outfit layer
    }
  }

  // 3. Composite equipment layers (if available)
  // TODO: Implement equipment sprite loading when equipment sprites are available
  // For now, we'll skip equipment layers in MVP

  // 4. Crop to torso + head (top 60% of frame)
  if (cropToTorso) {
    const cropHeight = Math.floor(frameHeight * 0.6) // Top 60% = ~67px
    composite = composite.extract({
      left: 0,
      top: 0,
      width: frameWidth,
      height: cropHeight
    })
  }

  // 5. Scale up with nearest-neighbor (pixel-perfect)
  const finalImage = await composite
    .resize(outputSize.width, outputSize.height, {
      kernel: 'nearest', // Pixel-perfect scaling
      withoutEnlargement: false
    })
    .png()
    .toBuffer()

  return finalImage
}
```

### Step 4: Create Image Storage Service

**File**: `obelisk-skiller/src/services/image-storage.ts`

```typescript
import fs from 'fs/promises'
import path from 'path'

const CHARACTER_IMAGES_DIR = process.env.CHARACTER_IMAGES_DIR || 
  path.join(__dirname, '../../public/character-images')

/**
 * Save character image to filesystem
 */
export async function saveCharacterImage(
  characterName: string,
  imageBuffer: Buffer
): Promise<string> {
  // Ensure directory exists
  await fs.mkdir(CHARACTER_IMAGES_DIR, { recursive: true })

  // Sanitize filename
  const sanitizedName = characterName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  
  const filename = `${sanitizedName}.png`
  const filepath = path.join(CHARACTER_IMAGES_DIR, filename)
  
  // Save image
  await fs.writeFile(filepath, imageBuffer)

  // Return public URL
  const baseUrl = process.env.IMAGE_BASE_URL || 
    process.env.BACKEND_URL || 
    'http://localhost:8080'
  
  return `${baseUrl}/character-images/${filename}`
}

/**
 * Get character image URL (if exists)
 */
export async function getCharacterImageUrl(characterName: string): Promise<string | null> {
  const sanitizedName = characterName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  
  const filename = `${sanitizedName}.png`
  const filepath = path.join(CHARACTER_IMAGES_DIR, filename)
  
  try {
    await fs.access(filepath)
    const baseUrl = process.env.IMAGE_BASE_URL || 
      process.env.BACKEND_URL || 
      'http://localhost:8080'
    return `${baseUrl}/character-images/${filename}`
  } catch {
    return null
  }
}
```

### Step 5: Create Test Script

**File**: `obelisk-skiller/scripts/test-image-generation.ts`

**Note**: This script will need access to `generateDefaultCharacterStats` from `cnft.ts` and `CharacterCustomization` type. You may need to create a simple type definition for MVP testing.

```typescript
import { generateCharacterImage } from '../src/services/character-image-generator'
import { saveCharacterImage } from '../src/services/image-storage'
import { generateDefaultCharacterStats } from '../src/services/cnft'
import fs from 'fs/promises'
import path from 'path'

// For MVP: Simple customization type (create proper type file later)
interface CharacterCustomization {
  outfit: string
  hair?: string
  eyes?: string
}

function getDefaultCustomization(): CharacterCustomization {
  return { outfit: 'default' }
}

async function testImageGeneration() {
  console.log('🧪 Testing character image generation...')
  
  // Create test character
  const characterName = 'TestCharacter'
  const characterStats = generateDefaultCharacterStats(characterName)
  const customization = getDefaultCustomization()
  
  console.log('📊 Character data:', {
    name: characterStats.name,
    outfit: customization.outfit
  })
  
  try {
    // Generate image
    console.log('🎨 Generating image...')
    const imageBuffer = await generateCharacterImage({
      characterStats,
      customization,
      cropToTorso: true,
      outputSize: { width: 448, height: 268 }
    })
    
    console.log(`✅ Image generated: ${imageBuffer.length} bytes`)
    
    // Save image
    const imageUrl = await saveCharacterImage(characterName, imageBuffer)
    console.log(`💾 Image saved: ${imageUrl}`)
    
    // Also save to test output directory
    const testOutputDir = path.join(__dirname, '../test-output')
    await fs.mkdir(testOutputDir, { recursive: true })
    const testOutputPath = path.join(testOutputDir, 'test-character.png')
    await fs.writeFile(testOutputPath, imageBuffer)
    console.log(`📁 Test output saved: ${testOutputPath}`)
    
    console.log('✅ Test completed successfully!')
    console.log(`   Open ${testOutputPath} to view the generated image`)
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

testImageGeneration()
```

### Step 6: Add Static File Serving

**File**: `obelisk-skiller/src/index.ts`

Add static file serving for character images:

```typescript
import express from 'express'
import path from 'path'

// ... existing code ...

// Serve character images
const characterImagesDir = path.join(__dirname, '../public/character-images')
app.use('/character-images', express.static(characterImagesDir))
```

### Step 7: Run MVP Test

```bash
# Build TypeScript
npm run build

# Run test script
node dist/scripts/test-image-generation.js
```

---

## Full Implementation Plan

### Phase 1: MVP ✅ COMPLETE
- [x] Document system architecture
- [x] Install Sharp dependency
- [x] Create sprite loader service (`sprite-loader.ts`)
- [x] Create image generator service (`character-image-generator.ts`)
- [x] Create image storage service (`image-storage.ts`)
- [x] Create test script (`test-image-generation.ts`)
- [x] Add static file serving (`index.ts`)
- [x] Add background support (optional)
- [x] Test PNG generation
- [x] Verify output image quality
- [x] Create comprehensive documentation (`.cursor/rules/09-sprite-framing-scaling.mdc`)

### Phase 2: API Integration ✅ COMPLETE
- [x] Create API endpoint: `POST /api/characters/:assetId/generate-image`
- [x] Load character data from database (nft_skill_experience, profiles)
- [x] Load customization from database (profiles.character_customization)
- [x] Load equipment from database (player_items) - extensible for future
- [x] Generate image with real character data
- [x] Return image URL in API response
- [x] Add error handling and validation
- [x] Create character data loader service
- [x] Add database migration for character_customization column

### Phase 3: NFT Metadata Update ✅ COMPLETE
- [x] Update cNFT metadata.image field
- [x] Store image URL in database (nfts.character_image_url)
- [x] Handle update errors gracefully
- [x] Uses existing retry logic in updateCharacterCNFT
- [x] Update updateCharacterCNFT to accept optional imageUrl parameter

### Phase 4: Automatic Updates
- [ ] Hook into character level-up events
- [ ] Hook into equipment change events
- [ ] Hook into customization change events
- [ ] Add background job queue (optional)
- [ ] Add caching to avoid unnecessary regenerations

### Phase 5: Equipment Sprites
- [ ] Create equipment sprite mapping
- [ ] Load equipment sprite layers
- [ ] Composite equipment on character
- [ ] Handle missing equipment sprites gracefully

### Phase 6: Optimization
- [ ] Add image caching (regenerate only when needed)
- [ ] Optimize PNG compression
- [ ] Add CDN support for image serving
- [ ] Add batch generation for multiple characters

---

## Testing Strategy

### MVP Testing

1. **Unit Test: Sprite Loading**
   - Test loading sprite files from filesystem
   - Test loading sprite files from URL (fallback)
   - Test error handling for missing files

2. **Unit Test: Frame Extraction**
   - Test extracting correct frame from spritesheet
   - Test frame coordinates (row 3, col 0 for idle down)
   - Verify extracted frame dimensions (112×112)

3. **Unit Test: Image Compositing**
   - Test compositing base + outfit layers
   - Test layer ordering (base → outfit → equipment)
   - Test blend modes

4. **Unit Test: Cropping**
   - Test cropping to torso + head (top 60%)
   - Verify crop dimensions (~67px height)
   - Test with different frame sizes

5. **Unit Test: Scaling**
   - Test nearest-neighbor scaling
   - Verify pixel-perfect output
   - Test different output sizes

6. **Integration Test: Full Pipeline**
   - Test end-to-end: load → composite → crop → scale → save
   - Verify output PNG is valid
   - Verify image URL is accessible

### Manual Testing

1. **Visual Verification**
   - Generate test image
   - Open PNG in image viewer
   - Verify character appears correctly
   - Verify torso + head are visible
   - Verify outfit layer is applied

2. **Performance Testing**
   - Measure generation time (< 1 second target)
   - Test with multiple characters
   - Test concurrent generations

3. **Error Handling**
   - Test with missing sprite files
   - Test with invalid character data
   - Test with missing customization
   - Verify graceful error handling

---

## Sprite File Access Strategy

### Option 1: Copy Sprites to Backend (Recommended for MVP)

**Pros**:
- ✅ Reliable (no network dependency)
- ✅ Fast (local filesystem access)
- ✅ Works offline

**Cons**:
- ❌ Requires file sync between frontend and backend
- ❌ Duplicates sprite files

**Implementation**:
```bash
# Copy sprites to backend
cp -r ObeliskParadox/public/assets/sprites obelisk-skiller/public/sprites
```

### Option 2: Fetch from Frontend URL

**Pros**:
- ✅ Single source of truth
- ✅ No file duplication

**Cons**:
- ❌ Requires frontend to be accessible
- ❌ Network dependency
- ❌ Slower than local files

**Implementation**:
```typescript
const frontendUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:3000'
const spriteUrl = `${frontendUrl}/assets/sprites/playablecharacters/baseplayer/idle.png`
const response = await fetch(spriteUrl)
```

### Option 3: CDN/Cloud Storage (Production)

**Pros**:
- ✅ Scalable
- ✅ Fast (CDN)
- ✅ Reliable

**Cons**:
- ❌ Requires cloud storage setup
- ❌ Additional cost

**Recommendation**: Use Option 1 for MVP, migrate to Option 3 for production.

---

## Environment Variables

Add to `obelisk-skiller/.env`:

```bash
# Sprite file paths
SPRITE_BASE_PATH=/path/to/sprites  # Optional, defaults to relative path
FRONTEND_BASE_URL=https://obelisk-paradox.vercel.app  # For sprite URL fallback

# Image storage
CHARACTER_IMAGES_DIR=./public/character-images  # Local storage path
IMAGE_BASE_URL=https://obelisk-skiller-production.up.railway.app  # Public image URL

# Backend URL (for image URLs)
BACKEND_URL=https://obelisk-skiller-production.up.railway.app
```

---

## API Endpoints

### `POST /api/characters/:assetId/generate-image`

**Purpose**: Generate character portrait image and update NFT metadata

**Request**:
```json
{
  "forceRegenerate": false  // Optional: force regeneration even if image exists
}
```

**Response**:
```json
{
  "success": true,
  "imageUrl": "https://obelisk-skiller-production.up.railway.app/character-images/testcharacter.png",
  "message": "Character image generated and NFT updated"
}
```

**Errors**:
- `404`: Character not found
- `500`: Image generation failed
- `500`: NFT update failed

---

## Database Schema Updates

### Add Image URL to Profiles

```sql
ALTER TABLE profiles 
ADD COLUMN character_image_url TEXT;

-- Index for quick lookups
CREATE INDEX idx_profiles_character_image_url ON profiles(character_image_url) 
WHERE character_image_url IS NOT NULL;
```

### Add Image URL to NFTs Table

```sql
ALTER TABLE nfts 
ADD COLUMN image_url TEXT;

-- Index for quick lookups
CREATE INDEX idx_nfts_image_url ON nfts(image_url) 
WHERE image_url IS NOT NULL;
```

---

## Performance Considerations

### Caching Strategy

1. **Image Cache**: Don't regenerate if character hasn't changed
   - Store hash of character state (stats + customization + equipment)
   - Compare hash before regenerating
   - Return existing image if hash matches

2. **Sprite Cache**: Cache loaded sprite buffers in memory
   - Load sprites once, reuse for multiple characters
   - Clear cache on server restart

3. **CDN Caching**: Use CDN for generated images
   - Set appropriate cache headers
   - Invalidate cache on image update

### Optimization Tips

1. **Batch Processing**: Generate images for multiple characters in parallel
2. **Lazy Generation**: Only generate when requested (not on every update)
3. **Background Jobs**: Queue image generation for non-critical updates
4. **Image Compression**: Optimize PNG size without quality loss

---

## Error Handling

### Sprite Loading Errors

- **Missing sprite file**: Log warning, use base sprite only
- **Invalid sprite format**: Log error, return error response
- **Network error (URL fetch)**: Retry with exponential backoff

### Image Generation Errors

- **Compositing failure**: Log error, return error response
- **Invalid character data**: Validate input, return 400 error
- **Storage failure**: Log error, return 500 error

### NFT Update Errors

- **Update failure**: Log error, return error response
- **Transaction timeout**: Retry with exponential backoff
- **Network error**: Retry up to 3 times

---

## Future Enhancements

1. **Animated GIFs**: Generate animated character portraits
2. **Multiple Poses**: Generate images in different poses (idle, attack, etc.)
3. **Backgrounds**: Add custom backgrounds to character portraits
4. **Effects**: Add visual effects (glow, particles, etc.)
5. **Batch Generation**: Generate images for all characters at once
6. **Image Variants**: Generate different sizes/formats (thumbnail, full-size, etc.)

---

## Success Metrics

### MVP Success Criteria

- ✅ Can generate PNG from sprite files
- ✅ Image shows character torso + head correctly
- ✅ PNG is properly formatted and viewable
- ✅ Generation time < 1 second
- ✅ Image is saved to filesystem
- ✅ Image URL is accessible via HTTP

### Full Implementation Success Criteria

- ✅ Images auto-update on character changes
- ✅ NFT metadata reflects current character appearance
- ✅ Generation time < 1 second (cached)
- ✅ 99%+ success rate for image generation
- ✅ Images persist across server restarts
- ✅ System handles errors gracefully

---

## Next Steps

1. **Review this document** with team
2. **Install Sharp**: `npm install sharp`
3. **Create MVP services**: Sprite loader, image generator, image storage
4. **Create test script**: Generate one test image
5. **Run MVP test**: Verify PNG generation works
6. **Iterate**: Fix issues, improve quality
7. **Integrate**: Add API endpoint and NFT update logic
8. **Deploy**: Test in production environment

---

## Questions & Decisions Needed

1. **Sprite file access**: Copy to backend or fetch from frontend URL?
2. **Image storage**: Local filesystem (MVP) or cloud storage (production)?
3. **Update frequency**: Generate on every change or batch updates?
4. **Equipment sprites**: When will equipment sprite files be available?
5. **Image size**: What dimensions for NFT image? (448×268 suggested)
6. **Caching**: How aggressive should caching be?

---

## References

- [Sharp Documentation](https://sharp.pixelplumbing.com/)
- [Node Canvas Documentation](https://github.com/Automattic/node-canvas)
- Current sprite system: `ObeliskParadox/src/game/utils/SpriteCompositor.ts`
- Character preview: `ObeliskParadox/src/lib/character-preview.ts`
- Character customization: `ObeliskParadox/src/lib/character-customization.ts`

---

## Quick Reference: MVP Implementation Checklist

### Setup
- [ ] Install Sharp: `npm install sharp`
- [ ] Create `src/services/sprite-loader.ts`
- [ ] Create `src/services/character-image-generator.ts`
- [ ] Create `src/services/image-storage.ts`
- [ ] Create `scripts/test-image-generation.ts`
- [ ] Add static file serving in `src/index.ts`
- [ ] Create `public/character-images/` directory

### Type Definitions Needed

**Note**: `CharacterCustomization` type needs to be available in backend. Options:
1. Copy type definition to `obelisk-skiller/src/types/character-customization.ts`
2. Or create shared types package
3. Or import from frontend (not recommended)

**Create**: `obelisk-skiller/src/types/character-customization.ts`
```typescript
export interface CharacterCustomization {
  outfit: string
  hair?: string
  eyes?: string
}

export interface OutfitOption {
  id: string
  name: string
  armorPath: string
}

export const OUTFIT_OPTIONS: OutfitOption[] = [
  {
    id: 'default',
    name: 'Default Outfit',
    armorPath: 'idlearmor.png',
  },
]

export function getOutfitOption(outfitId: string): OutfitOption | undefined {
  return OUTFIT_OPTIONS.find((outfit) => outfit.id === outfitId)
}

export function getDefaultCustomization(): CharacterCustomization {
  return { outfit: 'default' }
}
```

### ✅ Testing MVP (COMPLETE)

1. **Run test script**:
   ```bash
   npm run test:image-gen
   # or
   npm run build
   node dist/scripts/test-image-generation.js
   ```

2. **Verify output** ✅:
   - ✅ `test-output/test-character.png` exists
   - ✅ Image shows character torso + head (800×800px)
   - ✅ Outfit layer is applied correctly
   - ✅ Image is properly scaled and positioned
   - ✅ Background compositing works (if enabled)
   - ✅ Character head positioned near top of frame

3. **Check image URL** ✅:
   - Start server: `npm run dev`
   - Visit: `http://localhost:3000/character-images/testcharacter.png`
   - ✅ Image loads correctly via HTTP

**Current Test Results**:
- ✅ Image generation: Working
- ✅ Dimensions: 800×800px
- ✅ Format: PNG
- ✅ File size: ~14KB (without background), ~663KB (with background)
- ✅ Generation time: < 1 second
- ✅ Character positioning: Head near top, properly scaled

### Common Issues & Solutions

**Issue**: Sprite files not found
- **Solution**: Check `SPRITE_BASE_PATH` environment variable
- **Solution**: Verify sprite files exist in expected location
- **Solution**: Try fallback to frontend URL

**Issue**: Image generation fails
- **Solution**: Check Sharp is installed correctly
- **Solution**: Verify sprite file format (must be PNG)
- **Solution**: Check frame coordinates are correct

**Issue**: Image looks wrong
- **Solution**: Verify frame extraction (row 3, col 0 for idle down)
- **Solution**: Check crop dimensions (top 60% = ~67px)
- **Solution**: Verify scaling uses 'nearest' kernel

**Issue**: Image URL not accessible
- **Solution**: Check static file serving is configured
- **Solution**: Verify `CHARACTER_IMAGES_DIR` path is correct
- **Solution**: Check file permissions

