import 'dotenv/config';
import { getAssetWithProof } from '@metaplex-foundation/mpl-bubblegum';
import { publicKey } from '@metaplex-foundation/umi';
import { umi } from '../src/config/solana';

const TREASURY_WALLET = 'KXHnFbyda9vYLU4iqastL6cahbAoua1qdCvrJ9kAuYV';

const failedAssets = [
  { assetId: '4E9Q5o2MNMdeM9k8Gfdc1f6fPYoSbZZA17wKPAunu5dp', fromOwner: '5R1fB1mDrcf1QcvRiKHTWdws8YCcPDre5pDJkbuAFHvH' },
  { assetId: 'FmGYms9Q4UJwkTbj6kiYhLUwzfNBooospjiJ579q5HSd', fromOwner: 'B7QGLFDFxcPoqp3hZXathKzFC4LQumnfoUqGMDCbTT6F' },
  { assetId: 'AXnVv9PbZzdRcdbCtWcEoP6AFvjfnsQtgkV3gx3iPkie', fromOwner: 'B7RKETP28TgY2ST3eAfdvnW46WKqx98fV5jkUsQxZBGY' },
  { assetId: '8Z5XMbJdKQW3kdQ1sQYVDG987z2o1fzjVuvkdtkrRzZP', fromOwner: 'Gu1JmN4hwkkWoKTiiZiMSNfiJK42ffagigdhsbgDnYdt' },
  { assetId: '7imawah43EgLPRM3HMA1TKfgDkh5Lw9MMY8jNSh4z5Vp', fromOwner: 'Gu1JmN4hwkkWoKTiiZiMSNfiJK42ffagigdhsbgDnYdt' },
];

async function checkAssets() {
  console.log('🔍 Checking current on-chain state of failed assets using UMI...\n');

  for (const { assetId, fromOwner } of failedAssets) {
    try {
      const assetWithProof = await getAssetWithProof(umi, publicKey(assetId), {
        truncateCanopy: true,
      });

      const currentOwner = assetWithProof.leafOwner.toString();
      const delegate = (assetWithProof as any)?.leafDelegate?.toString() || null;
      const isInTreasury = currentOwner === TREASURY_WALLET;
      const isStillInPDA = currentOwner === fromOwner;

      console.log(`📦 ${assetId.slice(0, 8)}...${assetId.slice(-8)}:`);
      console.log(`   Current Owner: ${currentOwner}`);
      console.log(`   Original Owner (PDA): ${fromOwner}`);
      console.log(`   Delegate: ${delegate || 'None'}`);
      console.log(`   In Treasury: ${isInTreasury ? '✅ YES' : '❌ NO'}`);
      console.log(`   Still in PDA: ${isStillInPDA ? '✅ YES' : '❌ NO (moved!)'}`);
      
      if (!isStillInPDA && !isInTreasury) {
        console.log(`   ⚠️  MOVED TO USER WALLET - cannot transfer without user signature`);
      }
      console.log('');
    } catch (error: any) {
      console.log(`❌ Error checking ${assetId.slice(0, 8)}...${assetId.slice(-8)}: ${error.message}`);
      console.log('');
    }
  }
}

checkAssets().catch(console.error);
