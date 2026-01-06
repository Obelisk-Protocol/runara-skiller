const fs = require('fs');

// Load the cNFTs list
const cnfts = JSON.parse(fs.readFileSync('cnfts-list.json', 'utf8'));

// Filter out the 2 that already succeeded (Belacosaur and Greg)
const successfulAssetIds = ['AT9DXUmHg5jVaB6GjKuyFseD7zhswRdX8z44xUYv5rqw', '4Jd4RxmXeyn6ifQCKFX49qykykisj5jmfhWYk7VWyYA8'];
const failedCNFTs = cnfts.filter(cnft => !successfulAssetIds.includes(cnft.id));

console.log(`🎯 Found ${failedCNFTs.length} cNFTs that need updating (excluding the 2 that already succeeded)`);

async function updateSingleCNFT(assetId, name, index, total) {
  try {
    console.log(`\n🔄 [${index}/${total}] Updating ${name} (${assetId})...`);
    
    // Update the cNFT metadata to 18-skill format
    const updateResponse = await fetch('https://obelisk-skiller-production.up.railway.app/api/characters/update-cnft-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assetId: assetId,
        characterStats: {
          name: name,
          combatLevel: 1, // Default: all 6 combat skills at level 1 = (1+1+1+1+1+1)/6 = 1
          totalLevel: 18, // 18 skills at level 1
          version: "1.0.0",
          experience: 100,
          skills: {
            attack: { level: 1, experience: 0 },
            strength: { level: 1, experience: 0 },
            defense: { level: 1, experience: 0 },
            magic: { level: 1, experience: 0 },
            projectiles: { level: 1, experience: 0 },
            vitality: { level: 1, experience: 0 },
            crafting: { level: 1, experience: 0 },
            luck: { level: 1, experience: 0 },
            mining: { level: 1, experience: 0 },
            woodcutting: { level: 1, experience: 0 },
            fishing: { level: 1, experience: 0 },
            farming: { level: 1, experience: 0 },
            hunting: { level: 1, experience: 0 },
            smithing: { level: 1, experience: 0 },
            cooking: { level: 1, experience: 0 },
            alchemy: { level: 1, experience: 0 },
            construction: { level: 1, experience: 0 }
          },
          skillExperience: {
            attack: 0,
            strength: 0,
            defense: 0,
            magic: 0,
            projectiles: 0,
            vitality: 0,
            crafting: 0,
            luck: 0,
            mining: 0,
            woodcutting: 0,
            fishing: 0,
            farming: 0,
            hunting: 0,
            smithing: 0,
            cooking: 0,
            alchemy: 0,
            construction: 0
          }
        },
        playerPDA: 'KXHnFbyda9vYLU4iqastL6cahbAoua1qdCvrJ9kAuYV'
      })
    });

    const updateResult = await updateResponse.json();
    
    if (updateResult.success) {
      console.log(`✅ SUCCESS: ${name} updated successfully!`);
      return { success: true, assetId, name, signature: updateResult.signature };
    } else {
      console.log(`❌ FAILED: ${name} - ${updateResult.error}`);
      return { success: false, assetId, name, error: updateResult.error };
    }
  } catch (error) {
    console.log(`❌ ERROR: ${name} - ${error.message}`);
    return { success: false, assetId, name, error: error.message };
  }
}

async function updateAllOneByOne() {
  const results = [];
  
  for (let i = 0; i < failedCNFTs.length; i++) {
    const cnft = failedCNFTs[i];
    const name = cnft.content?.metadata?.name || 'Unknown';
    
    const result = await updateSingleCNFT(cnft.id, name, i + 1, failedCNFTs.length);
    results.push(result);
    
    // Long delay between updates to avoid merkle tree conflicts
    if (i < failedCNFTs.length - 1) {
      console.log(`⏳ Waiting 45 seconds before next update to avoid merkle tree conflicts...`);
      await new Promise(resolve => setTimeout(resolve, 45000)); // 45 seconds
    }
  }
  
  // Summary
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n📊 Final Summary:`);
  console.log(`✅ Successful updates: ${successful.length}`);
  successful.forEach(r => console.log(`   - ${r.name} (${r.assetId})`));
  
  console.log(`❌ Failed updates: ${failed.length}`);
  failed.forEach(r => console.log(`   - ${r.name}: ${r.error}`));
  
  // Save results
  fs.writeFileSync('one-by-one-results.json', JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to one-by-one-results.json`);
  
  return results;
}

// Run the updates
if (require.main === module) {
  console.log('🚀 Starting one-by-one cNFT updates...');
  console.log('⏰ Each update will wait 45 seconds to avoid merkle tree conflicts');
  console.log(`📊 Total time estimate: ${Math.ceil(failedCNFTs.length * 45 / 60)} minutes`);
  
  updateAllOneByOne()
    .then(() => {
      console.log('\n🎉 All one-by-one updates completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { updateSingleCNFT, updateAllOneByOne };
