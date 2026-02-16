/**
 * Copy public folder to dist for Railway deployment
 * This ensures static assets (sprites, images) are available in production
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../public');
const destDir = path.join(__dirname, '../dist/public');

console.log('📦 Copying public folder to dist...');
console.log(`   Source: ${sourceDir}`);
console.log(`   Destination: ${destDir}`);

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Source directory not found: ${src}`);
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`   ✅ Copied: ${entry.name}`);
    }
  }
}

try {
  copyRecursive(sourceDir, destDir);
  console.log(`\n✅ Successfully copied public folder to dist!`);
} catch (error) {
  console.error('❌ Error copying public folder:', error.message);
  process.exit(1);
}
