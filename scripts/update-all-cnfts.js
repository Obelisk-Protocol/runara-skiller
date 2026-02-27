const fs = require('fs');

// Load the cNFTs list
const cnfts = JSON.parse(fs.readFileSync('cnfts-list.json', 'utf8'));

console.log(`🚀 Starting update of ${cnfts.length} cNFTs to new 18-skill metadata format...`);

async function updateCNFT(assetId, name) {
  try {
    console.log(`\n🔄 Updating ${name} (${assetId})...`);
    
    // First, add the cNFT to the database if it doesn't exist
    const addResponse = await fetch('https://obelisk-skiller-production.up.railway.app/api/characters/add-cnft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assetId: assetId,
        playerPDA: 'KXHnFbyda9vYLU4iqastL6cahbAoua1qdCvrJ9kAuYV' // Your server wallet
      })
    });

    const addResult = await addResponse.json();
    
    if (addResult.success) {
      console.log(`✅ Added ${name} to database`);
    } else {
      console.log(`⚠️ ${name} might already exist in database: ${addResult.error}`);
    }

    // Now update the cNFT metadata to 18-skill format
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
      console.log(`✅ Successfully updated ${name} metadata`);
      return { success: true, assetId, name };
    } else {
      console.log(`❌ Failed to update ${name}: ${updateResult.error}`);
      return { success: false, assetId, name, error: updateResult.error };
    }
  } catch (error) {
    console.log(`❌ Error updating ${name}: ${error.message}`);
    return { success: false, assetId, name, error: error.message };
  }
}

async function updateAllCNFTs() {
  const results = [];
  
  for (let i = 0; i < cnfts.length; i++) {
    const cnft = cnfts[i];
    const result = await updateCNFT(cnft.id, cnft.content?.metadata?.name || 'Unknown');
    results.push(result);
    
    // Add a small delay between updates to avoid rate limiting
    if (i < cnfts.length - 1) {
      console.log('⏳ Waiting 2 seconds before next update...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Summary
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n📊 Update Summary:`);
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed updates:`);
    failed.forEach(f => console.log(`  - ${f.name} (${f.assetId}): ${f.error}`));
  }
  
  // Save results
  fs.writeFileSync('update-results.json', JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to update-results.json`);
}

// Run the update
if (require.main === module) {
  updateAllCNFTs()
    .then(() => {
      console.log('\n🎉 All cNFT updates completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { updateAllCNFTs, updateCNFT };
