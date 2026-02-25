# Open Source Release Checklist

This document summarizes the preparations made for open sourcing Obelisk Skiller and steps to complete before publishing.

## ✅ Completed

- **Sanitized `env.example`** – Removed all real API keys, database credentials, and secrets. Uses placeholders only.
- **Updated `.gitignore`** – Added `.env`, `.env.local`, `.env.*.local` to prevent accidental commits.
- **Removed hardcoded secrets from scripts** – All scripts now use `process.env` for RPC URLs and keys:
  - `mint-new-collection.js`, `update-collection-metadata.js` – use `PRIVATE_SERVER_WALLET` from env
  - `setup-runara-fresh.js`, `fetch-collection-*.js`, `debug-*.js`, etc. – use RPC URL from env
- **Added LICENSE** – MIT license.
- **Added CONTRIBUTING.md** – Contribution guidelines.
- **Added SECURITY.md** – Vulnerability reporting policy.
- **Updated README** – Fixed paths, env setup instructions.
- **Updated package.json** – Added repository, bugs, homepage fields (update `your-org` with your GitHub org/user).

## ⚠️ Before Publishing

1. **Update repository URLs** in `package.json` – Replace `your-org` with your actual GitHub org or username.

2. **Verify no secrets in git history** – If `skiller/.env` or `skiller/.env.local` were ever committed:
   ```bash
   git log -p -- skiller/.env skiller/.env.local
   ```
   If found, consider using `git filter-repo` or BFG Repo-Cleaner to remove them from history. **Rotate all exposed credentials immediately.**

3. **Check MAINNET folder** – `MAINNET/.env` and `MAINNET/tokenoutputs.json` may contain project-specific data. Review before publishing.

4. **Run final checks**:
   ```bash
   cd skiller
   npm run build
   npm run lint
   ```

## Files to Never Commit

- `skiller/.env`
- `skiller/.env.local`
- `skiller/MAINNET/.env`
- Any file containing API keys, private keys, or database URLs
