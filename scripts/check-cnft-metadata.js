const fs = require('fs');

// Load the cNFTs list
const cnfts = JSON.parse(fs.readFileSync('cnfts-list.json', 'utf8'));

async function checkCNFTMetadata(assetId, name) {
  try {
    console.log(`\n🔍 Checking metadata for ${name} (${assetId})...`);
    
    // Get the cNFT data from our API
    const response = await fetch(`https://obelisk-skiller-production.up.railway.app/api/cnft/${assetId}`);
    const data = await response.json();
    
    if (data.success && data.character) {
      console.log(`✅ Found character data:`);
      console.log(`   Name: ${data.character.name}`);
      console.log(`   Combat Level: ${data.character.combatLevel}`);
      console.log(`   Total Level: ${data.character.totalLevel}`);
      console.log(`   Version: ${data.character.version}`);
      console.log(`   Skills:`);
      
      // Show all 18 skills
      const skills = data.character.skills || {};
      Object.entries(skills).forEach(([skill, data]) => {
        console.log(`     ${skill}: Level ${data.level}, ${data.experience} XP`);
      });
      
      return true;
    } else {
      console.log(`❌ No character data found: ${data.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error checking metadata: ${error.message}`);
    return false;
  }
}

async function checkAllCNFTs() {
  console.log('🔍 Checking metadata for all cNFTs...');
  console.log('=====================================');
  
  const results = [];
  
  for (const cnft of cnfts) {
    const name = cnft.content?.metadata?.name || 'Unknown';
    const success = await checkCNFTMetadata(cnft.id, name);
    results.push({ assetId: cnft.id, name, success });
    
    // Small delay between checks
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 Summary:');
  console.log('===========');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successfully loaded: ${successful.length}`);
  successful.forEach(r => console.log(`   - ${r.name}`));
  
  console.log(`❌ Failed to load: ${failed.length}`);
  failed.forEach(r => console.log(`   - ${r.name}`));
  
  return results;
}

// Run the check
if (require.main === module) {
  checkAllCNFTs()
    .then(() => {
      console.log('\n✅ Metadata check completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Check failed:', error);
      process.exit(1);
    });
}

module.exports = { checkCNFTMetadata, checkAllCNFTs };
