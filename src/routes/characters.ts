import { Router } from 'express';
import crypto from 'crypto'
import { z } from 'zod';
import { createCharacterCNFT, updateCharacterCNFT, fetchCharacterFromCNFT, findLatestAssetIdForOwner, getAssetMetadataDebug, generateDefaultCharacterStats } from '../services/cnft';
import { CharacterService } from '../services/character';
import { MetadataStore, NftColumns } from '../services/database';
import { supabase } from '../config/database';

const router = Router();

// POST /api/characters/clear-slot-after-withdraw
router.post('/clear-slot-after-withdraw', async (req: any, res: any) => {
  try {
    const schema = z.object({
      playerPDA: z.string(),
      assetId: z.string(),
    })
    const { playerPDA, assetId } = schema.parse(req.body || {})
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5')
      .eq('player_pda', playerPDA)
      .single()
    if (fetchError || !profile) return res.status(404).json({ success: false, error: 'Profile not found' })

    const update: any = {}
    for (let i = 1 as 1|2|3|4|5; i <= 5; i++) {
      const key = `character_cnft_${i}` as const
      if ((profile as any)[key] === assetId) update[key] = null
    }
    if (Object.keys(update).length === 0) return res.json({ success: true, updated: false })
    const { error: updErr } = await supabase
      .from('profiles')
      .update(update)
      .eq('player_pda', playerPDA)
    if (updErr) return res.status(500).json({ success: false, error: updErr.message })
    return res.json({ success: true, updated: true })
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || 'Invalid request' })
  }
})
import { addSkillXp, getAllSkillXp, getXpBounds, computeProgress } from '../services/nft-skill-experience';

// Lightweight XP action rules. Keep server-authoritative, don't trust client-provided XP.
const XP_ACTION_RULES = {
  enemy_kill_basic: { skill: 'attack', baseXp: 25 },
  enemy_kill_magic: { skill: 'magic', baseXp: 25 },
  enemy_kill_ranged: { skill: 'projectiles', baseXp: 25 },
  boss_kill: { skill: 'attack', baseXp: 500 },
  gather_resource: { skill: 'gathering', baseXp: 15 },
  craft_item_common: { skill: 'crafting', baseXp: 40 },
  craft_item_rare: { skill: 'crafting', baseXp: 120 },
  complete_dungeon: { skill: 'vitality', baseXp: 300 },
  perfect_clear: { skill: 'defense', baseXp: 200 },
  luck_find: { skill: 'luck', baseXp: 30 },
} as const
type XpActionKey = keyof typeof XP_ACTION_RULES


// Validation schemas
const CreateCharacterSchema = z.object({
  playerPDA: z.string(),
  characterName: z.string().min(1).max(50),
  characterClass: z.string().optional().default('Adventurer'),
  slot: z.number().int().min(1).max(5).optional()
});

const UpdateCNFTMetadataSchema = z.object({
  assetId: z.string(),
  characterStats: z.object({
    name: z.string(),
    level: z.number(),
    combatLevel: z.number(),
    totalLevel: z.number(),
    characterClass: z.string(),
    version: z.string(),
    stats: z.object({
      str: z.number(),
      agi: z.number(),
      int: z.number(),
      vit: z.number(),
      luk: z.number()
    }),
    experience: z.number(),
    skills: z.object({
      attack: z.object({ level: z.number(), experience: z.number() }),
      strength: z.object({ level: z.number(), experience: z.number() }),
      defense: z.object({ level: z.number(), experience: z.number() }),
      magic: z.object({ level: z.number(), experience: z.number() }),
      projectiles: z.object({ level: z.number(), experience: z.number() }),
      vitality: z.object({ level: z.number(), experience: z.number() }),
      crafting: z.object({ level: z.number(), experience: z.number() }),
      luck: z.object({ level: z.number(), experience: z.number() }),
      gathering: z.object({ level: z.number(), experience: z.number() })
    }),
    skillExperience: z.object({
      attack: z.number(),
      strength: z.number(),
      defense: z.number(),
      magic: z.number(),
      projectiles: z.number(),
      vitality: z.number(),
      crafting: z.number(),
      luck: z.number(),
      gathering: z.number()
    }),
    achievements: z.array(z.string()),
    equipment: z.object({
      weapon: z.string(),
      armor: z.string(),
      accessory: z.string()
    })
  }),
  playerPDA: z.string().optional()
});

const FetchPlayerCNFTsSchema = z.object({
  playerId: z.string()
});

const InventoryUnionSchema = z.object({
  playerPDA: z.string().min(32),
  serverEscrow: z.string().min(32).optional(),
});

const AssignSlotAfterDepositSchema = z.object({
  playerPDA: z.string().min(32),
  assetId: z.string().min(32),
  slot: z.number().int().min(1).max(5).optional()
});

const TrainSkillSchema = z.object({
  assetId: z.string(),
  skillName: z.enum(['attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality', 'crafting', 'luck', 'gathering']),
  playerPDA: z.string().optional()
});

const AddSkillXpSchema = z.object({
  assetId: z.string(),
  skillName: z.enum(['attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality', 'crafting', 'luck', 'gathering']),
  xpGain: z.number().min(1),
  playerPDA: z.string().optional(),
  source: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  gameMode: z.string().optional(),
  additionalData: z.any().optional(),
  idempotencyKey: z.string().optional(),
});

const AwardActionSchema = z.object({
  assetId: z.string(),
  actionKey: z.enum(Object.keys(XP_ACTION_RULES) as [XpActionKey, ...XpActionKey[]]),
  quantity: z.number().int().positive().optional(),
  difficultyMultiplier: z.number().positive().optional(),
  playerPDA: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  gameMode: z.string().optional(),
  idempotencyKey: z.string().optional(),
})

// --- Security helpers ---
function hasValidApiKey(req: any): boolean {
  const expected = process.env.XP_API_KEY
  if (!expected) return false
  const provided = req.get('x-api-key') || req.get('X-API-Key')
  return Boolean(provided && provided === expected)
}

function verifyHmacSignature(payload: string, signature: string | undefined): boolean {
  const secret = process.env.XP_SIGNING_SECRET
  if (!secret || !signature) return false
  const h = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(signature))
  } catch {
    return false
  }
}

async function assertAssetOwnedByPda(assetId: string, playerPDA?: string | null) {
  const row = await NftColumns.get(assetId)
  if (!row) throw new Error('Unknown assetId')
  if (playerPDA && row.player_pda && row.player_pda !== playerPDA) {
    throw new Error('Asset ownership mismatch')
  }
}

const LevelUpStatSchema = z.object({
  assetId: z.string(),
  statName: z.enum(['str', 'agi', 'int', 'vit', 'luk']),
  playerPDA: z.string().optional()
});

// POST /api/characters/create
router.post('/create', async (req: any, res: any) => {
  try {
    const { playerPDA, characterName, characterClass, slot } = CreateCharacterSchema.parse(req.body);
    
    console.log('🎯 Creating character:', { playerPDA, characterName, characterClass });
    
    const result = await createCharacterCNFT(playerPDA, characterName, characterClass);
    
    if (result.success) {
      // Try to resolve assetId immediately if missing using Helius (fast) or RPC log heuristic
      let resolvedId: string | undefined = result.assetId
      if (!resolvedId && (result as any).signature) {
        try {
          const base = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/$/, '')
          // Prefer Helius resolver
          const hRes = await fetch(`${base}/api/das/resolve-from-signature`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signature: (result as any).signature, playerPDA })
          })
          const hJson: any = await hRes.json().catch(() => ({}))
          if (hRes.ok && hJson?.assetId) {
            resolvedId = hJson.assetId
            console.log('🆔 Immediate resolve via Helius in route:', resolvedId)
          } else {
            // Fall back to RPC log heuristic
            const xRes = await fetch(`${base}/api/das/extract-asset-id`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signature: (result as any).signature, playerPDA })
            })
            const xJson: any = await xRes.json().catch(() => ({}))
            if (xRes.ok && xJson?.assetId) {
              resolvedId = xJson.assetId
              console.log('🆔 Immediate resolve via RPC heuristic in route:', resolvedId)
            }
          }
        } catch (e) {
          console.warn('⚠️ Immediate resolve failed in route:', e)
        }
      }

      // Update Supabase with the asset ID (slot 1 if empty)
      if (resolvedId) {
        // Seed authoritative DB row so UI can read from DB immediately
        try {
          const seedStats = generateDefaultCharacterStats(characterName, characterClass || 'Adventurer')
          await NftColumns.upsertMergeMaxFromStats(resolvedId, playerPDA, seedStats, null, (result as any)?.signature || null)
        } catch (seedErr) {
          console.warn('⚠️ Failed to seed nfts row:', seedErr)
        }
        try {
          // Find the player by PDA and update with the new character asset ID
          const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot')
            .eq('player_pda', playerPDA)
            .single();
          
          if (profile && !fetchError) {
            // Helper: treat null/''/'EMPTY'/'NULL' as empty
            const isEmpty = (v: any) => {
              const s = (v == null ? '' : String(v)).trim().toUpperCase()
              return s === '' || s === 'EMPTY' || s === 'NULL'
            }
            // Decide which slot to write, honoring client-provided slot if empty or 'EMPTY'
            let updateData: any = {};
            type SlotKey = `character_cnft_${1|2|3|4|5}`
            if (slot) {
              const slotKey = (`character_cnft_${slot}` as unknown) as SlotKey
              const cur = (profile as any)[slotKey]
              if (isEmpty(cur)) {
                (updateData as any)[slotKey] = resolvedId
              }
              // If client requested a slot but it is not empty, do NOT auto-fill another slot here
            } else {
              // No specific slot requested: choose first truly empty slot
              if (isEmpty(profile.character_cnft_1)) updateData.character_cnft_1 = resolvedId;
              else if (isEmpty(profile.character_cnft_2)) updateData.character_cnft_2 = resolvedId;
              else if (isEmpty(profile.character_cnft_3)) updateData.character_cnft_3 = resolvedId;
              else if (isEmpty(profile.character_cnft_4)) updateData.character_cnft_4 = resolvedId;
              else if (isEmpty(profile.character_cnft_5)) updateData.character_cnft_5 = resolvedId;
            }
            if (Object.keys(updateData).length > 0 && !profile.active_character_slot) {
              updateData.active_character_slot = slot || 1;
            }
            
            if (Object.keys(updateData).length > 0) {
              const { error: updateError } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('player_pda', playerPDA);
                
              if (updateError) {
                console.error('⚠️ Failed to update Supabase with asset ID:', updateError);
              } else {
                console.log('✅ Updated Supabase with asset ID:', resolvedId);
              }
            } else {
              console.log('⚠️ All character slots are full');
            }
          } else {
            console.error('⚠️ Could not find profile for PDA:', playerPDA);
          }
        } catch (supabaseError) {
          console.error('⚠️ Supabase update error:', supabaseError);
        }
      } else {
        // Background resolve + save once DAS returns the real assetId
        (async () => {
          try {
            console.log('⏳ Background DAS resolve for Supabase save...');
            const timeoutMs = Number(process.env.DAS_BACKGROUND_TIMEOUT_MS || 120000);
            const intervalMs = Number(process.env.DAS_BACKGROUND_INTERVAL_MS || 5000);
            const start = Date.now();
            let resolved: string | null = null;
            while (Date.now() - start < timeoutMs) {
              resolved = await findLatestAssetIdForOwner(playerPDA);
              if (resolved) break;
              await new Promise(r => setTimeout(r, intervalMs));
            }
            if (!resolved) {
              console.warn('⚠️ Background resolve timed out; nothing saved to Supabase');
              return;
            }
            // Seed DB row too
            try {
              const seedStats = generateDefaultCharacterStats(characterName, characterClass || 'Adventurer')
              await NftColumns.upsertMergeMaxFromStats(resolved, playerPDA, seedStats, null, (result as any)?.signature || null)
            } catch (seedErr) {
              console.warn('⚠️ Background seed nfts row failed:', seedErr)
            }
            const { data: profile, error: fetchError } = await supabase
              .from('profiles')
              .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5')
              .eq('player_pda', playerPDA)
              .single();
            if (fetchError) {
              console.error('⚠️ Background Supabase fetch error:', fetchError);
              return;
            }
            if (!profile) return;
            const updateData: any = {};
            if (!profile.character_cnft_1) updateData.character_cnft_1 = resolved;
            else if (!profile.character_cnft_2) updateData.character_cnft_2 = resolved;
            else if (!profile.character_cnft_3) updateData.character_cnft_3 = resolved;
            else if (!profile.character_cnft_4) updateData.character_cnft_4 = resolved;
            else if (!profile.character_cnft_5) updateData.character_cnft_5 = resolved;
            if (Object.keys(updateData).length === 0) {
              console.log('ℹ️ Background resolve: all character slots full; skipping save');
              return;
            }
            const { error: updateError } = await supabase
              .from('profiles')
              .update(updateData)
              .eq('player_pda', playerPDA);
            if (updateError) console.error('⚠️ Background Supabase update error:', updateError);
            else console.log('✅ Background saved resolved assetId to Supabase:', resolved);
          } catch (bgErr) {
            console.error('⚠️ Background resolve/save error:', bgErr);
          }
        })();
      }
      
      res.json({
        success: true,
        assetId: result.assetId,
        message: 'Character created successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to create character'
      });
    }
  } catch (error) {
    console.error('❌ Create character error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

// POST /api/characters/inventory-union
// Returns merged inventory from PDA owner and server escrow, with storageLocation tag
router.post('/inventory-union', async (req: any, res: any) => {
  try {
    const { playerPDA, serverEscrow } = InventoryUnionSchema.parse(req.body || {})

    // Collect asset IDs from DB slots first (authoritative for gameplay)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5')
      .eq('player_pda', playerPDA)
      .single()

    const dbAssetIds = (profile ? [
      profile.character_cnft_1,
      profile.character_cnft_2,
      profile.character_cnft_3,
      profile.character_cnft_4,
      profile.character_cnft_5,
    ] : []).filter(Boolean) as string[]

    // Merge with DAS owner queries: PDA and server escrow
    const rpcUrl = process.env.DAS_RPC_URL || process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || ''
    const collection = process.env.CNFT_COLLECTION_ADDRESS || ''
    const fetchAssetsByOwner = async (owner: string) => {
      if (!rpcUrl) return [] as any[]
      const body: any = {
        jsonrpc: '2.0', id: 'getAssetsByOwner', method: 'getAssetsByOwner', params: { ownerAddress: owner, page: 1, limit: 100 }
      }
      const r = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j: any = await r.json().catch(() => ({}))
      let items: any[] = j?.result?.items || []
      if (collection) items = items.filter((a: any) => (a?.grouping || []).some((g: any) => g?.group_key === 'collection' && g?.group_value === collection))
      return items
    }

    const [pdaItems, escrowItems] = await Promise.all([
      fetchAssetsByOwner(playerPDA),
      serverEscrow ? fetchAssetsByOwner(serverEscrow) : Promise.resolve([])
    ])

    // Build unified map by asset id
    const map = new Map<string, any>()
    const tagPush = (arr: any[], location: 'PDA' | 'ESCROW') => {
      for (const a of arr) {
        const id = a?.id
        if (!id) continue
        const prev = map.get(id)
        map.set(id, { ...(prev || {}), id, raw: a, storageLocation: location })
      }
    }
    tagPush(pdaItems, 'PDA')
    tagPush(escrowItems, 'ESCROW')

    // Ensure DB-slot assets are included even if not currently discoverable via DAS (indexer lag)
    for (const id of dbAssetIds) {
      if (!map.has(id)) map.set(id, { id, raw: null, storageLocation: 'PDA' })
    }

    // Hydrate basic character view using DB first, fallback to chain
    const characters: any[] = []
    for (const [assetId, entry] of map.entries()) {
      try {
        const row = await NftColumns.get(assetId)
        if (row) {
          const stats = NftColumns.columnsToStats(row)
          characters.push({ id: assetId, characterStats: stats })
          continue
        }
        const c = await fetchCharacterFromCNFT(assetId)
        if (c) characters.push({ ...c })
        else characters.push({ id: assetId, characterStats: null })
      } catch {
        characters.push({ id: assetId, characterStats: null })
      }
    }

    return res.json({ success: true, characters })
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || 'Invalid request' })
  }
})

// POST /api/characters/assign-slot-after-deposit
// Adds the deposited assetId into the first available profile slot (or specific slot if provided)
router.post('/assign-slot-after-deposit', async (req: any, res: any) => {
  try {
    const { playerPDA, assetId, slot } = AssignSlotAfterDepositSchema.parse(req.body || {})

    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot')
      .eq('player_pda', playerPDA)
      .single()
    if (fetchError || !profile) return res.status(404).json({ success: false, error: 'Profile not found' })

    const update: any = {}
    let chosenSlot: number | null = null
    const isEmpty = (s: number) => {
      const val = (profile as any)[`character_cnft_${s}`]
      if (!val) return true
      const str = String(val).trim().toUpperCase()
      return str === 'EMPTY' || str === 'NULL'
    }

    if (slot && isEmpty(slot)) {
      update[`character_cnft_${slot}`] = assetId
      chosenSlot = slot
    }
    if (!chosenSlot) {
      for (let s = 1 as 1|2|3|4|5; s <= 5; s++) {
        if (isEmpty(s)) { update[`character_cnft_${s}`] = assetId; chosenSlot = s; break }
      }
    }
    if (!chosenSlot) return res.json({ success: true, updated: false, reason: 'All slots full' })

    if (!profile.active_character_slot) update.active_character_slot = chosenSlot

    const { error: updErr } = await supabase
      .from('profiles')
      .update(update)
      .eq('player_pda', playerPDA)
    if (updErr) return res.status(500).json({ success: false, error: updErr.message })

    return res.json({ success: true, updated: true, slot: chosenSlot })
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || 'Invalid request' })
  }
})

// GET /api/characters/:assetId/debug
router.get('/:assetId/debug', async (req: any, res: any) => {
  try {
    const { assetId } = req.params;
    const dbg = await getAssetMetadataDebug(assetId);
    return res.json({ success: true, debug: dbg });
  } catch (error) {
    console.error('❌ Character debug fetch error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch debug info' });
  }
});

// POST /api/characters/update-cnft-metadata
router.post('/update-cnft-metadata', async (req: any, res: any) => {
  try {
    const { assetId, characterStats, playerPDA } = UpdateCNFTMetadataSchema.parse(req.body);
    
    console.log('🔄 Updating cNFT metadata:', { assetId, characterName: characterStats.name });
    
    const result = await updateCharacterCNFT(assetId, characterStats, playerPDA);
    
    if (result.success) {
      res.json({
        success: true,
        signature: result.signature,
        message: 'Character metadata updated successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to update character metadata'
      });
    }
  } catch (error) {
    console.error('❌ Update cNFT metadata error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

// GET /api/characters/:assetId
router.get('/:assetId', async (req: any, res: any) => {
  try {
    const { assetId } = req.params;
    const source = (req.query?.source || '').toString();
    console.log('🔍 Fetching character:', assetId, source ? `(source=${source})` : '');

    let character = null as any;
    if (source === 'db') {
      // DB-first: return authoritative merged state from nfts table
      try {
        const row = await NftColumns.get(assetId)
        if (row) {
          const stats = NftColumns.columnsToStats(row)
          character = { id: assetId, characterStats: stats, lastSynced: new Date(row.updated_at) }
        }
      } catch (e) {
        console.warn('⚠️ DB fetch failed, falling back to chain:', e)
      }
      if (!character) {
        // Soft fallback if DB missing
        character = await CharacterService.getCharacter(assetId)
      }
    } else {
      // Default to chain-first to ensure skills reflect the latest attributes
      character = await fetchCharacterFromCNFT(assetId);
      // Soft fallback to DB if chain failed (e.g., temporary RPC/DAS outage)
      if (!character) character = await CharacterService.getCharacter(assetId);
    }

    if (character) {
      // Augment with per-skill XP progress from DB if available
      try {
        const skillXp = await getAllSkillXp(assetId)
        const skills = character.characterStats?.skills || {}
        const enriched: any = {}
        for (const key of Object.keys(skills)) {
          const k = key as keyof typeof skills
          const rec: any = (skillXp as any)[k]
          if (rec) {
            const prog = computeProgress(rec.experience)
            enriched[k] = {
              level: skills[k]?.level ?? prog.level,
              experience: rec.experience,
              xpForCurrentLevel: prog.xpForCurrentLevel,
              xpForNextLevel: prog.xpForNextLevel,
              progressPct: prog.progressPct,
            }
          }
        }
        character = { ...character, characterStats: { ...character.characterStats, skills: { ...character.characterStats.skills, ...enriched } } }
      } catch {}
      return res.json({ success: true, character });
    }

    return res.status(404).json({ success: false, error: 'Character not found' });
  } catch (error) {
    console.error('❌ Fetch character error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch character'
    });
  }
});

// POST /api/characters/fetch-player-cnfts-simple
router.post('/fetch-player-cnfts-simple', async (req: any, res: any) => {
  try {
    const { playerId } = FetchPlayerCNFTsSchema.parse(req.body);
    
    console.log('🔍 Fetching player cNFTs for playerId:', playerId);
    
    // Get the user profile from Supabase to find character asset IDs
    // Try by player_pda first; if not found, try by user id
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, player_pda')
      .eq('player_pda', playerId)
      .single();

    if (profileError || !profile) {
      const alt = await supabase
        .from('profiles')
        .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, player_pda')
        .eq('id', playerId)
        .single();
      profile = alt.data as any;
      profileError = alt.error as any;
    }

    console.log('📊 Supabase query result:');
    console.log('- Profile data:', profile);
    console.log('- Profile error:', profileError);

    if (profileError || !profile) {
      console.error('❌ Failed to fetch profile:', profileError);
      return res.status(404).json({
        success: false,
        error: `Player profile not found: ${profileError?.message || 'Unknown error'}`
      });
    }

    console.log('📋 Profile found:', profile);

    // Collect all non-null character asset IDs
    const assetIds = [
      profile.character_cnft_1,
      profile.character_cnft_2,
      profile.character_cnft_3,
      profile.character_cnft_4,
      profile.character_cnft_5
    ].filter(Boolean);

    console.log('🎯 Asset IDs found:', assetIds);

    if (assetIds.length === 0) {
      console.log('📋 No character asset IDs found in profile; falling back to DAS search (owner)');
      try {
        const rpcUrl = process.env.DAS_RPC_URL || process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || '';
        if (rpcUrl) {
          const body: any = {
            jsonrpc: '2.0', id: 'getAssetsByOwner', method: 'getAssetsByOwner', params: { ownerAddress: playerId, page: 1, limit: 50 }
          };
          const rpcRes = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const json: any = await rpcRes.json();
          const items: any[] = json?.result?.items || [];
          const characters: any[] = [];
          for (const a of items) {
            const id = a?.id;
            if (!id) continue;
            const c = await fetchCharacterFromCNFT(id);
            if (c) characters.push(c);
          }
          return res.json({ success: true, characters });
        }
      } catch (e) {
        console.warn('⚠️ DAS owner fallback failed:', e);
      }
      return res.json({ success: true, characters: [] });
    }

    // Fetch character data for each asset ID (prefer DB, fallback to chain)
    const characters: any[] = [];
    for (const assetId of assetIds) {
      try {
        console.log(`🔄 Fetching REAL character data for asset: ${assetId}`);

        // 1) Prefer DB row so UI shows authoritative merged skills immediately
        const row = await NftColumns.get(assetId)
        if (row) {
          const stats = NftColumns.columnsToStats(row)
          characters.push({ id: assetId, characterStats: stats, lastSynced: new Date(row.updated_at) })
          console.log(`✅ Returned DB snapshot for asset: ${assetId}`)
          continue
        }

        // 2) Fallback to on-chain, then upsert so later reads come from DB
        const character = await fetchCharacterFromCNFT(assetId);
        if (character) {
          const playerPdaForRow = profile?.player_pda || null
          console.log(`📝 [fetch-player-cnfts-simple] Upserting row assetId=${assetId} playerPDA=${playerPdaForRow ?? 'null'}`)
          void NftColumns.upsertMergeMaxFromStats(assetId, playerPdaForRow, character.characterStats)
          characters.push(character);
          console.log(`✅ Chain snapshot fetched: ${character.characterStats?.name || 'Unknown'}`);
        } else {
          console.warn(`⚠️ Could not fetch character data for asset: ${assetId}`);
          // Keep UI resilient: add a minimal placeholder so the card renders
          characters.push({
            id: assetId,
            characterStats: {
              name: `Character ${assetId.slice(-4)} (Loading)`,
              level: 1,
              combatLevel: 1,
              totalLevel: 1,
              characterClass: 'Adventurer',
              version: '2.0.0',
              stats: { str: 10, agi: 10, int: 10, vit: 10, luk: 10 },
              experience: 0,
              skills: {
                attack: { level: 1, experience: 0 },
                strength: { level: 1, experience: 0 },
                defense: { level: 1, experience: 0 },
                magic: { level: 1, experience: 0 },
                projectiles: { level: 1, experience: 0 },
                vitality: { level: 1, experience: 0 },
                crafting: { level: 1, experience: 0 },
                luck: { level: 1, experience: 0 },
                gathering: { level: 1, experience: 0 }
              },
              skillExperience: {
                attack: 0, strength: 0, defense: 0, magic: 0,
                projectiles: 0, vitality: 0, crafting: 0, luck: 0, gathering: 0
              },
              achievements: [],
              equipment: { weapon: 'None', armor: 'None', accessory: 'None' }
            },
            lastSynced: new Date()
          });
        }
      } catch (error) {
        console.error(`❌ Error fetching character ${assetId}:`, error);
      }
    }

    console.log(`🎉 Successfully fetched ${characters.length} characters`);
    
    res.json({
      success: true,
      characters
    });
  } catch (error) {
    console.error('❌ Fetch player cNFTs error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch characters'
    });
  }
});

// POST /api/characters/train-skill
router.post('/train-skill', async (req: any, res: any) => {
  try {
    const { assetId, skillName, playerPDA } = TrainSkillSchema.parse(req.body);
    
    console.log(`⚔️ Training ${skillName} for character: ${assetId}`);
    
    const result = await CharacterService.trainSkill(assetId, skillName, playerPDA);
    
    if (result.success) {
      res.json({
        success: true,
        character: result.character,
        message: `Successfully trained ${skillName}!`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to train skill'
      });
    }
  } catch (error) {
    console.error('❌ Train skill error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

// POST /api/characters/add-skill-xp
router.post('/add-skill-xp', async (req: any, res: any) => {
  try {
    // Require server-to-server key for direct XP grants
    if (!hasValidApiKey(req)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    const { assetId, skillName, xpGain, playerPDA, source, sessionId, gameMode, additionalData, idempotencyKey } = AddSkillXpSchema.parse(req.body)
    await assertAssetOwnedByPda(assetId, playerPDA)
    const result = await addSkillXp(assetId, skillName, xpGain, { idempotencyKey, playerPDA, source, sessionId, gameMode, additionalData })
    return res.json({ success: true, ...result })
  } catch (error) {
    console.error('❌ Add skill XP error:', error)
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid request' })
  }
})

// POST /api/characters/award-action
router.post('/award-action', async (req: any, res: any) => {
  try {
    const { assetId, actionKey, quantity, difficultyMultiplier, playerPDA, sessionId, gameMode, idempotencyKey } = AwardActionSchema.parse(req.body)
    // Allow either API key OR HMAC-signed request for client-facing calls
    const ts = String(req.get('x-xp-timestamp') || '')
    const sig = req.get('x-xp-signature') || ''
    const now = Date.now()
    const withinWindow = ts && Math.abs(now - Number(ts)) < 60_000 // 60s
    const basePayload = `${assetId}|${actionKey}|${Math.max(1, Math.floor(quantity || 1))}|${Number(difficultyMultiplier || 1)}|${ts}`
    const signedOk = withinWindow && verifyHmacSignature(basePayload, sig)
    if (!hasValidApiKey(req) && !signedOk) {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    await assertAssetOwnedByPda(assetId, playerPDA)
    const rule = XP_ACTION_RULES[actionKey]
    const base = rule.baseXp
    const qty = Math.max(1, Math.floor(quantity || 1))
    const diff = Math.max(0.1, Math.min(10, Number(difficultyMultiplier || 1)))
    const xpGain = Math.max(1, Math.floor(base * qty * diff))
    const source = `action:${actionKey}`
    const result = await addSkillXp(assetId, rule.skill as any, xpGain, { idempotencyKey, playerPDA, source, sessionId, gameMode, additionalData: { qty, diff } })
    return res.json({ success: true, rule: { actionKey, skill: rule.skill, baseXp: rule.baseXp }, computed: { xpGain, qty, diff }, ...result })
  } catch (error) {
    console.error('❌ Award action error:', error)
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid request' })
  }
})

// GET /api/characters/xp-actions (for client introspection/debug)
router.get('/xp-actions/list', async (_req: any, res: any) => {
  res.json({ success: true, actions: XP_ACTION_RULES })
})

// POST /api/characters/level-up-stat
router.post('/level-up-stat', async (req: any, res: any) => {
  try {
    const { assetId, statName, playerPDA } = LevelUpStatSchema.parse(req.body);
    
    console.log(`💪 Leveling up ${statName} for character: ${assetId}`);
    
    const result = await CharacterService.levelUpStat(assetId, statName, playerPDA);
    
    if (result.success) {
      res.json({
        success: true,
        character: result.character,
        message: `Successfully leveled up ${statName}!`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to level up stat'
      });
    }
  } catch (error) {
    console.error('❌ Level up stat error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

export default router;