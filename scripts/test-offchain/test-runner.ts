/**
 * Off-Chain Program Services Test Runner
 * 
 * Runs all test suites for the off-chain program services
 * 
 * Usage:
 *   tsx scripts/test-offchain/test-runner.ts
 *   tsx scripts/test-offchain/test-runner.ts --suite player-accounts
 *   tsx scripts/test-offchain/test-runner.ts --cleanup
 */

import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';

// Test results interface
interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  error?: string;
  duration: number;
}

interface SuiteResult {
  suite: string;
  passed: number;
  failed: number;
  total: number;
  duration: number;
  results: TestResult[];
}

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test suites to run
const testSuites = [
  'test-setup',
  'test-player-accounts',
  'test-token-accounts',
  'test-balance-manager',
  'test-token-operations',
  'test-cnft-storage',
  'test-cleanup',
];

async function runTestSuite(suiteName: string): Promise<SuiteResult> {
  const suitePath = path.join(__dirname, `${suiteName}.ts`);
  
  if (!fs.existsSync(suitePath)) {
    throw new Error(`Test suite not found: ${suitePath}`);
  }

  log(`\n📦 Running test suite: ${suiteName}`, 'cyan');
  log('─'.repeat(60), 'cyan');

  const startTime = Date.now();
  const results: TestResult[] = [];

  try {
    // Dynamically import and run the test suite
    const testModule = await import(`./${suiteName}`);
    const testFunctions = Object.keys(testModule).filter(
      key => typeof testModule[key] === 'function' && key.startsWith('test')
    );

    // Sort tests: setup first, then others, cleanup last
    testFunctions.sort((a, b) => {
      if (a.includes('Setup') || a.includes('setup')) return -1;
      if (b.includes('Setup') || b.includes('setup')) return 1;
      if (a.includes('Cleanup') || a.includes('cleanup')) return 1;
      if (b.includes('Cleanup') || b.includes('cleanup')) return -1;
      return a.localeCompare(b);
    });

    for (const testName of testFunctions) {
      const testStart = Date.now();
      try {
        log(`  ⏳ Running: ${testName}`, 'yellow');
        await testModule[testName]();
        const duration = Date.now() - testStart;
        results.push({
          suite: suiteName,
          test: testName,
          passed: true,
          duration,
        });
        log(`  ✅ Passed: ${testName} (${duration}ms)`, 'green');
      } catch (error: any) {
        const duration = Date.now() - testStart;
        results.push({
          suite: suiteName,
          test: testName,
          passed: false,
          error: error.message || String(error),
          duration,
        });
        log(`  ❌ Failed: ${testName}`, 'red');
        log(`     Error: ${error.message || String(error)}`, 'red');
      }
    }
  } catch (error: any) {
    log(`  ❌ Suite failed to load: ${error.message}`, 'red');
    results.push({
      suite: suiteName,
      test: 'suite-load',
      passed: false,
      error: error.message || String(error),
      duration: 0,
    });
  }

  const duration = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    suite: suiteName,
    passed,
    failed,
    total: results.length,
    duration,
    results,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const suiteFilter = args.find(arg => arg.startsWith('--suite='))?.split('=')[1];
  const cleanupOnly = args.includes('--cleanup');

  log('🧪 Off-Chain Program Services Test Runner', 'blue');
  log('═'.repeat(60), 'blue');
  
  // Warn about on-chain operations
  const cluster = process.env.SOLANA_CLUSTER || 'devnet';
  if (cluster === 'mainnet-beta' || cluster === 'mainnet') {
    log('\n⚠️  WARNING: Running on MAINNET - Real SOL and tokens will be used!', 'red');
    log('⚠️  On-chain operations will incur real costs!', 'red');
  } else {
    log(`\nℹ️  Running on ${cluster} - Using test tokens`, 'yellow');
  }

  // Validate environment
  const requiredEnvVars = [
    'DATABASE_URL',
    'PRIVATE_SERVER_WALLET',
    'SOLANA_CLUSTER',
  ];

  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    log(`\n❌ Missing required environment variables: ${missing.join(', ')}`, 'red');
    process.exit(1);
  }

  log(`\n✅ Environment validated`, 'green');
  log(`   Database: ${process.env.DATABASE_URL ? 'Connected' : 'Missing'}`, 'green');
  log(`   Cluster: ${process.env.SOLANA_CLUSTER || 'devnet'}`, 'green');

  const suitesToRun = cleanupOnly 
    ? ['test-cleanup']
    : suiteFilter 
      ? [suiteFilter]
      : testSuites;

  const allResults: SuiteResult[] = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of suitesToRun) {
    try {
      const result = await runTestSuite(suite);
      allResults.push(result);
      totalPassed += result.passed;
      totalFailed += result.failed;
    } catch (error: any) {
      log(`\n❌ Failed to run suite ${suite}: ${error.message}`, 'red');
      totalFailed++;
    }
  }

  // Print summary
  log('\n' + '═'.repeat(60), 'blue');
  log('📊 Test Summary', 'blue');
  log('═'.repeat(60), 'blue');

  for (const result of allResults) {
    const status = result.failed === 0 ? '✅' : '❌';
    log(
      `${status} ${result.suite}: ${result.passed}/${result.total} passed (${result.duration}ms)`,
      result.failed === 0 ? 'green' : 'red'
    );
  }

  log('\n' + '─'.repeat(60), 'blue');
  log(`Total: ${totalPassed} passed, ${totalFailed} failed`, totalFailed === 0 ? 'green' : 'red');
  log('─'.repeat(60), 'blue');

  // Save results to file
  const resultsPath = path.join(__dirname, 'test-results.json');
  fs.writeFileSync(
    resultsPath,
    JSON.stringify({ timestamp: new Date().toISOString(), results: allResults }, null, 2)
  );
  log(`\n💾 Results saved to: ${resultsPath}`, 'cyan');

  // Exit with appropriate code
  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
