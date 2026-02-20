-- Waitlist table for pre-launch signups
-- Tracks wallet addresses that have joined the waitlist
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL UNIQUE,
  referral_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_wallet ON waitlist(wallet_address);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at);
