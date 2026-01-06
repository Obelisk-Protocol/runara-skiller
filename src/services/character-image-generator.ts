/**
 * Character image generator service
 * Composites character sprites into a single PNG image
 */

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { loadSpriteFile } from './sprite-loader';
import { CharacterCustomization, getOutfitOption } from '../types/character-customization';

export interface GenerateImageOptions {
  customization: CharacterCustomization;
  includeBackground?: boolean; // Optional: include background image
}

// Sprite dimensions
// Idle spritesheet: 448×898 pixels (8 rows × 4 columns)
const FRAME_WIDTH = 112;  // 448 / 4 = 112
const FRAME_HEIGHT = 112; // 898 / 8 ≈ 112.25, use 112
const SPRITESHEET_COLUMNS = 4;
const SPRITESHEET_ROWS = 8;

// Target frame: Row 3 (down direction), Column 0 (first frame)
const TARGET_ROW = 3;
const TARGET_COL = 0;

// Final output dimensions
const OUTPUT_SIZE = 800; // 800×800 pixels

/**
 * Generate character image from sprites
 */
export async function generateCharacterImage(
  options: GenerateImageOptions
): Promise<Buffer> {
  const { customization } = options;

  try {
    // Load base sprite
    const baseSpriteBuffer = await loadSpriteFile('idle.png');
    const baseImage = sharp(baseSpriteBuffer);
    
    // Get base sprite dimensions for debugging
    const baseMetadata = await baseImage.metadata();
    console.log(`[ImageGenerator] Base sprite dimensions: ${baseMetadata.width}×${baseMetadata.height}`);

    // Calculate exact frame position
    // Idle spritesheet: 448×898 (8 rows × 4 columns)
    // Frame width: 448 / 4 = 112
    // Frame height: 898 / 8 = 112.25 (use 112)
    const frameX = TARGET_COL * FRAME_WIDTH;
    const frameY = TARGET_ROW * FRAME_HEIGHT;
    console.log(`[ImageGenerator] Extracting frame at position: x=${frameX}, y=${frameY}, size=${FRAME_WIDTH}×${FRAME_HEIGHT}`);
    
    // Extract base frame first (112×112)
    const baseFrameBuffer = await baseImage
      .extract({
        left: frameX,
        top: frameY,
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
      })
      .toBuffer();

    // Verify base frame dimensions
    const baseFrameImage = sharp(baseFrameBuffer);
    const baseFrameMetadata = await baseFrameImage.metadata();
    console.log(`[ImageGenerator] Base frame dimensions: ${baseFrameMetadata.width}×${baseFrameMetadata.height}`);

    let compositeImage = sharp(baseFrameBuffer);

    // Load and composite outfit if specified
    const outfitOption = getOutfitOption(customization.outfit);
    if (outfitOption && outfitOption.armorPath) {
      try {
        const outfitSpriteBuffer = await loadSpriteFile(outfitOption.armorPath);
        const outfitImage = sharp(outfitSpriteBuffer);
        
        // Get outfit sprite dimensions for debugging
        const outfitMetadata = await outfitImage.metadata();
        console.log(`[ImageGenerator] Outfit sprite dimensions: ${outfitMetadata.width}×${outfitMetadata.height}`);
        
        // Extract outfit frame from exact same position (112×112)
        let outfitFrameBuffer = await outfitImage
          .extract({
            left: frameX,
            top: frameY,
            width: FRAME_WIDTH,
            height: FRAME_HEIGHT,
          })
          .toBuffer();

        // Verify outfit frame dimensions
        let outfitFrameImage = sharp(outfitFrameBuffer);
        const outfitFrameMetadata = await outfitFrameImage.metadata();
        console.log(`[ImageGenerator] Outfit frame dimensions: ${outfitFrameMetadata.width}×${outfitFrameMetadata.height}`);

        // CRITICAL: Ensure outfit frame is EXACTLY the same size as base frame
        // Sharp's composite will scale the input if dimensions don't match, causing misalignment
        // Always resize outfit to match base dimensions explicitly, even if they appear the same
        outfitFrameBuffer = await outfitFrameImage
          .resize(baseFrameMetadata.width!, baseFrameMetadata.height!, {
            kernel: sharp.kernel.nearest, // Pixel-perfect scaling
            fit: 'fill', // Fill exact dimensions
          })
          .toBuffer();

        // Verify final outfit dimensions match base
        const finalOutfitMetadata = await sharp(outfitFrameBuffer).metadata();
        console.log(`[ImageGenerator] Final outfit frame dimensions: ${finalOutfitMetadata.width}×${finalOutfitMetadata.height} (base: ${baseFrameMetadata.width}×${baseFrameMetadata.height})`);

        // Composite outfit on top of base (both are guaranteed same size: 112×112)
        // IMPORTANT: Composite at native size first, then scale together
        // Use 'over' blend mode - outfit overlays exactly on base at (0,0)
        compositeImage = compositeImage.composite([
          {
            input: outfitFrameBuffer,
            blend: 'over',
            left: 0,
            top: 0,
          },
        ]);
      } catch (error) {
        console.warn(`[ImageGenerator] Failed to load outfit ${customization.outfit}: ${error instanceof Error ? error.message : String(error)}. Continuing with base only.`);
      }
    }

    // TODO: Future feature - Composite hair layer
    // When hair sprites are available, add similar logic here:
    // if (customization.hair) {
    //   const hairSpriteBuffer = await loadSpriteFile(`hair_${customization.hair}.png`);
    //   // Extract frame, resize to match, composite on top
    // }

    // TODO: Future feature - Composite eyes layer
    // When eye sprites are available, add similar logic here:
    // if (customization.eyes) {
    //   const eyesSpriteBuffer = await loadSpriteFile(`eyes_${customization.eyes}.png`);
    //   // Extract frame, resize to match, composite on top
    // }

    // TODO: Future feature - Composite equipment layers (weapon, armor, accessories)
    // When equipment sprites are available, add similar logic here:
    // if (equippedGear?.weapon) {
    //   const weaponSpriteBuffer = await loadSpriteFile(`weapon_${equippedGear.weapon}.png`);
    //   // Extract frame, resize to match, composite on top
    // }
    // Similar for armor, helmet, boots, gloves, accessory

    // CRITICAL: Convert composite to buffer first to ensure layers are fully merged
    // Then create new sharp instance and scale the merged image
    // This ensures both base and outfit scale together as a single image
    const compositedBuffer = await compositeImage.png().toBuffer();
    console.log(`[ImageGenerator] Composited image size: ${(await sharp(compositedBuffer).metadata()).width}×${(await sharp(compositedBuffer).metadata()).height}`);

    // Scale the composited image to 1600×1600 (much larger for PFP effect)
    // This makes the sprite appear much larger
    const scaledWidth = 1600;
    const scaledHeight = 1600;
    
    const scaledCharacter = await sharp(compositedBuffer)
      .resize(scaledWidth, scaledHeight, {
        kernel: sharp.kernel.nearest, // Pixel-perfect scaling
        fit: 'fill',
      })
      .toBuffer();
    
    console.log(`[ImageGenerator] Scaled character size: ${scaledWidth}×${scaledHeight} (from ${FRAME_WIDTH}×${FRAME_HEIGHT})`);

    // Extract a larger portion that includes more of the character's head and upper body
    // Extract more (like 50-60%) so we capture the head properly, then position it at top
    const extractHeight = Math.floor(scaledHeight * 0.6); // Top 60% = 960px (includes head + more torso)
    const extractWidth = scaledWidth; // Full width = 1600px
    const extractLeft = 0; // Start from left
    const extractTop = 0; // Start from absolute top
    
    const extractedPortion = await sharp(scaledCharacter)
      .extract({
        left: extractLeft,
        top: extractTop,
        width: extractWidth,
        height: extractHeight,
      })
      .toBuffer();
    
    console.log(`[ImageGenerator] Extracted portion: ${extractWidth}×${extractHeight} (top 60% for PFP)`);

    // Scale the extracted portion larger to fill more of the 800×800 canvas
    // Use 'cover' to fill the canvas, cropping if needed, or scale larger than canvas
    const canvasWidth = OUTPUT_SIZE; // 800
    const canvasHeight = OUTPUT_SIZE; // 800
    
    // Scale larger than canvas to make character appear bigger
    // Scale to 1200×1200 so we can extract the portion we want
    const largerScale = 1200;
    const scaledLarger = await sharp(extractedPortion)
      .resize(largerScale, largerScale, {
        kernel: sharp.kernel.nearest,
        fit: 'cover', // Fill dimensions
      })
      .toBuffer();
    
    console.log(`[ImageGenerator] Scaled larger: ${largerScale}×${largerScale}`);

    // Extract the portion that will fit on 800×800 canvas
    // Position extraction to show head + top torso
    // Extract from a LOWER Y position in the scaled image to move the character UP in the final frame
    const extractCanvasWidth = canvasWidth;
    const extractCanvasHeight = canvasHeight;
    const finalExtractX = Math.floor((largerScale - extractCanvasWidth) / 2); // Center horizontally
    // Extract from much lower Y position (y=400) so the character's head appears at the very top of final frame
    // This moves the sprite UP by extracting from lower in the source image
    const finalExtractY = 400; // Extract from lower position to move character higher up in final frame
    
    const finalCharacter = await sharp(scaledLarger)
      .extract({
        left: finalExtractX,
        top: finalExtractY,
        width: extractCanvasWidth,
        height: extractCanvasHeight,
      })
      .toBuffer();
    
    console.log(`[ImageGenerator] Extracted final character: ${extractCanvasWidth}×${extractCanvasHeight} from larger ${largerScale}×${largerScale} image at position (${finalExtractX}, ${finalExtractY})`);

    // Create canvas - start with transparent or background image
    let pfpImage: sharp.Sharp;
    
    if (options.includeBackground) {
      // Load and scale background image to 800×800
      try {
        const backgroundPath = path.join(__dirname, '../../public/background/image.png');
        
        // Check if background file exists
        if (!fs.existsSync(backgroundPath)) {
          throw new Error(`Background file not found: ${backgroundPath}`);
        }
        
        const backgroundBuffer = fs.readFileSync(backgroundPath);
        
        // Scale background to fit 800×800 (cover to fill, maintaining aspect ratio)
        const scaledBackground = await sharp(backgroundBuffer)
          .resize(canvasWidth, canvasHeight, {
            kernel: sharp.kernel.nearest, // Pixel-perfect scaling
            fit: 'cover', // Fill canvas, may crop
          })
          .toBuffer();
        
        console.log(`[ImageGenerator] Background loaded and scaled to ${canvasWidth}×${canvasHeight}`);
        
        // Start with background image
        pfpImage = sharp(scaledBackground);
      } catch (error) {
        console.warn(`[ImageGenerator] Failed to load background: ${error instanceof Error ? error.message : String(error)}. Using transparent background.`);
        // Fallback to transparent background
        pfpImage = sharp({
          create: {
            width: canvasWidth,
            height: canvasHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        });
      }
    } else {
      // Create transparent canvas
      pfpImage = sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4, // RGBA for transparency
          background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
        },
      });
    }
    
    // Composite character on top of background (or transparent canvas)
    pfpImage = pfpImage.composite([
      {
        input: finalCharacter,
        blend: 'over',
        left: 0,
        top: 0,
      },
    ]);

    // Export as PNG
    const pngBuffer = await pfpImage.png().toBuffer();

    return pngBuffer;
  } catch (error) {
    throw new Error(
      `Failed to generate character image: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

