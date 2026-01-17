import { Router } from 'express'
// Supabase removed - use PostgreSQL via pg-helper
import { pgQuerySingle, pgQuery } from '../utils/pg-helper'
import { verifyAuthToken } from '../utils/auth-helper'
import { connection, serverKeypair, getCobxMint } from '../config/anchor'
import { getAccount, getMint, createBurnInstruction } from '@solana/spl-token'
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey, Transaction } from '@solana/web3.js'
import { createCharacterCNFT, findLatestAssetIdForOwner, generateDefaultCharacterStats } from '../services/cnft'
import { NftColumns } from '../services/database'

const router = Router()

// Pricing in whole cOBX units
const SLOT_PRICES: Record<number, number> = {
  1: 0,
  2: 10_000,
  3: 100_000,
  4: 250_000,
  5: 500_000,
}

// Helper to authenticate user from JWT token
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

// POST /api/slots/mint - Mint character to slot with payment
router.post('/mint', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { slot, characterName, characterClass } = req.body;

    if (!slot || slot < 1 || slot > 5) {
      return res.status(400).json({ error: 'Invalid slot' });
    }

    if (!profile.player_pda) {
      return res.status(400).json({ error: 'Missing player PDA. Initialize your player first.' });
    }

    // Validate character name
    if (!characterName || typeof characterName !== 'string') {
      return res.status(400).json({ error: 'Character name is required' });
    }

    const trimmedName = characterName.trim();
    if (trimmedName.length < 1 || trimmedName.length > 16) {
      return res.status(400).json({ error: 'Character name must be 1-16 characters' });
    }

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

    if (needsPayment) {
      // Check cOBX balance
      const COBX_MINT = getCobxMint();
      let playerCOBXAccount: PublicKey;

      if (profile.cobx_token_account) {
        playerCOBXAccount = new PublicKey(profile.cobx_token_account);
      } else {
        return res.status(400).json({
          error: 'cOBX token account not found. Please create a token account first.'
        });
      }

      try {
        const tokenAcc = await getAccount(
          connection,
          playerCOBXAccount,
          'confirmed',
          TOKEN_2022_PROGRAM_ID
        );

        if (!tokenAcc) {
          return res.status(404).json({
            error: 'cOBX account not found on blockchain'
          });
        }

        const mintInfo = await getMint(connection, COBX_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID as any);
        const decimals = Number((mintInfo as any).decimals ?? 9);
        const currentBalance = Number(tokenAcc.amount) / Math.pow(10, decimals);
        const priceLamports = price * Math.pow(10, decimals);

        if (currentBalance < price) {
          return res.status(400).json({
            error: `Insufficient cOBX. Need ${price.toLocaleString()} cOBX.`
          });
        }

        // Verify server is the authority
        if (!tokenAcc.owner.equals(serverKeypair.publicKey)) {
          return res.status(400).json({
            error: 'Your cOBX balance is wallet-owned. Move funds to game balance first via Character Slots → Deposit.'
          });
        }

        // Burn cOBX tokens
        console.log(`🔥 Burning ${price} cOBX for slot ${slot} payment...`);
        const burnAmount = Math.floor(price * Math.pow(10, decimals));

        const burnInstruction = createBurnInstruction(
          playerCOBXAccount,
          COBX_MINT,
          serverKeypair.publicKey,
          burnAmount,
          [],
          TOKEN_2022_PROGRAM_ID
        );

        const transaction = new Transaction().add(burnInstruction);
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = serverKeypair.publicKey;

        transaction.sign(serverKeypair);
        const burnSignature = await connection.sendRawTransaction(transaction.serialize());
        await connection.confirmTransaction(burnSignature, 'confirmed');

        console.log(`✅ Payment successful: ${burnSignature}`);
      } catch (error: any) {
        console.error('Failed to process payment:', error);
        return res.status(500).json({
          error: 'Payment failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Create character cNFT
    console.log(`🎯 Creating character cNFT for slot ${slot}:`, trimmedName);
    
    let createResult;
    try {
      createResult = await createCharacterCNFT(profile.player_pda, trimmedName);
    } catch (error: any) {
      console.error('❌ Character creation failed:', error);
      // If payment was processed, we can't refund, so return error but log it
      if (needsPayment) {
        console.error('⚠️ Payment was processed but character creation failed. Payment cannot be refunded.');
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to create character',
        details: error instanceof Error ? error.message : 'Unknown error',
        paymentProcessed: needsPayment
      });
    }

    if (!createResult.success) {
      console.error('❌ Character creation returned failure:', createResult.error);
      if (needsPayment) {
        console.error('⚠️ Payment was processed but character creation failed. Payment cannot be refunded.');
      }
      return res.status(500).json({
        success: false,
        error: createResult.error || 'Failed to create character',
        paymentProcessed: needsPayment
      });
    }

    // Try to resolve assetId immediately if missing using Helius (fast) or RPC log heuristic
    let resolvedId: string | undefined = createResult.assetId;
    if (!resolvedId && (createResult as any).signature) {
      try {
        const base = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/$/, '');
        // Prefer Helius resolver
        const hRes = await fetch(`${base}/api/das/resolve-from-signature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature: (createResult as any).signature, playerPDA: profile.player_pda })
        });
        const hJson: any = await hRes.json().catch(() => ({}));
        if (hRes.ok && hJson?.assetId) {
          resolvedId = hJson.assetId;
          console.log('🆔 Immediate resolve via Helius in slots route:', resolvedId);
        } else {
          // Fall back to RPC log heuristic
          const xRes = await fetch(`${base}/api/das/extract-asset-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signature: (createResult as any).signature, playerPDA: profile.player_pda })
          });
          const xJson: any = await xRes.json().catch(() => ({}));
          if (xRes.ok && xJson?.assetId) {
            resolvedId = xJson.assetId;
            console.log('🆔 Immediate resolve via RPC heuristic in slots route:', resolvedId);
          }
        }
      } catch (e) {
        console.warn('⚠️ Immediate resolve failed in slots route:', e);
      }
    }

    // Save to database
    if (resolvedId) {
      // Seed authoritative DB row so UI can read from DB immediately
      try {
        const seedStats = generateDefaultCharacterStats(trimmedName);
        await NftColumns.upsertMergeMaxFromStats(
          resolvedId,
          profile.player_pda,
          seedStats,
          null,
          (createResult as any)?.signature || null
        );
        console.log('✅ Saved character stats to nfts table');
      } catch (seedErr) {
        console.warn('⚠️ Failed to seed nfts row:', seedErr);
      }

      // Update profiles table with assetId in the correct slot
      try {
        const profileResult = await pgQuerySingle<any>(
          'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot FROM profiles WHERE player_pda = $1',
          [profile.player_pda]
        );
        const updatedProfile = profileResult.data;
        const fetchError = profileResult.error;

        if (updatedProfile && !fetchError) {
          // Helper: treat null/''/'EMPTY'/'NULL' as empty
          const isEmpty = (v: any) => {
            const s = (v == null ? '' : String(v)).trim().toUpperCase();
            return s === '' || s === 'EMPTY' || s === 'NULL';
          };

          const slotKey = `character_cnft_${slot}` as const;
          const updateData: any = {};

          // Verify slot is still empty (double-check)
          if (isEmpty((updatedProfile as any)[slotKey])) {
            (updateData as any)[slotKey] = resolvedId;

            // Set active slot if not already set
            if (!updatedProfile.active_character_slot) {
              updateData.active_character_slot = slot;
            }

            const updateKeys = Object.keys(updateData);
            const updateValues = Object.values(updateData);
            const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
            const { error: updateError } = await pgQuery(
              `UPDATE profiles SET ${setClause} WHERE player_pda = $${updateKeys.length + 1}`,
              [...updateValues, profile.player_pda]
            );

            if (updateError) {
              console.error('⚠️ Failed to update Supabase with asset ID:', updateError);
              // Return partial success - character was created but database update failed
              return res.json({
                success: true,
                assetId: resolvedId,
                slot,
                price,
                warning: 'Character created but database update failed. Please contact support.',
                signature: (createResult as any)?.signature
              });
            } else {
              console.log('✅ Updated database with asset ID:', resolvedId, 'in slot', slot);
            }
          } else {
            console.error('⚠️ Slot was occupied during character creation');
            return res.status(500).json({
              success: false,
              error: 'Slot was occupied during character creation',
              assetId: resolvedId
            });
          }
        } else {
          console.error('⚠️ Could not find profile for PDA:', profile.player_pda);
          // Return partial success - character was created but profile not found
          return res.json({
            success: true,
            assetId: resolvedId,
            slot,
            price,
            warning: 'Character created but profile not found for database update.',
            signature: (createResult as any)?.signature
          });
        }
      } catch (supabaseError) {
        console.error('⚠️ Supabase update error:', supabaseError);
        // Return partial success - character was created but database update failed
        return res.json({
          success: true,
          assetId: resolvedId,
          slot,
          price,
          warning: 'Character created but database update failed.',
          signature: (createResult as any)?.signature
        });
      }
    } else {
      // Background resolve + save once DAS returns the real assetId
      console.log('⏳ AssetId not immediately resolved, starting background resolution...');
      (async () => {
        try {
          const timeoutMs = Number(process.env.DAS_BACKGROUND_TIMEOUT_MS || 120000);
          const intervalMs = Number(process.env.DAS_BACKGROUND_INTERVAL_MS || 5000);
          const start = Date.now();
          let resolved: string | null = null;
          while (Date.now() - start < timeoutMs) {
            resolved = await findLatestAssetIdForOwner(profile.player_pda);
            if (resolved) break;
            await new Promise(r => setTimeout(r, intervalMs));
          }
          if (!resolved) {
            console.warn('⚠️ Background resolve timed out; nothing saved to database');
            return;
          }
          // Seed DB row
          try {
            const seedStats = generateDefaultCharacterStats(trimmedName);
            await NftColumns.upsertMergeMaxFromStats(
              resolved,
              profile.player_pda,
              seedStats,
              null,
              (createResult as any)?.signature || null
            );
          } catch (seedErr) {
            console.warn('⚠️ Background seed nfts row failed:', seedErr);
          }
          // Update profile
          const profileDataResult = await pgQuerySingle<any>(
            'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot FROM profiles WHERE player_pda = $1',
            [profile.player_pda]
          );
          const profileData = profileDataResult.data;
          const fetchError = profileDataResult.error;
          if (fetchError || !profileData) {
            console.error('⚠️ Background database fetch error:', fetchError);
            return;
          }
          const isEmpty = (v: any) => {
            const s = (v == null ? '' : String(v)).trim().toUpperCase();
            return s === '' || s === 'EMPTY' || s === 'NULL';
          };
          const slotKey = `character_cnft_${slot}` as const;
          if (isEmpty((profileData as any)[slotKey])) {
            const updateData: any = {};
            (updateData as any)[slotKey] = resolved;
            if (!profileData.active_character_slot) {
              updateData.active_character_slot = slot;
            }
            const updateKeys = Object.keys(updateData);
            const updateValues = Object.values(updateData);
            const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
            const { error: updateError } = await pgQuery(
              `UPDATE profiles SET ${setClause} WHERE player_pda = $${updateKeys.length + 1}`,
              [...updateValues, profile.player_pda]
            );
            if (updateError) {
              console.error('⚠️ Background database update error:', updateError);
            } else {
              console.log('✅ Background saved resolved assetId to database:', resolved);
            }
          }
        } catch (bgErr) {
          console.error('⚠️ Background resolve/save error:', bgErr);
        }
      })();
    }

    // Return success response
    // Note: assetId may be undefined if not immediately resolved, but background process will save it
    return res.json({
      success: true,
      assetId: resolvedId || undefined,
      slot,
      price,
      message: resolvedId
        ? (needsPayment
            ? `Character created successfully. ${price.toLocaleString()} cOBX paid.`
            : 'Character created successfully.')
        : 'Character created successfully. Asset ID is being resolved in the background.',
      signature: (createResult as any)?.signature
    });

  } catch (error: any) {
    console.error('❌ Slot mint error:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/slots - fetch slots and active slot for authenticated user
router.get('/', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    
    const slots = [1, 2, 3, 4, 5].map(i => ({
      slot: i,
      assetId: (profile as any)[`character_cnft_${i}`] || null
    }));
    
    return res.json({
      success: true,
      slots,
      activeSlot: profile.active_character_slot || null
    });
  } catch (error: any) {
    console.error('❌ slots get error:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// GET /api/slots/:playerIdOrPDA - fetch slots and active slot
router.get('/:player', async (req: any, res: any) => {
  try {
    const player = req.params.player
    if (!player) return res.status(400).json({ success: false, error: 'Missing player' })
    // try by id then by player_pda
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let profileResult = await pgQuerySingle<any>(
      'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot FROM profiles WHERE id = $1',
      [player]
    );
    let profile = profileResult.data;
    if (!profile) {
      const altResult = await pgQuerySingle<any>(
        'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot FROM profiles WHERE player_pda = $1',
        [player]
      );
      profile = altResult.data as any;
    }
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' })
    const slots = [1,2,3,4,5].map(i => ({
      slot: i,
      assetId: (profile as any)[`character_cnft_${i}`] || null
    }))
    return res.json({ success: true, slots, activeSlot: profile.active_character_slot })
  } catch (err) {
    console.error('❌ slots get error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// POST /api/slots - { action: 'add'|'remove'|'setActive', player, slot?, assetId? }
router.post('/', async (req: any, res: any) => {
  try {
    const { action, player, slot, assetId } = req.body || {}
    if (!action || !player) return res.status(400).json({ success: false, error: 'Missing action or player' })
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idFilter = { col: uuidPattern.test(player) ? 'id' : 'player_pda', val: player };
    let profileResult = await pgQuerySingle<any>(
      `SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot FROM profiles WHERE ${idFilter.col} = $1`,
      [idFilter.val]
    );
    let profile = profileResult.data;
    if (!profile) {
      const altResult = await pgQuerySingle<any>(
        'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot FROM profiles WHERE player_pda = $1',
        [player]
      );
      profile = altResult.data as any;
    }
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' })

    if (action === 'add') {
      if (!assetId) return res.status(400).json({ success: false, error: 'assetId required' })
      const updateData: any = {}
      if (!profile.character_cnft_1) updateData.character_cnft_1 = assetId
      else if (!profile.character_cnft_2) updateData.character_cnft_2 = assetId
      else if (!profile.character_cnft_3) updateData.character_cnft_3 = assetId
      else if (!profile.character_cnft_4) updateData.character_cnft_4 = assetId
      else if (!profile.character_cnft_5) updateData.character_cnft_5 = assetId
      if (Object.keys(updateData).length === 0) return res.status(400).json({ success: false, error: 'All character slots are full' })
      if (!profile.active_character_slot) updateData.active_character_slot = Number(Object.keys(updateData)[0].split('_').pop())
      const updateKeys = Object.keys(updateData);
      const updateValues = Object.values(updateData);
      const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
      await pgQuery(
        `UPDATE profiles SET ${setClause} WHERE id = $${updateKeys.length + 1} OR player_pda = $${updateKeys.length + 2}`,
        [...updateValues, player, player]
      )
      return res.json({ success: true, message: 'Character added to slot' })
    }

    if (action === 'remove') {
      if (!slot || slot < 1 || slot > 5) return res.status(400).json({ success: false, error: 'Invalid slot' })
      const updateData: any = {}
      updateData[`character_cnft_${slot}`] = null
      if (profile.active_character_slot === slot) updateData.active_character_slot = null
      const updateKeys = Object.keys(updateData);
      const updateValues = Object.values(updateData);
      const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
      await pgQuery(
        `UPDATE profiles SET ${setClause} WHERE id = $${updateKeys.length + 1} OR player_pda = $${updateKeys.length + 2}`,
        [...updateValues, player, player]
      )
      return res.json({ success: true, message: `Character removed from slot ${slot}` })
    }

    if (action === 'setActive') {
      if (!slot || slot < 1 || slot > 5) return res.status(400).json({ success: false, error: 'Invalid slot' })
      if (!(profile as any)[`character_cnft_${slot}`]) return res.status(400).json({ success: false, error: 'No character in that slot' })
      await pgQuery(
        'UPDATE profiles SET active_character_slot = $1 WHERE id = $2 OR player_pda = $2',
        [slot, player]
      )
      return res.json({ success: true, activeSlot: slot })
    }

    return res.status(400).json({ success: false, error: 'Invalid action' })
  } catch (err) {
    console.error('❌ slots post error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

export default router


