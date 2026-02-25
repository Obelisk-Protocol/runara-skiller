require('dotenv').config();
const https = require('https');

// Your collection address (or set CNFT_COLLECTION_ADDRESS in .env)
const COLLECTION_ADDRESS = 'DQWoNLwaqFoxJPiMxnzDEaiJZoCWZ5uBzzN4uUk9XvrE';

async function fetchCollectionCNFTs() {
  try {
    console.log('🔍 Fetching cNFTs from collection using direct DAS API...');
    
    // Use Helius DAS API directly
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.DAS_RPC_URL_MAINNET;
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'my-id',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: COLLECTION_ADDRESS,
          page: 1,
          limit: 1000
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    const assets = data.result?.items || [];
    console.log(`📊 Found ${assets.length} assets in collection`);
    
    // Show all assets and their types
    console.log('\n🔍 All assets in collection:');
    assets.forEach((asset, index) => {
      console.log(`${index + 1}. ${asset.content?.metadata?.name || 'Unknown'} (${asset.id})`);
      console.log(`   Interface: ${asset.interface}`);
      console.log(`   Owner: ${asset.ownership?.owner}`);
      console.log(`   Image: ${asset.content?.files?.[0]?.uri || 'N/A'}`);
      console.log('');
    });
    
    const programmableCNFTs = assets.filter(asset => 
      asset.interface === 'ProgrammableNonFungible'
    );

    console.log(`🎯 Found ${programmableCNFTs.length} programmable cNFTs`);
    
    // Also check for regular NFTs that might be cNFTs
    const regularNFTs = assets.filter(asset => 
      asset.interface === 'NonFungible'
    );
    
    console.log(`📦 Found ${regularNFTs.length} regular NFTs`);
    
    // Return all assets for now
    return assets;
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
