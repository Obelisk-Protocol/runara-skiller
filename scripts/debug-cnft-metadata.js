#!/usr/bin/env node

/**
 * Debug cNFT metadata structure
 */

require('dotenv').config();

require('dotenv').config();
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || process.env.DAS_RPC_URL_MAINNET;

async function debugCNFTMetadata(assetId) {
  try {
    console.log(`🔍 Debugging cNFT metadata: ${assetId}`);
    
    const response = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAsset',
        params: {
          id: assetId
        }
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('❌ Error:', data.error.message);
      return;
    }
    
    const asset = data.result;
    console.log('📦 Full asset data:');
    console.log(JSON.stringify(asset, null, 2));
    
    // Check for metadata URI in different possible locations
    console.log('\n🔍 Metadata URI locations:');
    console.log('asset.content?.metadata?.uri:', asset.content?.metadata?.uri);
    console.log('asset.content?.uri:', asset.content?.uri);
    console.log('asset.uri:', asset.uri);
    console.log('asset.metadata?.uri:', asset.metadata?.uri);
    
    // Check for attributes
    console.log('\n🔍 Attributes:');
    console.log('asset.attributes:', asset.attributes);
    console.log('asset.content?.metadata?.attributes:', asset.content?.metadata?.attributes);
    
  } catch (error) {
    console.error('❌ Error debugging cNFT:', error.message);
  }
}

// Test with the first cNFT from your collection
const testAssetId = 'J8D2rx5XKqyYiqPfjMx3DUSLvVXLkL4Kn8nnH3HthwHz';
debugCNFTMetadata(testAssetId);
