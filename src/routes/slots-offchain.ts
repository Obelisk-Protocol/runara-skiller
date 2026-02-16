/**
 * Character Slots API Routes - Off-Chain Version
 * Uses new off-chain services (no PDAs required, mints to treasury)
 */

import { Router } from 'express';
import { verifyAuthToken } from '../utils/auth-helper';
import { pgQuerySingle, pgQuery } from '../utils/pg-helper';
import { z } from 'zod';
import {
  getBalance,
  updateBalance,
  ensureCOBXAccount,
} from '../services/offchain-program';
import {
  getPlayerCNFTs,
  getTreasuryCNFTs,
} from '../services/offchain-program';
import { createCharacterCNFT } from '../services/cnft';

const router = Router();

// Pricing in whole cOBX units (same as original)
const SLOT_PRICES: Record<number, number> = {
  1: 0,
  2: 10_000,
  3: 100_000,
  4: 250_000,
  5: 500_000,
};

// Helper to authenticate user
async function authenticateUser(req: any): Promise<{ userId: string; profile: any }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized - missing or invalid auth header');
  }

  const token = authHeader.substring(7);
  const authResult = await verifyAuthToken(token);
  
  if (authResult.error || !authResult.data?.user) {
    throw new Error('Unauthorized - invalid token');
  }

  const profileResult = await pgQuerySingle<any>(
    'SELECT * FROM profiles WHERE id = $1',
    [authResult.data.user.id]
  );
  
  const profile = profileResult.data;
  const profileError = profileResult.error;

  if (profileError || !profile) {
    throw new Error('Profile not found');
  }

  return { userId: authResult.data.user.id, profile };
}

/**
 * POST /api/character-cnft-slots/mint-offchain
 * Mint character to slot using off-chain services (mints to treasury)
 */
router.post('/mint-offchain', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { slot, characterName, characterClass, customization, characterImage } = req.body;
    
    console.log(`[mint-offchain] Request received:`, {
      slot,
      characterName,
      hasCustomization: !!customization,
      hasCharacterImage: !!characterImage,
      characterImageLength: characterImage ? characterImage.length : 0
    });

    // Validate slot
    if (!slot || slot < 1 || slot > 5) {
      return res.status(400).json({ error: 'Invalid slot' });
    }

    // Validate character name
    if (!characterName || typeof characterName !== 'string') {
      return res.status(400).json({ error: 'Character name is required' });
    }

    const trimmedName = characterName.trim();
    if (trimmedName.length < 1 || trimmedName.length > 16) {
      return res.status(400).json({ error: 'Character name must be 1-16 characters' });
    }

    // Check if slot already has a character
    const field = `character_cnft_${slot}` as const;
    const currentRaw = (profile as any)[field];
    const curStr = (currentRaw == null ? '' : String(currentRaw)).trim();
    const isEmptySentinel = curStr.toUpperCase() === 'EMPTY';
    const hasCharacter = curStr.length > 0 && !isEmptySentinel;

    if (hasCharacter) {
      return res.status(400).json({ error: `Slot ${slot} already has a character` });
    }

    // Determine price
    const price = SLOT_PRICES[slot] ?? 0;
    const needsPayment = price > 0 && !isEmptySentinel;

    // Check and deduct balance if payment needed
    if (needsPayment) {
      // Ensure token account exists (don't fail if creation fails)
      try {
        await ensureCOBXAccount(userId);
      } catch (accountError: any) {
        console.warn('⚠️ Token account creation failed (non-critical):', accountError?.message);
        // Continue - balance will be 0 if account doesn't exist
      }

      const balance = await getBalance(userId, 'cOBX');
      const priceBigInt = BigInt(price) * 10n ** 9n; // Convert to lamports (9 decimals)

      if (balance < priceBigInt) {
        return res.status(400).json({
          error: `Insufficient cOBX. Need ${price.toLocaleString()} cOBX.`
        });
      }

      // Deduct balance from database
      await updateBalance(
        userId,
        'cOBX',
        -priceBigInt,
        'purchase',
        undefined,
        { slot, character_name: trimmedName }
      );

      console.log(`✅ Deducted ${price} cOBX for slot ${slot} payment`);
    }

    // Save customization if provided
    if (customization) {
      try {
        await pgQuery(
          'UPDATE profiles SET character_customization = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(customization), userId]
        );
      } catch (customErr) {
        console.warn('⚠️ Failed to save customization:', customErr);
      }
    }

    // Mint character cNFT to treasury
    // Note: createCharacterCNFT accepts any wallet address as owner, so we can pass treasury wallet
    console.log(`🎯 Creating character cNFT for slot ${slot} (off-chain):`, trimmedName);
    
    // Get treasury wallet address (server wallet)
    const { serverSigner } = await import('../config/solana');
    const treasuryWallet = serverSigner.publicKey.toString();
    
    // Create cNFT to treasury (instead of PDA)
    // Note: createCharacterCNFT will generate and save the character image (PFP) to nfts.character_image_url
    // The image is saved by asset_id (primary key), so it will be retrievable correctly
    let createResult;
    try {
      console.log(`[mint-offchain] Calling createCharacterCNFT with characterImage: ${characterImage ? 'yes (' + characterImage.length + ' chars)' : 'no'}`);
      // Use treasury wallet as the owner (createCharacterCNFT accepts any wallet address)
      // Pass userId for better tracking (even though nfts table doesn't have player_id column yet)
      // Pass characterImage if provided (base64 string from frontend preview)
      createResult = await createCharacterCNFT(treasuryWallet, trimmedName, userId, characterImage);
      console.log(`[mint-offchain] createCharacterCNFT result:`, { success: createResult.success, hasAssetId: !!createResult.assetId, error: createResult.error });
    } catch (error: any) {
      console.error('❌ Character creation failed:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      // Refund if payment was processed
      if (needsPayment) {
        try {
          await updateBalance(
            userId,
            'cOBX',
            BigInt(price) * 10n ** 9n,
            'refund',
            undefined,
            { slot, reason: 'mint_failed' }
          );
          console.log(`✅ Refunded ${price} cOBX due to mint failure`);
        } catch (refundError) {
          console.error('❌ Failed to refund:', refundError);
        }
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to create character',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    console.log(`[mint-offchain] createCharacterCNFT returned:`, {
      success: createResult.success,
      assetId: createResult.assetId,
      hasAssetId: !!createResult.assetId,
      error: createResult.error,
      signature: createResult.signature
    });

    if (!createResult.success || !createResult.assetId) {
      console.error('❌ Character creation returned failure:', createResult.error);
      console.error('❌ createResult object:', JSON.stringify(createResult, null, 2));
      // Refund if payment was processed
      if (needsPayment) {
        await updateBalance(
          userId,
          'cOBX',
          BigInt(price) * 10n ** 9n,
          'refund',
          undefined,
          { slot, reason: 'mint_failed' }
        );
      }
      return res.status(500).json({
        success: false,
        error: createResult.error || 'Failed to create character',
        details: `createResult.success=${createResult.success}, hasAssetId=${!!createResult.assetId}`
      });
    }

    const assetId = createResult.assetId;
    console.log(`[mint-offchain] Using assetId: ${assetId}`);

    // Character image (PFP) has been saved to nfts.character_image_url by asset_id
    // It can be retrieved by querying: SELECT character_image_url FROM nfts WHERE asset_id = $1
    console.log(`✅ Character image (PFP) saved to database for asset_id: ${assetId}`);

    // Get merkle tree address for storage
    const { MERKLE_TREE } = await import('../config/solana');
    
    // Store cNFT in player_character_cnfts table
    try {
      await pgQuery(
        `INSERT INTO player_character_cnfts (player_id, asset_id, tree_address, metadata_uri, status, slot_number)
         VALUES ($1, $2, $3, $4, 'treasury', $5)
         ON CONFLICT (asset_id) DO UPDATE SET
           player_id = EXCLUDED.player_id,
           slot_number = EXCLUDED.slot_number,
           updated_at = NOW()`,
        [
          userId,
          assetId,
          MERKLE_TREE,
          null, // Metadata URI stored separately in nft_metadata table
          slot
        ]
      );
    } catch (dbError: any) {
      console.error('❌ Failed to store cNFT in database:', dbError);
      // Don't fail - cNFT was created, just tracking failed
    }

    // Update profile with asset ID + set active slot if none is set
    console.log(`[mint-offchain] Updating profile ${userId} field ${field} with assetId: ${assetId}`);
    const needsActiveSlot = !profile.active_character_slot;
    const updateSql = needsActiveSlot
      ? `UPDATE profiles SET ${field} = $1, active_character_slot = $3, updated_at = NOW() WHERE id = $2`
      : `UPDATE profiles SET ${field} = $1, updated_at = NOW() WHERE id = $2`;
    const updateParams = needsActiveSlot
      ? [assetId, userId, slot]
      : [assetId, userId];
    const updateResult = await pgQuery(updateSql, updateParams);
    if (needsActiveSlot) {
      console.log(`✅ Set active_character_slot = ${slot} (first character)`);
    }
    
    if (updateResult.error) {
      console.error(`❌ Failed to update profile with assetId:`, updateResult.error);
      // Don't fail the request - cNFT was created, just tracking failed
    } else {
      console.log(`✅ Profile updated successfully: ${field} = ${assetId}`);
      
      // Verify the update worked
      const verifyResult = await pgQuerySingle<any>(
        `SELECT ${field} FROM profiles WHERE id = $1`,
        [userId]
      );
      if (verifyResult.data) {
        const actualValue = (verifyResult.data as any)[field];
        console.log(`[mint-offchain] Verified profile update: ${field} = "${actualValue}"`);
        if (actualValue !== assetId) {
          console.error(`❌ Profile update verification failed! Expected "${assetId}", got "${actualValue}"`);
        }
      }
    }

    console.log(`✅ Character cNFT created and stored in treasury: ${assetId}`);

    return res.json({
      success: true,
      assetId,
      slot,
      transaction: createResult.transaction,
      message: 'Character created successfully (stored in treasury)'
    });

  } catch (error: any) {
    console.error('❌ Slot mint error (off-chain):', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/character-cnft-slots/offchain
 * Get slots for player (off-chain version)
 */
router.get('/offchain', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    
    // Get cNFTs from treasury for this player
    const treasuryCNFTs = await getTreasuryCNFTs(userId);
    
    // Build slots array
    const slots = [1, 2, 3, 4, 5].map(i => {
      const field = `character_cnft_${i}` as const;
      const raw = (profile as any)[field];
      const rawStr = (raw == null ? '' : String(raw)).trim().toUpperCase();
      const isEmpty = rawStr === '' || rawStr === 'EMPTY' || rawStr === 'NULL';
      const isPurchased = rawStr === 'EMPTY';
      
      // Find matching cNFT in treasury
      const cnft = treasuryCNFTs.find(c => c.slot_number === i);
      
      return {
        slot: i,
        assetId: isEmpty ? null : raw,
        purchased: isPurchased,
        inTreasury: !!cnft,
        treasuryStatus: cnft?.status || null,
      };
    });
    
    return res.json({
      success: true,
      slots,
      activeSlot: profile.active_character_slot || null,
      treasuryCNFTs: treasuryCNFTs.length,
    });
  } catch (error: any) {
    console.error('❌ Slots get error (off-chain):', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
