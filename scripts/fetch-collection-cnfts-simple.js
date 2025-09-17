const https = require('https');

// Your collection address
const COLLECTION_ADDRESS = 'DQWoNLwaqFoxJPiMxnzDEaiJZoCWZ5uBzzN4uUk9XvrE';

async function fetchCollectionCNFTs() {
  try {
    console.log('🔍 Fetching cNFTs from collection...');
    
    // Use your deployed service's DAS endpoint
    const response = await fetch('https://obelisk-skiller-production.up.railway.app/api/das/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collection: COLLECTION_ADDRESS,
        page: 1,
        limit: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`API error: ${data.error}`);
    }

    const cnfts = data.assets || [];
    console.log(`📊 Found ${cnfts.length} cNFTs in collection`);
    
    const programmableCNFTs = cnfts.filter(asset => 
      asset.interface === 'ProgrammableNonFungible'
    );

    console.log(`🎯 Found ${programmableCNFTs.length} programmable cNFTs`);
    
    console.log('\n✅ cNFTs found:');
    programmableCNFTs.forEach((cnft, index) => {
      console.log(`${index + 1}. ${cnft.content?.metadata?.name || 'Unknown'} (${cnft.id})`);
      console.log(`   Owner: ${cnft.ownership?.owner}`);
      console.log(`   Image: ${cnft.content?.files?.[0]?.uri || 'N/A'}`);
      console.log('');
    });

    return programmableCNFTs;
  } catch (error) {
    console.error('❌ Error fetching collection cNFTs:', error);
    return [];
  }
}

// Run the script
if (require.main === module) {
  fetchCollectionCNFTs()
    .then(cnfts => {
      console.log(`\n🎯 Total cNFTs to update: ${cnfts.length}`);
      
      // Save to file for reference
      const fs = require('fs');
      fs.writeFileSync('cnfts-list.json', JSON.stringify(cnfts, null, 2));
      console.log('💾 Saved cNFTs list to cnfts-list.json');
      
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fetchCollectionCNFTs };
