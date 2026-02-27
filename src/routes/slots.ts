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

// DELETED: /mint - Use /api/character-cnft-slots/mint-offchain instead (off-chain, no PDAs)

// GET /api/slots/debug - Diagnostic endpoint to check NFT ownership
router.get('/debug', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    
    // Get all NFTs in treasury
    const { serverSigner } = await import('../config/solana');
    const treasuryWallet = serverSigner.publicKey.toString();
    
    const nftsResult = await pgQuery<any>(
      `SELECT asset_id, name, player_pda, character_image_url, created_at 
       FROM nfts 
       WHERE player_pda = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [treasuryWallet]
    );
    
    // Get player_character_cnfts for this user
    const playerCNFTs = await pgQuery<any>(
      `SELECT asset_id, slot_number, status, created_at 
       FROM player_character_cnfts 
       WHERE player_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    
    // Get all profiles with username "Sadness"
    const sadnessProfiles = await pgQuery<any>(
      `SELECT id, username, character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5
       FROM profiles 
       WHERE username ILIKE $1`,
      ['%sadness%']
    );
    
    return res.json({
      success: true,
      currentUser: {
        id: userId,
        username: profile.username,
        character_cnft_1: profile.character_cnft_1,
        character_cnft_2: profile.character_cnft_2,
        character_cnft_3: profile.character_cnft_3,
        character_cnft_4: profile.character_cnft_4,
        character_cnft_5: profile.character_cnft_5,
      },
      treasuryNFTs: nftsResult.data || [],
      playerCNFTs: playerCNFTs.data || [],
      sadnessProfiles: sadnessProfiles.data || [],
      treasuryWallet,
    });
  } catch (error: any) {
    console.error('❌ Debug endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// GET /api/slots - fetch slots and active slot for authenticated user
router.get('/', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    
    // Simple: just use the profile from authenticateUser - it already has all the data we need
    const slots = [1, 2, 3, 4, 5].map(i => {
      const field = `character_cnft_${i}` as const;
      const raw = (profile as any)[field];
      const rawStr = (raw == null ? '' : String(raw)).trim().toUpperCase();
      const isEmpty = rawStr === '' || rawStr === 'EMPTY' || rawStr === 'NULL';
      const isPurchased = rawStr === 'EMPTY'; // EMPTY sentinel means purchased but not yet minted
      
      // Return null for empty/purchased slots, actual assetId for minted characters
      const assetId = (raw && raw !== 'EMPTY' && raw !== 'NULL') ? raw : null;
      
      return {
        slot: i,
        assetId: assetId,
        purchased: isPurchased
      };
    });
    
    return res.json({
      success: true,
      slots,
      activeSlot: profile.active_character_slot || null,
      playerPDA: profile.player_pda || null
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
    // Auth is required for all slot mutations. We derive the player/profile from the token,
    // rather than trusting a client-provided `player` value.
    const { userId, profile } = await authenticateUser(req);

    const { action, slot, assetId } = req.body || {}
    if (!action) return res.status(400).json({ success: false, error: 'Missing action' })

    // Use profile id as the canonical "player" identifier for DB updates
    const player = userId;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idFilter = { col: uuidPattern.test(player) ? 'id' : 'player_pda', val: player };

    // `authenticateUser` already loaded the full profile row, but ensure the fields we use exist.
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

    // action === 'purchase' unlocks an empty slot (2-5) by marking it as EMPTY and (if needed) burning cOBX.
    // This matches the client UX where a user buys a slot before minting into it.
    if (action === 'purchase') {
      if (!slot || slot < 1 || slot > 5) return res.status(400).json({ success: false, error: 'Invalid slot' })

      const field = `character_cnft_${slot}` as const;
      const currentRaw = (profile as any)[field];
      const curStr = (currentRaw == null ? '' : String(currentRaw)).trim().toUpperCase();
      const isEmpty = curStr === '' || curStr === 'EMPTY' || curStr === 'NULL';

      // If already purchased (EMPTY sentinel) or occupied, do not charge again
      if (curStr === 'EMPTY') {
        return res.json({ success: true, slot, purchased: true, message: 'Slot already purchased' })
      }
      if (!isEmpty && curStr !== 'EMPTY') {
        return res.status(400).json({ success: false, error: `Slot ${slot} already has a character` })
      }

      const price = SLOT_PRICES[slot] ?? 0;
      const needsPayment = price > 0;

      if (needsPayment) {
        const COBX_MINT = getCobxMint();
        let playerCOBXAccount: PublicKey;

        if (profile.cobx_token_account) {
          playerCOBXAccount = new PublicKey(profile.cobx_token_account);
        } else {
          return res.status(400).json({
            success: false,
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
              success: false,
              error: 'cOBX account not found on blockchain'
            });
          }

          const mintInfo = await getMint(connection, COBX_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID as any);
          const decimals = Number((mintInfo as any).decimals ?? 9);
          const currentBalance = Number(tokenAcc.amount) / Math.pow(10, decimals);

          if (currentBalance < price) {
            return res.status(400).json({
              success: false,
              error: `Insufficient cOBX. Need ${price.toLocaleString()} cOBX.`
            });
          }

          // Verify server is the authority
          if (!tokenAcc.owner.equals(serverKeypair.publicKey)) {
            return res.status(400).json({
              success: false,
              error:
                'Your cOBX balance is wallet-owned. Move funds to game balance first via Character Slots → Deposit.'
            });
          }

          // Burn cOBX tokens
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
        } catch (error: any) {
          console.error('Failed to process slot purchase payment:', error);
          return res.status(500).json({
            success: false,
            error: 'Payment failed',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Mark slot as purchased with sentinel
      const updateData: any = {};
      updateData[field] = 'EMPTY';
      const updateKeys = Object.keys(updateData);
      const updateValues = Object.values(updateData);
      const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');

      await pgQuery(
        `UPDATE profiles SET ${setClause} WHERE ${idFilter.col} = $${updateKeys.length + 1}`,
        [...updateValues, idFilter.val]
      );

      return res.json({
        success: true,
        slot,
        purchased: true,
        price,
        message: price > 0 ? `Slot purchased successfully. ${price.toLocaleString()} cOBX paid.` : 'Slot purchased.'
      });
    }

    return res.status(400).json({ success: false, error: 'Invalid action' })
  } catch (err) {
    console.error('❌ slots post error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(msg.includes('Unauthorized') ? 401 : 500).json({
      success: false,
      error: msg.includes('Unauthorized') ? msg : 'Internal server error'
    })
  }
})

export default router


