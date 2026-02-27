require('dotenv').config();
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { createHeliusRpc } = require('@metaplex-foundation/umi-rpc-helius');
const { DAS } = require('@metaplex-foundation/digital-asset-standard-api');

// Your collection address (set via CNFT_COLLECTION_ADDRESS env var or replace)
const COLLECTION_ADDRESS = process.env.CNFT_COLLECTION_ADDRESS || process.env.COLLECTION_MINT_MAINNET || 'DQWoNLwaqFoxJPiMxnzDEaiJZoCWZ5uBzzN4uUk9XvrE';

const rpcUrl = process.env.SOLANA_RPC_URL || process.env.DAS_RPC_URL_MAINNET || process.env.MAINNET_RPC_URL;
if (!rpcUrl) {
  console.error('Set SOLANA_RPC_URL, DAS_RPC_URL_MAINNET, or MAINNET_RPC_URL in .env');
  process.exit(1);
}

async function fetchCollectionCNFTs() {
  try {
    // Create UMI instance
    const umi = createUmi(rpcUrl)
      .use(createHeliusRpc(rpcUrl))
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
