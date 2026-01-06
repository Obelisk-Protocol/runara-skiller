/**
 * Test script for character image generation MVP
 * Generates a test PNG and verifies output
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { generateCharacterImage } from '../src/services/character-image-generator';
import { saveCharacterImage, getCharacterImagePath } from '../src/services/image-storage';
import { getDefaultCustomization } from '../src/types/character-customization';

// Load environment variables
dotenv.config();

async function testImageGeneration() {
  console.log('🧪 Starting character image generation test...\n');

  try {
    // Create test character customization
    const customization = getDefaultCustomization();
    console.log('✅ Created test customization:', customization);

    // Generate character image with background for testing
    console.log('\n📸 Generating character image...');
    const imageBuffer = await generateCharacterImage({ 
      customization,
      includeBackground: true // Include background for testing
    });
    console.log(`✅ Image generated successfully (${imageBuffer.length} bytes)`);

    // Save to public directory
    const characterName = 'TestCharacter';
    console.log('\n💾 Saving image to public directory...');
    const publicUrl = await saveCharacterImage(characterName, imageBuffer);
    console.log(`✅ Image saved to: ${publicUrl}`);

    // Also save to test-output directory for easy viewing
    const testOutputDir = path.join(__dirname, '../test-output');
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
    const testOutputPath = path.join(testOutputDir, 'test-character.png');
    fs.writeFileSync(testOutputPath, imageBuffer);
    console.log(`✅ Test output saved to: ${testOutputPath}`);

    // Verify file exists and has content
    const stats = fs.statSync(testOutputPath);
    console.log(`\n📊 File stats:`);
    console.log(`   Size: ${stats.size} bytes`);
    console.log(`   Created: ${stats.birthtime.toISOString()}`);

    // Get image dimensions using Sharp (if available)
    try {
      const sharp = require('sharp');
      const metadata = await sharp(imageBuffer).metadata();
      console.log(`\n🖼️  Image dimensions: ${metadata.width}×${metadata.height}px`);
      console.log(`   Format: ${metadata.format}`);
    } catch (err) {
      console.warn('⚠️  Could not read image metadata:', err instanceof Error ? err.message : String(err));
    }

    console.log('\n✅ Test completed successfully!');
    console.log(`\n📝 Next steps:`);
    console.log(`   1. Open ${testOutputPath} to view the generated image`);
    console.log(`   2. Start the server and visit ${publicUrl} to verify HTTP access`);
    console.log(`   3. Verify the image shows character torso + head with outfit applied`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run test
testImageGeneration().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

