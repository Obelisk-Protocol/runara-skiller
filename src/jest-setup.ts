/**
 * Jest setup: run before test files are loaded so config modules (e.g. solana.ts)
 * that require env vars at load time don't throw.
 */
if (!process.env.PRIVATE_SERVER_WALLET) {
  process.env.PRIVATE_SERVER_WALLET = JSON.stringify(new Array(64).fill(0));
}
