-- ============================================
-- Off-Chain Program Integration Migration
-- Date: 2025-02-04
-- Description: Integrates off-chain program architecture with existing database
-- Strategy: Extends existing tables, adds new supporting tables
-- ============================================

-- ============================================
-- PART 1: EXTEND PROFILES TABLE
-- ============================================
-- Add off-chain player account fields to existing profiles table
-- (profiles already has: id, player_pda, wallet_address, character_class, character_name, cobx_token_account)

ALTER TABLE profiles
  -- Player progression (replaces PDA PlayerAccount fields)
  ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1 CHECK (level >= 1),
  ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0 CHECK (wins >= 0),
  ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0 CHECK (losses >= 0),
  ADD COLUMN IF NOT EXISTS lifetime_obx_earned BIGINT DEFAULT 0 CHECK (lifetime_obx_earned >= 0),
  ADD COLUMN IF NOT EXISTS lifetime_exp_spent BIGINT DEFAULT 0 CHECK (lifetime_exp_spent >= 0),
  
  -- Off-chain program tracking
  ADD COLUMN IF NOT EXISTS offchain_migration_complete BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pda_deprecated BOOLEAN DEFAULT false; -- Flag to mark PDA as deprecated

-- Update character_name to use 'name' if it doesn't exist (for consistency)
-- Note: character_name already exists, we'll keep both for now

-- ============================================
-- PART 2: TOKEN ACCOUNT TRACKING
-- ============================================
-- Track server-controlled Token-2022 accounts (replaces PDA token accounts)
-- References profiles.id (user_id) instead of player_pda

CREATE TABLE IF NOT EXISTS player_token_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- References profiles.id (user_id)
  token_account_address TEXT NOT NULL UNIQUE, -- On-chain Token-2022 account address
  mint_address TEXT NOT NULL, -- OBX or cOBX mint address
  balance BIGINT DEFAULT 0 CHECK (balance >= 0), -- Database balance (source of truth)
  on_chain_balance BIGINT DEFAULT 0 CHECK (on_chain_balance >= 0), -- Cached on-chain balance
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, mint_address)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_token_accounts_player_id ON player_token_accounts(player_id);
CREATE INDEX IF NOT EXISTS idx_token_accounts_address ON player_token_accounts(token_account_address);
CREATE INDEX IF NOT EXISTS idx_token_accounts_player_mint ON player_token_accounts(player_id, mint_address);

-- ============================================
-- PART 3: BALANCE TRANSACTION LEDGER
-- ============================================
-- Audit trail for all balance changes (replaces economy_transactions if it exists)

CREATE TABLE IF NOT EXISTS balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- References profiles.id
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdraw', 'reward', 'purchase', 'refund', 'transfer')),
  token_type TEXT NOT NULL CHECK (token_type IN ('OBX', 'cOBX')),
  amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL CHECK (balance_before >= 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  on_chain_signature TEXT, -- Transaction signature if on-chain
  metadata JSONB DEFAULT '{}', -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_balance_tx_player_id ON balance_transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_type ON balance_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_balance_tx_created ON balance_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_tx_player_created ON balance_transactions(player_id, created_at DESC);

-- ============================================
-- PART 4: REWARD TRANSACTION TRACKING
-- ============================================
-- Track all reward mints for analytics and audit

CREATE TABLE IF NOT EXISTS reward_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- References profiles.id
  reward_type TEXT NOT NULL CHECK (reward_type IN ('dungeon', 'quest', 'pvp', 'daily', 'achievement', 'other')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  minted_at TIMESTAMPTZ DEFAULT NOW(),
  on_chain_signature TEXT, -- Mint transaction signature
  metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reward_tx_player_id ON reward_transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_reward_tx_type ON reward_transactions(reward_type);
CREATE INDEX IF NOT EXISTS idx_reward_tx_created ON reward_transactions(minted_at DESC);

-- ============================================
-- PART 5: EXTEND NFTS TABLE FOR TREASURY STORAGE
-- ============================================
-- Add treasury status tracking to existing nfts table
-- (nfts already has: asset_id, player_pda, name, level, stats, etc.)

ALTER TABLE nfts
  -- Treasury storage tracking
  ADD COLUMN IF NOT EXISTS treasury_status TEXT DEFAULT 'treasury' CHECK (treasury_status IN ('treasury', 'withdrawn', 'burned')),
  ADD COLUMN IF NOT EXISTS withdrawn_to TEXT, -- Wallet address if withdrawn
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;

-- Index for treasury queries
CREATE INDEX IF NOT EXISTS idx_nfts_treasury_status ON nfts(treasury_status);
CREATE INDEX IF NOT EXISTS idx_nfts_player_treasury ON nfts(player_pda, treasury_status) WHERE player_pda IS NOT NULL;

-- ============================================
-- PART 6: PLAYER CNFT TRACKING (Character cNFTs)
-- ============================================
-- Track character cNFTs separately from item cNFTs (player_items)
-- This complements the character_cnft_1-5 fields in profiles

CREATE TABLE IF NOT EXISTS player_character_cnfts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- References profiles.id
  asset_id TEXT NOT NULL UNIQUE, -- cNFT asset ID
  tree_address TEXT NOT NULL,
  metadata_uri TEXT,
  status TEXT NOT NULL DEFAULT 'treasury' CHECK (status IN ('treasury', 'withdrawn', 'burned')),
  withdrawn_to TEXT, -- Wallet address if withdrawn
  withdrawn_at TIMESTAMPTZ,
  slot_number INTEGER CHECK (slot_number >= 1 AND slot_number <= 5), -- Which character slot (1-5)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_char_cnfts_player_id ON player_character_cnfts(player_id);
CREATE INDEX IF NOT EXISTS idx_char_cnfts_asset_id ON player_character_cnfts(asset_id);
CREATE INDEX IF NOT EXISTS idx_char_cnfts_status ON player_character_cnfts(status);
CREATE INDEX IF NOT EXISTS idx_char_cnfts_player_status ON player_character_cnfts(player_id, status);

-- Trigger for updated_at
CREATE TRIGGER update_player_character_cnfts_updated_at
  BEFORE UPDATE ON player_character_cnfts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PART 7: MIGRATION HELPER FUNCTIONS
-- ============================================

-- Function to get player_id from player_pda (for migration period)
CREATE OR REPLACE FUNCTION get_player_id_from_pda(p_player_pda TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id
  FROM profiles
  WHERE player_pda = p_player_pda
  LIMIT 1;
  
  RETURN v_player_id;
END;
$$;

-- Function to migrate player_pda references to player_id
-- This helps during the transition period
CREATE OR REPLACE FUNCTION migrate_pda_to_player_id()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- This will be used by migration scripts
  -- For now, just a placeholder
  RAISE NOTICE 'Migration function ready';
END;
$$;

-- ============================================
-- PART 8: BACKWARD COMPATIBILITY VIEWS
-- ============================================
-- Views to help transition from player_pda to player_id

-- View that maps player_pda to player_id for easy queries
CREATE OR REPLACE VIEW player_pda_mapping AS
SELECT 
  id as player_id,
  player_pda,
  wallet_address,
  character_name,
  level,
  wins,
  losses
FROM profiles
WHERE player_pda IS NOT NULL;

-- ============================================
-- PART 9: DATA MIGRATION (Optional - run separately)
-- ============================================
-- Migrate existing data to new structure

DO $$
DECLARE
  profile_record RECORD;
  token_account_record RECORD;
BEGIN
  -- Migrate existing cobx_token_account from profiles to player_token_accounts
  -- Only for profiles that have cobx_token_account but no entry in player_token_accounts
  FOR profile_record IN 
    SELECT id, cobx_token_account
    FROM profiles
    WHERE cobx_token_account IS NOT NULL
      AND id NOT IN (
        SELECT player_id 
        FROM player_token_accounts 
        WHERE mint_address = (SELECT COALESCE(process.env.COBX_MINT_MAINNET, process.env.COBX_MINT_DEVNET)::TEXT)
      )
  LOOP
    -- Note: We need the actual COBX mint address from env, this is a placeholder
    -- The migration script will handle this properly
    RAISE NOTICE 'Profile % has cobx_token_account % that needs migration', 
      profile_record.id, 
      profile_record.cobx_token_account;
  END LOOP;
END $$;

-- ============================================
-- PART 10: COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE player_token_accounts IS 'Server-controlled Token-2022 accounts (replaces PDA token accounts). References profiles.id instead of player_pda.';
COMMENT ON TABLE balance_transactions IS 'Audit trail for all balance changes. References profiles.id instead of player_pda.';
COMMENT ON TABLE reward_transactions IS 'Tracking for all reward mints. References profiles.id instead of player_pda.';
COMMENT ON TABLE player_character_cnfts IS 'Character cNFT ownership tracking (all stored in treasury until withdrawal). References profiles.id instead of player_pda.';
COMMENT ON COLUMN profiles.level IS 'Player level (replaces PDA PlayerAccount.level)';
COMMENT ON COLUMN profiles.wins IS 'PvP wins (replaces PDA PlayerAccount.wins)';
COMMENT ON COLUMN profiles.losses IS 'PvP losses (replaces PDA PlayerAccount.losses)';
COMMENT ON COLUMN profiles.lifetime_obx_earned IS 'Total OBX earned (replaces PDA PlayerAccount.lifetime_obx_earned)';
COMMENT ON COLUMN profiles.lifetime_exp_spent IS 'Total experience spent (replaces PDA PlayerAccount.lifetime_exp_spent)';
COMMENT ON COLUMN profiles.pda_deprecated IS 'Flag indicating PDA is deprecated and player_id should be used instead';
COMMENT ON COLUMN nfts.treasury_status IS 'Treasury storage status: treasury (in treasury wallet), withdrawn (to player wallet), burned';
COMMENT ON COLUMN nfts.withdrawn_to IS 'Wallet address if cNFT was withdrawn from treasury';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check profiles with new fields
-- SELECT id, character_name, level, wins, losses, lifetime_obx_earned, pda_deprecated 
-- FROM profiles 
-- LIMIT 10;

-- Check token accounts created
-- SELECT COUNT(*) as token_account_count, mint_address 
-- FROM player_token_accounts 
-- GROUP BY mint_address;

-- Check balance transactions
-- SELECT transaction_type, COUNT(*) as count, SUM(amount) as total_amount
-- FROM balance_transactions
-- GROUP BY transaction_type;
