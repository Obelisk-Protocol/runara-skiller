require('dotenv').config();
const fs = require('fs');

// Load the cNFTs list
const cnfts = JSON.parse(fs.readFileSync('cnfts-list.json', 'utf8'));

async function checkArweaveMetadata(assetId, name) {
  try {
    console.log(`\n🔍 Checking Arweave metadata for ${name} (${assetId})...`);
    
    // First, get the cNFT data to find the metadata URI
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.DAS_RPC_URL_MAINNET;
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'my-id',
        method: 'getAsset',
        params: {
          id: assetId
        }
      })
    });
    
    const data = await response.json();
    
    if (data.result && data.result.content && data.result.content.json_uri) {
      const metadataUri = data.result.content.json_uri;
      console.log(`📄 Metadata URI: ${metadataUri}`);
      
      // Fetch the actual metadata from Arweave
      const metadataResponse = await fetch(metadataUri);
      const metadata = await metadataResponse.json();
      
      console.log(`✅ Metadata found:`);
      console.log(`   Name: ${metadata.name}`);
      console.log(`   Description: ${metadata.description}`);
      console.log(`   Version: ${metadata.attributes?.find(attr => attr.trait_type === 'Version')?.value || 'N/A'}`);
      console.log(`   Combat Level: ${metadata.attributes?.find(attr => attr.trait_type === 'Combat Level')?.value || 'N/A'}`);
      console.log(`   Total Level: ${metadata.attributes?.find(attr => attr.trait_type === 'Total Level')?.value || 'N/A'}`);
      
      // Check if we have the new 18-skill format
      const skillAttributes = metadata.attributes?.filter(attr => 
        ['Attack', 'Strength', 'Defense', 'Magic', 'Projectiles', 'Vitality', 'Crafting', 'Luck', 
         'Mining', 'Woodcutting', 'Fishing', 'Farming', 'Hunting', 'Smithing', 'Cooking', 'Alchemy', 'Construction']
        .includes(attr.trait_type)
      ) || [];
      
      console.log(`   Skills (${skillAttributes.length}/17):`);
      skillAttributes.forEach(attr => {
        console.log(`     ${attr.trait_type}: Level ${attr.value}`);
      });
      
      // Check if we have the old abbreviated format
      const oldSkillAttributes = metadata.attributes?.filter(attr => 
        ['Att', 'Str', 'Def', 'Mag', 'Pro', 'Vit', 'Cra', 'Luc', 
         'Min', 'Woo', 'Fish', 'Farm', 'Hunt', 'Smith', 'Cook', 'Alch', 'Const']
        .includes(attr.trait_type)
      ) || [];
      
      if (oldSkillAttributes.length > 0) {
        console.log(`   ⚠️  OLD FORMAT detected (${oldSkillAttributes.length} abbreviated skills):`);
        oldSkillAttributes.forEach(attr => {
          console.log(`     ${attr.trait_type}: Level ${attr.value}`);
        });
      }
      
      const isUpdated = skillAttributes.length >= 17 && oldSkillAttributes.length === 0;
      console.log(`   Status: ${isUpdated ? '✅ UPDATED (18-skill format)' : '❌ NOT UPDATED (old format)'}`);
      
      return { success: true, isUpdated, skillCount: skillAttributes.length, oldSkillCount: oldSkillAttributes.length };
    } else {
      console.log(`❌ No metadata found in cNFT data`);
      return { success: false, error: 'No metadata URI found' };
    }
  } catch (error) {
    console.log(`❌ Error checking metadata: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function checkAllArweaveMetadata() {
  console.log('🔍 Checking Arweave metadata for all cNFTs...');
  console.log('=============================================');
  
  const results = [];
  
  for (const cnft of cnfts) {
    const name = cnft.content?.metadata?.name || 'Unknown';
    const result = await checkArweaveMetadata(cnft.id, name);
    results.push({ assetId: cnft.id, name, ...result });
    
    // Small delay between checks
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 Summary:');
  console.log('===========');
  const updated = results.filter(r => r.success && r.isUpdated);
  const notUpdated = results.filter(r => r.success && !r.isUpdated);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Updated to 18-skill format: ${updated.length}`);
  updated.forEach(r => console.log(`   - ${r.name}`));
  
  console.log(`❌ Still using old format: ${notUpdated.length}`);
  notUpdated.forEach(r => console.log(`   - ${r.name} (${r.skillCount} new skills, ${r.oldSkillCount} old skills)`));
  
  console.log(`💥 Failed to check: ${failed.length}`);
  failed.forEach(r => console.log(`   - ${r.name}: ${r.error}`));
  
  return results;
}

// Run the check
if (require.main === module) {
  checkAllArweaveMetadata()
    .then(() => {
      console.log('\n✅ Arweave metadata check completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Check failed:', error);
      process.exit(1);
    });
}

module.exports = { checkArweaveMetadata, checkAllArweaveMetadata };
