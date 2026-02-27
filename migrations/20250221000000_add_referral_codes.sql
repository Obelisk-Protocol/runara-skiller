-- Add my_referral_code: unique shareable code per wallet
-- referral_code (existing) = code of who referred them
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS my_referral_code TEXT UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_my_referral_code ON waitlist(my_referral_code) WHERE my_referral_code IS NOT NULL;
