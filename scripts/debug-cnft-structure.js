const fs = require('fs');

// Load the cNFTs list
const cnfts = JSON.parse(fs.readFileSync('cnfts-list.json', 'utf8'));

async function debugCNFTStructure(assetId, name) {
  try {
    console.log(`\n🔍 Debugging cNFT structure for ${name} (${assetId})...`);
    
    // Get the cNFT data
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=fe7d2dc0-06de-42b1-b947-0db7c3003797`, {
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
    
    if (data.result) {
      console.log(`📄 Full cNFT structure:`);
      console.log(JSON.stringify(data.result, null, 2));
      
      // Check different possible locations for metadata URI
      console.log(`\n🔍 Checking for metadata URI in different locations:`);
      console.log(`   data.result.content?.metadata?.uri: ${data.result.content?.metadata?.uri || 'undefined'}`);
      console.log(`   data.result.content?.metadata: ${JSON.stringify(data.result.content?.metadata || 'undefined')}`);
      console.log(`   data.result.content: ${JSON.stringify(data.result.content || 'undefined')}`);
      
      return data.result;
    } else {
      console.log(`❌ No result found: ${JSON.stringify(data)}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error debugging cNFT: ${error.message}`);
    return null;
  }
}

// Debug the first cNFT
async function debugFirst() {
  const firstCNFT = cnfts[0]; // Gorf
  console.log('🔍 Debugging first cNFT structure...');
  const result = await debugCNFTStructure(firstCNFT.id, firstCNFT.content?.metadata?.name || 'Unknown');
  return result;
}

// Run debug
if (require.main === module) {
  debugFirst()
    .then(() => {
      console.log('\n✅ Debug completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Debug failed:', error);
      process.exit(1);
    });
}

module.exports = { debugCNFTStructure };
