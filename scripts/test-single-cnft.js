const fs = require('fs');

// Load the cNFTs list
const cnfts = JSON.parse(fs.readFileSync('cnfts-list.json', 'utf8'));

// Test a single cNFT update
async function testSingleCNFT(assetId, name) {
  try {
    console.log(`\n🧪 Testing ${name} (${assetId})...`);
    
    // First, add the cNFT to the database if it doesn't exist
    const addResponse = await fetch('https://obelisk-skiller-production.up.railway.app/api/characters/add-cnft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assetId: assetId,
        playerPDA: 'KXHnFbyda9vYLU4iqastL6cahbAoua1qdCvrJ9kAuYV'
      })
    });

    const addResult = await addResponse.json();
    console.log(`📝 Add to database result:`, addResult.success ? 'SUCCESS' : addResult.error);

    // Now test the metadata update
    const updateResponse = await fetch('https://obelisk-skiller-production.up.railway.app/api/characters/update-cnft-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assetId: assetId,
        characterStats: {
          name: name,
          combatLevel: 3,
          totalLevel: 18,
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
      console.log(`✅ SUCCESS: ${name} updated successfully`);
      return { success: true, assetId, name };
    } else {
      console.log(`❌ FAILED: ${name} - ${updateResult.error}`);
      return { success: false, assetId, name, error: updateResult.error };
    }
  } catch (error) {
    console.log(`❌ ERROR: ${name} - ${error.message}`);
    return { success: false, assetId, name, error: error.message };
  }
}

// Test the first failed cNFT
async function testFirstFailed() {
  const failedCNFT = cnfts[0]; // Gorf
  console.log('🔍 Testing first failed cNFT...');
  const result = await testSingleCNFT(failedCNFT.id, failedCNFT.content?.metadata?.name || 'Unknown');
  console.log('Result:', result);
}

// Test a successful cNFT to compare
async function testSuccessful() {
  const successfulCNFT = cnfts.find(cnft => cnft.id === 'AT9DXUmHg5jVaB6GjKuyFseD7zhswRdX8z44xUYv5rqw'); // Belacosaur
  if (successfulCNFT) {
    console.log('🔍 Testing successful cNFT for comparison...');
    const result = await testSingleCNFT(successfulCNFT.id, successfulCNFT.content?.metadata?.name || 'Unknown');
    console.log('Result:', result);
  }
}

// Run tests
if (require.main === module) {
  console.log('🧪 Single cNFT Test Script');
  console.log('========================');
  
  testFirstFailed()
    .then(() => {
      console.log('\n⏳ Waiting 5 seconds before testing successful cNFT...');
      return new Promise(resolve => setTimeout(resolve, 5000));
    })
    .then(() => testSuccessful())
    .then(() => {
      console.log('\n✅ Tests completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testSingleCNFT };
