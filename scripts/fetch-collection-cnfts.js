const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { createHeliusRpc } = require('@metaplex-foundation/umi-rpc-helius');
const { DAS } = require('@metaplex-foundation/digital-asset-standard-api');

// Your collection address
const COLLECTION_ADDRESS = 'DQWoNLwaqFoxJPiMxnzDEaiJZoCWZ5uBzzN4uUk9XvrE';

async function fetchCollectionCNFTs() {
  try {
    // Create UMI instance
    const umi = createUmi('https://mainnet.helius-rpc.com/?api-key=fe7d2dc0-06de-42b1-b947-0db7c3003797')
      .use(createHeliusRpc('https://mainnet.helius-rpc.com/?api-key=fe7d2dc0-06de-42b1-b947-0db7c3003797'))
      .use(DAS());

    console.log('🔍 Fetching cNFTs from collection...');
    
    // Get all assets in the collection
    const assets = await umi.rpc.getAssetsByGroup({
      groupKey: 'collection',
      groupValue: COLLECTION_ADDRESS,
      page: 1,
      limit: 1000, // Adjust if you have more than 1000
    });

    console.log(`📊 Found ${assets.items.length} cNFTs in collection`);
    
    const cnfts = [];
    for (const asset of assets.items) {
      if (asset.interface === 'ProgrammableNonFungible') {
        cnfts.push({
          assetId: asset.id,
          name: asset.content?.metadata?.name || 'Unknown',
          owner: asset.ownership?.owner,
          collection: asset.grouping?.find(g => g.group_key === 'collection')?.group_value,
          image: asset.content?.files?.[0]?.uri,
          attributes: asset.content?.metadata?.attributes || []
        });
      }
    }

    console.log('✅ cNFTs found:');
    cnfts.forEach((cnft, index) => {
      console.log(`${index + 1}. ${cnft.name} (${cnft.assetId})`);
    });

    return cnfts;
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
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fetchCollectionCNFTs };
