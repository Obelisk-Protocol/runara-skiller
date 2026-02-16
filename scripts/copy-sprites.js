/**
 * Copy sprite files from frontend to backend public directory
 * This ensures sprites are available locally for character image generation
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_SPRITE_DIR = path.join(__dirname, '../../ObeliskParadox/public/assets/sprites/playablecharacters/baseplayer');
const BACKEND_SPRITE_DIR = path.join(__dirname, '../public/assets/sprites/playablecharacters/baseplayer');

console.log('📦 Copying sprites from frontend to backend...');
console.log(`   Source: ${FRONTEND_SPRITE_DIR}`);
console.log(`   Destination: ${BACKEND_SPRITE_DIR}`);

// Create destination directory if it doesn't exist
if (!fs.existsSync(BACKEND_SPRITE_DIR)) {
  fs.mkdirSync(BACKEND_SPRITE_DIR, { recursive: true });
  console.log(`✅ Created directory: ${BACKEND_SPRITE_DIR}`);
}

// Check if source directory exists
if (!fs.existsSync(FRONTEND_SPRITE_DIR)) {
  console.warn(`⚠️  Source directory not found: ${FRONTEND_SPRITE_DIR}`);
  console.warn('   Sprites will need to be fetched from FRONTEND_BASE_URL instead.');
  process.exit(0);
}

// Copy all sprite files
try {
  const files = fs.readdirSync(FRONTEND_SPRITE_DIR);
  let copiedCount = 0;
  
  files.forEach(file => {
    if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
      const sourcePath = path.join(FRONTEND_SPRITE_DIR, file);
      const destPath = path.join(BACKEND_SPRITE_DIR, file);
      
      fs.copyFileSync(sourcePath, destPath);
      copiedCount++;
      console.log(`   ✅ Copied: ${file}`);
    }
  });
  
  console.log(`\n✅ Successfully copied ${copiedCount} sprite files!`);
} catch (error) {
  console.error('❌ Error copying sprites:', error.message);
  process.exit(1);
}
