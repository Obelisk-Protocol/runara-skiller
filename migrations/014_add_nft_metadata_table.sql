-- Migration: Add nft_metadata table for storing NFT metadata JSON
-- This replaces Arweave storage with local database storage

CREATE TABLE IF NOT EXISTS public.nft_metadata (
  asset_id TEXT PRIMARY KEY,
  metadata_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_nft_metadata_asset_id ON public.nft_metadata(asset_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_nft_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_nft_metadata_updated_at
  BEFORE UPDATE ON public.nft_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_nft_metadata_updated_at();

-- Add comment
COMMENT ON TABLE public.nft_metadata IS 'Stores NFT metadata JSON for character cNFTs. Replaces Arweave storage for faster and more reliable access.';

