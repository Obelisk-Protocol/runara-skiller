/**
 * Quick script to check if environment variables are loaded
 * Run: npx tsx scripts/test-offchain/check-env.ts
 */

import 'dotenv/config';

console.log('🔍 Checking Environment Variables...\n');

const required = [
  'DATABASE_URL',
  'PRIVATE_SERVER_WALLET',
  'SOLANA_CLUSTER',
];

const cluster = (process.env.SOLANA_CLUSTER || '').toLowerCase();
const isMainnet = cluster === 'mainnet-beta' || cluster === 'mainnet';

const clusterSpecific = isMainnet
  ? ['COBX_MINT_MAINNET', 'OBX_MINT_MAINNET']
  : ['COBX_MINT_DEVNET', 'OBX_MINT_DEVNET'];

let allGood = true;

console.log('Required Variables:');
for (const varName of required) {
  const value = process.env[varName];
  if (value) {
    // Mask sensitive values
    const masked = varName === 'DATABASE_URL' 
      ? `${value.substring(0, 20)}...${value.substring(value.length - 10)}`
      : varName === 'PRIVATE_SERVER_WALLET'
      ? `[${JSON.parse(value).length} bytes]`
      : value;
    console.log(`  ✅ ${varName}: ${masked}`);
  } else {
    console.log(`  ❌ ${varName}: NOT SET`);
    allGood = false;
  }
}

console.log(`\nCluster-Specific Variables (${isMainnet ? 'mainnet' : 'devnet'}):`);
for (const varName of clusterSpecific) {
  const value = process.env[varName];
  if (value) {
    console.log(`  ✅ ${varName}: ${value}`);
  } else {
    console.log(`  ❌ ${varName}: NOT SET`);
    allGood = false;
  }
}

if (allGood) {
  console.log('\n✅ All required environment variables are set!');
  process.exit(0);
} else {
  console.log('\n❌ Some environment variables are missing!');
  console.log('\n💡 To get Railway env vars:');
  console.log('   railway variables');
  console.log('   or export them locally from Railway dashboard');
  process.exit(1);
}
