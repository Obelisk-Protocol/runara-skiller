import { Router } from 'express';
import { getDasUrl, getRpcUrl } from '../config/solana';
import crypto from 'crypto'
import { z } from 'zod';
import { createCharacterCNFT, updateCharacterCNFT, updateCNFTNameOnly, fetchCharacterFromCNFT, findLatestAssetIdForOwner, getAssetMetadataDebug, generateDefaultCharacterStats, repairNFTMetadataURI } from '../services/cnft';
import { CharacterService } from '../services/character';
import { MetadataStore, NftColumns } from '../services/database';
// Supabase removed - use PostgreSQL via pg-helper
import { pgQuerySingle, pgQuery } from '../utils/pg-helper';
import { verifyAuthToken } from '../utils/auth-helper';
import { getFeatureFlags } from '../services/FeatureFlags';
import { generateCharacterImage } from '../services/character-image-generator';
import { saveCharacterImage } from '../services/image-storage';
import { loadCharacterImageData } from '../services/character-data-loader';

const router = Router();
const FLAG_BLOCK_CLIENT_XP = 'FF_BLOCK_CLIENT_XP';

const requireInternalXpAuth = (req: any, res: any): boolean => {
  if (!getFeatureFlags().isEnabled(FLAG_BLOCK_CLIENT_XP, false)) {
    return true;
  }
  const token = process.env.SKILLER_INTERNAL_TOKEN;
  const header = req.get('x-internal-token');
  if (!token || !header || header !== token) {
    res.status(403).json({ success: false, error: 'XP mutation is restricted to server calls' });
    return false;
  }
  return true;
};

// POST /api/characters/clear-slot-after-withdraw
router.post('/clear-slot-after-withdraw', async (req: any, res: any) => {
  try {
    const schema = z.object({
      playerPDA: z.string(),
      assetId: z.string(),
    })
    const { playerPDA, assetId } = schema.parse(req.body || {})
    
    // Use PostgreSQL directly
    const { Client } = await import('pg');
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      await client.connect();
      
      const profileResult = await client.query(
        'SELECT id, character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5 FROM profiles WHERE player_pda = $1',
        [playerPDA]
      );
      
      if (profileResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }
      
      const profile = profileResult.rows[0];
      const update: any = {};
      for (let i = 1 as 1|2|3|4|5; i <= 5; i++) {
        const key = `character_cnft_${i}` as const;
        if ((profile as any)[key] === assetId) update[key] = null;
      }
      
      if (Object.keys(update).length === 0) {
        return res.json({ success: true, updated: false });
      }
      
      const updateFields = Object.keys(update).map((key, idx) => `${key} = $${idx + 1}`).join(', ');
      const updateValues = Object.values(update);
      updateValues.push(playerPDA);
      
      await client.query(
        `UPDATE profiles SET ${updateFields}, updated_at = NOW() WHERE player_pda = $${updateValues.length}`,
        updateValues
      );
      
      return res.json({ success: true, updated: true });
    } finally {
      await client.end();
    }
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || 'Invalid request' })
  }
})
 import { addSkillXp, getAllSkillXp, getXpBounds, computeProgress, markAssetSynced, CharacterSkill } from '../services/nft-skill-experience';

// Lightweight XP action rules. Keep server-authoritative, don't trust client-provided XP.
const XP_ACTION_RULES = {
  enemy_kill_basic: { skill: 'attack', baseXp: 25 },
  enemy_kill_magic: { skill: 'magic', baseXp: 25 },
  enemy_kill_ranged: { skill: 'projectiles', baseXp: 25 },
  boss_kill: { skill: 'attack', baseXp: 500 },
  craft_item_common: { skill: 'crafting', baseXp: 40 },
  craft_item_rare: { skill: 'crafting', baseXp: 120 },
  complete_dungeon: { skill: 'vitality', baseXp: 300 },
  perfect_clear: { skill: 'defense', baseXp: 200 },
  luck_find: { skill: 'luck', baseXp: 30 },
  // Gathering Skills (XP per tree cut down, not per chop)
  woodcut_tree_basic: { skill: 'woodcutting', baseXp: 75 },   // Small trees: 75 XP per tree
  woodcut_tree_medium: { skill: 'woodcutting', baseXp: 125 }, // Medium trees: 125 XP per tree
  woodcut_tree_hard: { skill: 'woodcutting', baseXp: 200 },  // Large trees: 200 XP per tree
  // Mining (XP per stone/ore mined, not per hit)
  mine_ore_basic: { skill: 'mining', baseXp: 75 },   // Small stones: 75 XP per stone
  mine_ore_medium: { skill: 'mining', baseXp: 125 }, // Medium stones: 125 XP per stone
  mine_ore_hard: { skill: 'mining', baseXp: 200 },  // Large stones/ores: 200 XP per stone
  fish_basic: { skill: 'fishing', baseXp: 15 },
  fish_medium: { skill: 'fishing', baseXp: 20 },
  fish_hard: { skill: 'fishing', baseXp: 25 },
  hunt_basic: { skill: 'hunting', baseXp: 20 },
  hunt_medium: { skill: 'hunting', baseXp: 30 },
} as const
type XpActionKey = keyof typeof XP_ACTION_RULES


// Validation schemas
const CreateCharacterSchema = z.object({
  playerPDA: z.string(),
  characterName: z.string().min(1).max(50),
  slot: z.number().int().min(1).max(5).optional()
});

// Make characterStats optional - if not provided, will fetch from database (nfts.name is source of truth)
const UpdateCNFTMetadataSchema = z.object({
  assetId: z.string(),
  characterStats: z.object({
    name: z.string(),
    combatLevel: z.number(),
    totalLevel: z.number(),
    version: z.string(),
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
      mining: z.object({ level: z.number(), experience: z.number() }),
      woodcutting: z.object({ level: z.number(), experience: z.number() }),
      fishing: z.object({ level: z.number(), experience: z.number() }),
      hunting: z.object({ level: z.number(), experience: z.number() }),
      smithing: z.object({ level: z.number(), experience: z.number() }),
      cooking: z.object({ level: z.number(), experience: z.number() }),
      alchemy: z.object({ level: z.number(), experience: z.number() }),
      construction: z.object({ level: z.number(), experience: z.number() })
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
      mining: z.number(),
      woodcutting: z.number(),
      fishing: z.number(),
      hunting: z.number(),
      smithing: z.number(),
      cooking: z.number(),
      alchemy: z.number(),
      construction: z.number()
    })
  }).optional(), // Optional - will fetch from database if not provided (nfts.name is source of truth)
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
  skillName: z.enum([
    // Combat Skills
    'attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality',
    // Gathering Skills
    'mining', 'woodcutting', 'fishing', 'hunting',
    // Crafting Skills
    'smithing', 'crafting', 'cooking', 'alchemy', 'construction',
    // Unique Skills
    'luck'
  ]),
  playerPDA: z.string().optional()
});

const AddSkillXpSchema = z.object({
  assetId: z.string().optional(), // Optional because it can come from path param
  skillName: z.enum([
    // Combat Skills
    'attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality',
    // Gathering Skills
    'mining', 'woodcutting', 'fishing', 'hunting',
    // Crafting Skills
    'smithing', 'crafting', 'cooking', 'alchemy', 'construction',
    // Unique Skills
    'luck'
  ]),
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
  actionKey: z.enum([
    'enemy_kill_basic',
    'enemy_kill_magic',
    'enemy_kill_ranged',
    'boss_kill',
    'craft_item_common',
    'craft_item_rare',
    'complete_dungeon',
    'perfect_clear',
    'luck_find',
    'woodcut_tree_basic',
    'woodcut_tree_medium',
    'woodcut_tree_hard',
    'mine_ore_basic',
    'mine_ore_medium',
    'mine_ore_hard',
    'fish_basic',
    'fish_medium',
    'fish_hard',
    'hunt_basic',
    'hunt_medium',
  ] as [string, ...string[]]),
  quantity: z.number().int().positive().optional(),
  difficultyMultiplier: z.number().positive().optional(),
  playerPDA: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  gameMode: z.string().optional(),
  idempotencyKey: z.string().optional(),
})

// Helper to authenticate user from Supabase auth header
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

  return { userId: authResult.data?.user?.id || '', profile };
}

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
  let row = await NftColumns.get(assetId)
  if (!row) {
    // Soft-recover: try to seed the row from chain so XP grants don't fail on first touch
    try {
      const character = await CharacterService.getCharacter(assetId)
      if (character) {
        await NftColumns.upsertMergeMaxFromStats(assetId, playerPDA || null, character.characterStats)
        row = await NftColumns.get(assetId)
      }
    } catch {}
  }
  if (!row) {
    // As a last resort, allow if playerPDA is provided (server-to-server) but warn
    if (playerPDA) {
      console.warn('[XP] Proceeding without nfts row for asset, playerPDA provided:', assetId, playerPDA)
      return
    }
    throw new Error('Unknown assetId')
  }
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
    const { playerPDA, characterName, slot } = CreateCharacterSchema.parse(req.body);
    
    console.log('🎯 Creating character:', { playerPDA, characterName });
    
    const result = await createCharacterCNFT(playerPDA, characterName);
    
    if (result.success) {
      // Asset ID must be resolved by createCharacterCNFT - no fallbacks
      const resolvedId: string | undefined = result.assetId
      
      if (!resolvedId) {
        console.error('❌ createCharacterCNFT did not return assetId - local derivation failed');
        return res.status(500).json({
          success: false,
          error: 'Failed to derive asset ID. Transaction may not be confirmed yet.'
        });
      }

      // Update Supabase with the asset ID (slot 1 if empty)
      if (resolvedId) {
        // Seed authoritative DB row so UI can read from DB immediately
        try {
          const seedStats = generateDefaultCharacterStats(characterName)
          await NftColumns.upsertMergeMaxFromStats(resolvedId, playerPDA, seedStats, null, (result as any)?.signature || null)
        } catch (seedErr) {
          console.warn('⚠️ Failed to seed nfts row:', seedErr)
        }
        try {
          // Find the player by PDA and update with the new character asset ID
          const profileResult = await pgQuerySingle<any>(
            'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot FROM profiles WHERE player_pda = $1',
            [playerPDA]
          );
          const profile = profileResult.data;
          const fetchError = profileResult.error;
          
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
              const updateKeys = Object.keys(updateData);
              const updateValues = Object.values(updateData);
              const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
              const { error: updateError } = await pgQuery(
                `UPDATE profiles SET ${setClause} WHERE player_pda = $${updateKeys.length + 1}`,
                [...updateValues, playerPDA]
              );
                
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
    const profileResult = await pgQuerySingle<any>(
      'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5 FROM profiles WHERE player_pda = $1',
      [playerPDA]
    );
    const profile = profileResult.data;
    const profileError = profileResult.error;

    const dbAssetIds = (profile ? [
      profile.character_cnft_1,
      profile.character_cnft_2,
      profile.character_cnft_3,
      profile.character_cnft_4,
      profile.character_cnft_5,
    ] : []).filter(Boolean) as string[]

    // Merge with DAS owner queries: PDA and server escrow
    const rpcUrl = getDasUrl() || getRpcUrl()
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
          const stats = await NftColumns.columnsToStatsWithSkills(row)
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

    const profileResult = await pgQuerySingle<any>(
      'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot FROM profiles WHERE player_pda = $1',
      [playerPDA]
    );
    const profile = profileResult.data;
    const fetchError = profileResult.error;
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

    const updateKeys = Object.keys(update);
    const updateValues = Object.values(update);
    const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const { error: updErr } = await pgQuery(
      `UPDATE profiles SET ${setClause} WHERE player_pda = $${updateKeys.length + 1}`,
      [...updateValues, playerPDA]
    )
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

// POST /api/characters/update-cnft-name
// Update ONLY the name field (separate transaction to avoid size limits)
router.post('/update-cnft-name', async (req: any, res: any) => {
  try {
    const { assetId, name, playerPDA } = req.body;
    
    if (!assetId || !name) {
      return res.status(400).json({
        success: false,
        error: 'assetId and name are required'
      });
    }
    
    console.log('📝 Updating cNFT name only:', { assetId, name });
    
    const result = await updateCNFTNameOnly(assetId, name, playerPDA);
    
    if (result.success) {
      res.json({
        success: true,
        signature: result.signature,
        message: 'Character name updated successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to update character name'
      });
    }
  } catch (error) {
    console.error('❌ Update cNFT name error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

// POST /api/characters/update-cnft-metadata
router.post('/update-cnft-metadata', async (req: any, res: any) => {
  try {
    const { assetId, characterStats: providedStats, playerPDA } = UpdateCNFTMetadataSchema.parse(req.body);
    
    // CRITICAL: If characterStats not provided, fetch from database (nfts.name is source of truth)
    let characterStats = providedStats;
    if (!characterStats) {
      console.log('🔄 Fetching character stats from database for NFT update...');
      const row = await NftColumns.get(assetId);
      if (row) {
        characterStats = await NftColumns.columnsToStatsWithSkills(row);
        console.log(`✅ Fetched character stats from database: name="${characterStats.name}"`);
      } else {
        return res.status(404).json({
          success: false,
          error: 'Character not found in database'
        });
      }
    }
    
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

// GET /api/characters/:assetId/skills - Get skill levels for a character
router.get('/:assetId/skills', async (req: any, res: any) => {
  try {
    const { assetId } = req.params
    
    // Get all skill XP from database
    const skillXp = await getAllSkillXp(assetId)
    const skills: any[] = []
    
    // Convert to array format expected by client
    for (const [skillName, data] of Object.entries(skillXp)) {
      const prog = computeProgress((data as any).experience)
      skills.push({
        skill: skillName,
        level: (data as any).level ?? prog.level,
        experience: (data as any).experience,
        xpForCurrentLevel: prog.xpForCurrentLevel,
        xpForNextLevel: prog.xpForNextLevel,
        progressPct: prog.progressPct
      })
    }
    
    return res.json({ success: true, skills })
  } catch (error) {
    console.error('❌ Get skills error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch skills'
    })
  }
})

// POST /api/characters/:assetId/add-skill-xp - Add XP to a character's skill (assetId in path)
router.post('/:assetId/add-skill-xp', async (req: any, res: any) => {
  try {
    // Require server-to-server key for direct XP grants
    if (!hasValidApiKey(req)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    
    const { assetId } = req.params
    // assetId comes from path param, so omit it from schema validation
    const { skillName, xpGain, playerPDA, source, sessionId, gameMode, additionalData, idempotencyKey } = AddSkillXpSchema.omit({ assetId: true }).parse(req.body)
    
    await assertAssetOwnedByPda(assetId, playerPDA)
    const result = await addSkillXp(assetId, skillName, xpGain, { idempotencyKey, playerPDA, source, sessionId, gameMode, additionalData })

    // Return immediately - don't block on on-chain update
    // On-chain metadata update happens in background for better UX
    res.json({ success: true, ...result, metadataUpdated: false, signature: undefined })

    // Fire-and-forget on-chain metadata update on level-up (non-blocking)
    if (result.leveledUp) {
      // Don't await - let it happen in background
      Promise.resolve().then(async () => {
        try {
          const row = await NftColumns.get(assetId)
          if (row) {
            const stats = await NftColumns.columnsToStatsWithSkills(row)
            // Update URI (includes full metadata with new skill levels)
            const upd = await updateCharacterCNFT(assetId, stats, playerPDA)
            if (upd.success) {
              await markAssetSynced(assetId)
              console.log(`✅ Background metadata URI update completed for ${assetId}: ${upd.signature}`)
              
              // CRITICAL: Also update on-chain name to reflect new combat level
              // URI update doesn't change the on-chain name field
              try {
                const nameUpd = await updateCNFTNameOnly(assetId, stats.name, playerPDA)
                if (nameUpd.success) {
                  console.log(`✅ Background name update completed for ${assetId}: ${nameUpd.signature}`)
                } else {
                  console.warn(`⚠️ Background name update failed: ${nameUpd.error}`)
                }
              } catch (nameErr) {
                console.warn('⚠️ Background name update error:', nameErr)
                // Don't fail - URI update succeeded
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ Background metadata update failed; background worker will retry', e)
        }
      }).catch(err => {
        console.error('❌ Background metadata update error:', err)
      })
    }
    
    return
  } catch (error) {
    console.error('❌ Add skill XP error:', error)
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid request' })
  }
})

// POST /api/characters/:assetId/update-metadata-image - Force update metadata with image from database
router.post('/:assetId/update-metadata-image', async (req: any, res: any) => {
  try {
    const { assetId } = req.params;
    
    console.log(`🔄 Force updating metadata image for: ${assetId}`);
    
    // Get image URL from nfts table
    const nftResult = await pgQuerySingle<any>(
      'SELECT character_image_url, name FROM nfts WHERE asset_id = $1',
      [assetId]
    );
    const nftRow = nftResult.data;
    const nftError = nftResult.error;
    
    if (nftError || !nftRow) {
      return res.status(404).json({
        success: false,
        error: 'NFT not found in database'
      });
    }
    
    if (!nftRow.character_image_url) {
      return res.status(400).json({
        success: false,
        error: 'No image URL found in database. Generate image first using /api/characters/:assetId/generate-image'
      });
    }
    
    // Get current metadata
    const metadataResult = await pgQuerySingle<any>(
      'SELECT metadata_json FROM nft_metadata WHERE asset_id = $1',
      [assetId]
    );
    const metadataRow = metadataResult.data;
    
    if (!metadataRow) {
      return res.status(404).json({
        success: false,
        error: 'Metadata not found. Create metadata first.'
      });
    }
    
    // Update metadata JSON with image URL
    const updatedMetadata = {
      ...metadataRow.metadata_json,
      image: nftRow.character_image_url,
      properties: {
        ...metadataRow.metadata_json.properties,
        files: [{ uri: nftRow.character_image_url, type: 'image/png' }]
      }
    };
    
    // Save updated metadata
    const { error: updateError } = await pgQuery(
      'UPDATE nft_metadata SET metadata_json = $1 WHERE asset_id = $2',
      [updatedMetadata, assetId]
    );
    
    if (updateError) {
      throw updateError;
    }
    
    console.log(`✅ Updated metadata with image: ${nftRow.character_image_url}`);
    
    res.json({
      success: true,
      imageUrl: nftRow.character_image_url,
      message: 'Metadata image updated successfully'
    });
  } catch (error) {
    console.error('❌ Update metadata image error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update metadata image'
    });
  }
});

// POST /api/characters/:assetId/repair-metadata - Repair NFT metadata URI
router.post('/:assetId/repair-metadata', async (req: any, res: any) => {
  try {
    const { assetId } = req.params;
    const { playerPDA } = req.body || {};
    
    console.log(`🔧 Repairing metadata URI for assetId: ${assetId}`);
    
    const result = await repairNFTMetadataURI(assetId, playerPDA);
    
    if (result.success) {
      res.json({
        success: true,
        signature: result.signature,
        message: 'Metadata URI repaired successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to repair metadata URI'
      });
    }
  } catch (error) {
    console.error('❌ Repair metadata error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

// GET /api/characters/metadata/:assetId - Serve NFT metadata JSON (identifier = asset_id or URL-safe character name)
router.get('/metadata/:identifier', async (req: any, res: any) => {
  const { identifier } = req.params;
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  let metadataData: any = null;
  let nftRow: any = null;

  try {
    await client.connect();

    // 1) Look up by asset_id first (e.g. on-chain asset ID or legacy URIs)
    const metadataResult = await client.query(
      'SELECT metadata_json FROM nft_metadata WHERE asset_id = $1',
      [identifier]
    );

    if (metadataResult.rows.length > 0) {
      metadataData = metadataResult.rows[0];
      const nftResult = await client.query(
        'SELECT asset_id, name, character_image_url FROM nfts WHERE asset_id = $1',
        [identifier]
      );
      if (nftResult.rows.length > 0) nftRow = nftResult.rows[0];
    }

    let data: any = metadataData;
    let error: any = metadataData ? null : { code: 'PGRST116' };

    // 2) If not found, look up by character name (URL-safe: "belac" -> "Belac")
    if (error || !data) {
      const nameFromUrl = identifier.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

      // Pending metadata keyed by name in JSON
      const pendingResult = await client.query(
        'SELECT metadata_json, asset_id FROM nft_metadata WHERE asset_id = $1',
        ['pending']
      );
      if (pendingResult.rows.length > 0) {
        const pending = pendingResult.rows[0];
        if (pending.metadata_json && (pending.metadata_json as any)?.name === nameFromUrl) {
          data = { metadata_json: pending.metadata_json };
          error = null;
        }
      }

      if (error || !data) {
        const nftByName = await client.query(
          'SELECT asset_id, name, character_image_url FROM nfts WHERE LOWER(name) = LOWER($1) LIMIT 1',
          [nameFromUrl]
        );
        if (nftByName.rows.length > 0) {
          nftRow = nftByName.rows[0];
          const metaByAsset = await client.query(
            'SELECT metadata_json FROM nft_metadata WHERE asset_id = $1',
            [nftRow.asset_id]
          );
          if (metaByAsset.rows.length > 0) {
            data = metaByAsset.rows[0];
            error = null;
          }
        }
      }

      if ((error || !data) && identifier === 'pending') {
        const pendingResult = await client.query(
          'SELECT metadata_json FROM nft_metadata WHERE asset_id = $1',
          ['pending']
        );
        if (pendingResult.rows.length > 0) {
          data = pendingResult.rows[0];
          error = null;
        }
      }
    }

    if (error || !data) {
      console.warn(`⚠️ Metadata not found for identifier: ${identifier}`);
      return res.status(404).json({ error: 'Metadata not found' });
    }
    
    // Ensure image URL is included in metadata
    // Get image URL from nfts table if not in metadata_json
    let metadataJson = data.metadata_json;
    let assetIdForImage = identifier;
    
    // If we found by name lookup, we already have the assetId from nftRow
    // Otherwise, try to get assetId from nfts table if identifier is a name
    if (nftRow?.asset_id) {
      assetIdForImage = nftRow.asset_id;
    }
    
    // Fetch image URL from nfts table (use nftRow if available, otherwise query)
    let imageUrl: string | null = null;
    if (nftRow?.character_image_url) {
      imageUrl = nftRow.character_image_url;
    } else {
      // Query PostgreSQL directly
      const imageClient = new (await import('pg')).Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      try {
        await imageClient.connect();
        const nftResult = await imageClient.query(
          'SELECT character_image_url FROM nfts WHERE asset_id = $1',
          [assetIdForImage]
        );
        if (nftResult.rows.length > 0) {
          imageUrl = nftResult.rows[0].character_image_url || null;
        }
      } catch (queryError) {
        console.warn('Failed to fetch image URL:', queryError);
      } finally {
        await imageClient.end();
      }
    }
    
    // Ensure image field exists in metadata (handle empty strings too)
    if ((!metadataJson.image || metadataJson.image === '') && imageUrl) {
      metadataJson = {
        ...metadataJson,
        image: imageUrl,
        properties: {
          ...metadataJson.properties,
          files: imageUrl ? [{ uri: imageUrl, type: 'image/png' }] : (metadataJson.properties?.files || [])
        }
      };
      console.log(`✅ Added image URL to metadata: ${imageUrl}`);
    } else if (!metadataJson.image || metadataJson.image === '') {
      // Image is missing - generate it automatically
      console.log(`🔄 Image missing for ${identifier}, generating automatically...`);
      try {
        // Load character data for image generation
        const characterData = await loadCharacterImageData(assetIdForImage);
        
        // Generate the image
        const imageBuffer = await generateCharacterImage({
          customization: characterData.customization,
          includeBackground: false
        });
        
        // Save the image
        const generatedImageUrl = await saveCharacterImage(assetIdForImage, imageBuffer, true);
        console.log(`✅ Generated and saved image: ${generatedImageUrl}`);
        
        // Update database with image URL
        const updateClient = new (await import('pg')).Client({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false }
        });
        try {
          await updateClient.connect();
          await updateClient.query(
            'UPDATE nfts SET character_image_url = $1, updated_at = NOW() WHERE asset_id = $2',
            [generatedImageUrl, assetIdForImage]
          );
        } catch (updateError) {
          console.warn('Failed to update image URL:', updateError);
        } finally {
          await updateClient.end();
        }
        
        // Update metadata JSON with the new image URL
        metadataJson = {
          ...metadataJson,
          image: generatedImageUrl,
          properties: {
            ...metadataJson.properties,
            files: [{ uri: generatedImageUrl, type: 'image/png' }]
          }
        };
        
        // Also update the metadata in the database
        await pgQuery(
          'UPDATE nft_metadata SET metadata_json = $1 WHERE asset_id = $2',
          [metadataJson, assetIdForImage]
        );
        
        console.log(`✅ Auto-generated image and updated metadata`);
      } catch (genError) {
        console.error(`❌ Failed to auto-generate image:`, genError);
        // Continue without image - at least return the metadata
      }
    }
    
    // Return the metadata JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(metadataJson);
  } catch (error) {
    console.error('❌ Error serving metadata:', error);
    res.status(500).json({ error: 'Failed to serve metadata' });
  } finally {
    try { await client.end(); } catch (_) { /* already closed */ }
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
          // Fetch skills from nft_skill_experience (source of truth)
          const stats = await NftColumns.columnsToStatsWithSkills(row)
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
      // Add character image URL from database if available
      // Check nfts table for character_image_url column
      try {
        const nftResult = await pgQuerySingle<any>(
          'SELECT character_image_url, name FROM nfts WHERE asset_id = $1',
          [assetId]
        );
        const nftRow = nftResult.data;
        const nftError = nftResult.error;
        
        if (nftError && (nftError as any).code !== 'PGRST116') {
          console.warn(`⚠️ Failed to fetch NFT row for image/name:`, nftError);
        }
        
        // CRITICAL: Set image from database (character_image_url)
        if (nftRow?.character_image_url) {
          character.image = nftRow.character_image_url;
          console.log(`✅ Set character.image from database: ${nftRow.character_image_url}`);
        } else {
          console.log(`⚠️ No character_image_url found in database for ${assetId}`);
        }
        
        // CRITICAL: Ensure name comes from database (nfts.name is source of truth)
        if (nftRow?.name && character.characterStats) {
          character.characterStats.name = nftRow.name;
          console.log(`✅ Synced character name from database: ${nftRow.name}`);
        }
      } catch (e) {
        console.warn(`⚠️ Error fetching NFT row for image/name:`, e);
        // Ignore errors - image is optional
      }
      
      // Augment with per-skill XP progress from DB if available
      // CRITICAL: nft_skill_experience is the source of truth for skill levels
      // The nfts table may have stale data, so always prioritize nft_skill_experience
      try {
        const skillXp = await getAllSkillXp(assetId)
        const skills = character.characterStats?.skills || {}
        const enriched: any = {}
        const skillExperience: any = {}
        
        // CRITICAL: Always use skillXp (from nft_skill_experience) as source of truth
        // Calculate level from XP to ensure accuracy (don't trust stored level)
        for (const key of Object.keys(skillXp)) {
          const k = key as CharacterSkill
          const rec = skillXp[k]
          const prog = computeProgress(rec.experience)
          // ALWAYS use calculated level from XP (prog.level) - it's the most accurate
          // Only use rec.level if XP is 0 (meaning no XP record exists yet)
          const finalLevel = rec.experience > 0 ? prog.level : (rec.level || 1)
          enriched[k] = {
            level: finalLevel,
            experience: rec.experience,
            xpForCurrentLevel: prog.xpForCurrentLevel,
            xpForNextLevel: prog.xpForNextLevel,
            progressPct: prog.progressPct,
          }
          skillExperience[k] = rec.experience
        }
        
        // Also include any skills from character.characterStats that might not be in skillXp yet
        for (const key of Object.keys(skills)) {
          const k = key as keyof typeof skills
          if (!enriched[k]) {
            // Skill not in nft_skill_experience yet, use from character stats or default
            enriched[k] = {
              level: skills[k]?.level ?? 1,
              experience: skills[k]?.experience ?? 0,
              xpForCurrentLevel: 0,
              xpForNextLevel: 0,
              progressPct: 0,
            }
            skillExperience[k] = skills[k]?.experience ?? 0
          }
        }
        
        // CRITICAL: Replace skills entirely with enriched data from nft_skill_experience
        // Don't merge with character.characterStats.skills as it may have stale defaults
        character = { 
          ...character, 
          characterStats: { 
            ...character.characterStats, 
            skills: enriched, // Use enriched skills directly (source of truth)
            skillExperience: skillExperience
          } 
        }
      } catch {}
      
      // Log what we're returning for debugging
      console.log(`✅ Returning character data:`, {
        assetId,
        name: character.characterStats?.name,
        image: character.image ? character.image.substring(0, 50) + '...' : 'null',
        hasImage: !!character.image,
      });
      
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
    
    // Get the user profile from PostgreSQL to find character asset IDs
    // Try by player_pda first; if not found, try by user id
    const { Client } = await import('pg');
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    let profile: any = null;
    
    try {
      await client.connect();
      
      // Try by player_pda first
      let result = await client.query(
        'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, player_pda FROM profiles WHERE player_pda = $1',
        [playerId]
      );
      
      if (result.rows.length === 0) {
        // Try by id (UUID)
        result = await client.query(
          'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, player_pda FROM profiles WHERE id = $1',
          [playerId]
        );
      }
      
      if (result.rows.length > 0) {
        profile = result.rows[0];
      }
    } finally {
      await client.end();
    }

    console.log('📊 Profile query result:');
    console.log('- Profile data:', profile);

    if (!profile) {
      console.error('❌ Failed to fetch profile');
      return res.status(404).json({
        success: false,
        error: 'Player profile not found'
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
        const rpcUrl = getDasUrl() || getRpcUrl();
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
          const stats = await NftColumns.columnsToStatsWithSkills(row)
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
    // For this route, assetId is required in body
    const bodySchema = AddSkillXpSchema.extend({ assetId: z.string() })
    const { assetId, skillName, xpGain, playerPDA, source, sessionId, gameMode, additionalData, idempotencyKey } = bodySchema.parse(req.body)
    await assertAssetOwnedByPda(assetId, playerPDA)
    const result = await addSkillXp(assetId, skillName, xpGain, { idempotencyKey, playerPDA, source, sessionId, gameMode, additionalData })

    // Return immediately - don't block on on-chain update
    // On-chain metadata update happens in background for better UX
    res.json({ success: true, ...result, metadataUpdated: false, signature: undefined })

    // Fire-and-forget on-chain metadata update on level-up (non-blocking)
    if (result.leveledUp) {
      // Don't await - let it happen in background
      Promise.resolve().then(async () => {
        try {
          const row = await NftColumns.get(assetId)
          if (row) {
            const stats = await NftColumns.columnsToStatsWithSkills(row)
            // Update URI (includes full metadata with new skill levels)
            const upd = await updateCharacterCNFT(assetId, stats, playerPDA)
            if (upd.success) {
              await markAssetSynced(assetId)
              console.log(`✅ Background metadata URI update completed for ${assetId}: ${upd.signature}`)
              
              // CRITICAL: Also update on-chain name to reflect new combat level
              // URI update doesn't change the on-chain name field
              try {
                const nameUpd = await updateCNFTNameOnly(assetId, stats.name, playerPDA)
                if (nameUpd.success) {
                  console.log(`✅ Background name update completed for ${assetId}: ${nameUpd.signature}`)
                } else {
                  console.warn(`⚠️ Background name update failed: ${nameUpd.error}`)
                }
              } catch (nameErr) {
                console.warn('⚠️ Background name update error:', nameErr)
                // Don't fail - URI update succeeded
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ Background metadata update failed; background worker will retry', e)
        }
      }).catch(err => {
        console.error('❌ Background metadata update error:', err)
      })
    }
  } catch (error) {
    console.error('❌ Add skill XP error:', error)
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid request' })
  }
})

// POST /api/characters/award-action
router.post('/award-action', async (req: any, res: any) => {
  try {
    if (!requireInternalXpAuth(req, res)) {
      return;
    }
    const { assetId, actionKey, quantity, difficultyMultiplier, playerPDA, sessionId, gameMode, idempotencyKey } = AwardActionSchema.parse(req.body)
    
    // Authentication: Allow Bearer token (Unity client), API key, or HMAC (server-to-server)
    let authenticatedUser: { userId: string; profile: any } | null = null
    let verifiedPDA: string | null = null
    
    try {
      // Try Bearer token authentication first (for Unity clients)
      authenticatedUser = await authenticateUser(req)
      verifiedPDA = authenticatedUser.profile.player_pda
    } catch (authError) {
      // Fall back to API key or HMAC for server-to-server calls
      const ts = String(req.get('x-xp-timestamp') || '')
      const sig = req.get('x-xp-signature') || ''
      const now = Date.now()
      const withinWindow = ts && Math.abs(now - Number(ts)) < 60_000 // 60s
      const basePayload = `${assetId}|${actionKey}|${Math.max(1, Math.floor(quantity || 1))}|${Number(difficultyMultiplier || 1)}|${ts}`
      const signedOk = withinWindow && verifyHmacSignature(basePayload, sig)
      
      if (!hasValidApiKey(req) && !signedOk) {
        return res.status(401).json({ success: false, error: 'Unauthorized - requires Bearer token, API key, or valid HMAC signature' })
      }
      
      // For server-to-server, use provided playerPDA or verify from asset
      verifiedPDA = playerPDA || null
    }
    
    // Verify asset ownership
    await assertAssetOwnedByPda(assetId, verifiedPDA || playerPDA)
    const rule = XP_ACTION_RULES[actionKey as XpActionKey]
    const base = rule.baseXp
    const qty = Math.max(1, Math.floor(quantity || 1))
    const diff = Math.max(0.1, Math.min(10, Number(difficultyMultiplier || 1)))
    const xpGain = Math.max(1, Math.floor(base * qty * diff))
    const source = `action:${actionKey}`
    const finalPlayerPDA = verifiedPDA || playerPDA
    const result = await addSkillXp(assetId, rule.skill as any, xpGain, { idempotencyKey, playerPDA: finalPlayerPDA, source, sessionId, gameMode, additionalData: { qty, diff } })
    return res.json({ success: true, rule: { actionKey, skill: rule.skill, baseXp: rule.baseXp }, computed: { xpGain, qty, diff }, ...result })
  } catch (error) {
    console.error('❌ Award action error:', error)
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid request' })
  }
})

// GET /api/characters/xp-actions (for client introspection/debug)
router.get('/xp-actions/list', async (_req: any, res: any) => {
  res.json({ success: true, actions: XP_ACTION_RULES as Record<string, { skill: string; baseXp: number }> })
})

// POST /api/characters/level-up-stat - DEPRECATED (stats system removed)
// Use skill training instead: POST /api/skill-training/train

export default router;