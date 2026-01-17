import { Client as PgClient } from 'pg'
import { pgQuerySingle, pgQuery } from '../utils/pg-helper'
import { NftColumns } from './database'
import { updateCharacterCNFT } from './cnft'
import { CharacterStats } from '../types/character'

export type CharacterSkill = 
  // Combat Skills
  | 'attack' | 'strength' | 'defense' | 'magic' | 'projectiles' | 'vitality'
  // Gathering Skills  
  | 'mining' | 'woodcutting' | 'fishing' | 'hunting'
  // Crafting Skills
  | 'smithing' | 'crafting' | 'cooking' | 'alchemy' | 'construction'
  // Unique Skills
  | 'luck'

type XpProgress = {
  level: number
  experience: number
  xpForCurrentLevel: number
  xpForNextLevel: number
  progressPct: number
}

const MAX_LEVEL = 99

function computeOsrsThresholds(maxLevel: number): number[] {
  const thresholds: number[] = new Array(maxLevel + 1).fill(0)
  let points = 0
  for (let level = 1; level <= maxLevel; level++) {
    points += Math.floor(level + 300 * Math.pow(2, level / 7))
    thresholds[level] = Math.floor(points / 4)
  }
  thresholds[1] = 0
  return thresholds
}

const XP_THRESHOLDS = computeOsrsThresholds(MAX_LEVEL)

export function levelToXp(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
  return XP_THRESHOLDS[l]
}

export function xpToLevel(experience: number): number {
  if (!Number.isFinite(experience) || experience <= 0) return 1
  let low = 1
  let high = MAX_LEVEL
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2)
    if (XP_THRESHOLDS[mid] <= experience) low = mid
    else high = mid - 1
  }
  return Math.max(1, Math.min(MAX_LEVEL, low))
}

export function getXpBounds(level: number): { xpForCurrentLevel: number; xpForNextLevel: number } {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
  const current = XP_THRESHOLDS[l]
  const next = l >= MAX_LEVEL ? XP_THRESHOLDS[MAX_LEVEL] : XP_THRESHOLDS[l + 1]
  return { xpForCurrentLevel: current, xpForNextLevel: next }
}

export function computeProgress(experience: number): XpProgress {
  const level = xpToLevel(experience)
  const { xpForCurrentLevel, xpForNextLevel } = getXpBounds(level)
  const span = Math.max(1, xpForNextLevel - xpForCurrentLevel)
  const clamped = Math.max(xpForCurrentLevel, Math.min(experience, xpForNextLevel))
  const pct = level >= MAX_LEVEL ? 100 : ((clamped - xpForCurrentLevel) / span) * 100
  return { level, experience, xpForCurrentLevel, xpForNextLevel, progressPct: Math.max(0, Math.min(100, pct)) }
}

function getPgConn(): string | null {
  // Use Railway PostgreSQL connection
  return process.env.DATABASE_URL || process.env.SKILLER_DATABASE_URL || null
}

function needsSsl(conn: string): boolean {
  return process.env.PGSSL === 'true' || /supabase\.(co|net)/i.test(conn) || /render\.com|railway|rlwy\.net/i.test(conn)
}

export async function addSkillXp(
  assetId: string,
  skill: CharacterSkill,
  experienceGain: number,
  opts?: { idempotencyKey?: string; playerPDA?: string; source?: string; sessionId?: string; gameMode?: string; additionalData?: any }
): Promise<{
  assetId: string
  skill: CharacterSkill
  experience: number
  level: number
  leveledUp: boolean
  xpForCurrentLevel: number
  xpForNextLevel: number
  progressPct: number
}> {
  if (!assetId || experienceGain <= 0) {
    throw new Error('Invalid assetId or experienceGain')
  }

  // Validate skill name
  const validSkills: CharacterSkill[] = [
    // Combat Skills
    'attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality',
    // Gathering Skills
    'mining', 'woodcutting', 'fishing', 'hunting',
    // Crafting Skills
    'smithing', 'crafting', 'cooking', 'alchemy', 'construction',
    // Unique Skills
    'luck'
  ]
  if (!validSkills.includes(skill)) {
    throw new Error(`Invalid skill: ${skill}. Must be one of: ${validSkills.join(', ')}`)
  }

  // Cap experience gain to prevent exploits
  const maxXpGain = 10000
  const cappedGain = Math.min(experienceGain, maxXpGain)
  if (cappedGain !== experienceGain) {
    console.warn(`⚠️ Capped XP gain from ${experienceGain} to ${cappedGain} for skill ${skill}`)
  }

  const pgConn = getPgConn()
  if (opts?.idempotencyKey && pgConn) {
    try {
      const client: any = new PgClient({ connectionString: pgConn, ssl: needsSsl(pgConn) ? { rejectUnauthorized: false } : undefined } as any)
      await client.connect()
      try {
        await client.query('begin')
        const insEvent = `insert into xp_award_events (idempotency_key, asset_id, skill, experience_gain) values ($1,$2,$3,$4)`
        await client.query(insEvent, [opts.idempotencyKey, assetId, skill, experienceGain])
        await client.query('commit')
      } catch (e: any) {
        await client.query('rollback')
        const msg = String(e?.message || e)
        if (!/duplicate key value violates unique constraint/i.test(msg)) {
          await client.end()
          throw e
        }
        await client.end()
        const current = await getSkillXp(assetId, skill)
        const progress = computeProgress(current?.experience || 0)
        const lvl = progress.level
        return {
          assetId,
          skill,
          experience: current?.experience || 0,
          level: lvl,
          leveledUp: false,
          xpForCurrentLevel: progress.xpForCurrentLevel,
          xpForNextLevel: progress.xpForNextLevel,
          progressPct: progress.progressPct,
        }
      }
      await client.end()
    } catch (e) {
      // proceed without idempotency enforcement if DB error
    }
  }

  if (pgConn) {
    const client: any = new PgClient({ connectionString: pgConn, ssl: needsSsl(pgConn) ? { rejectUnauthorized: false } : undefined } as any)
    await client.connect()
    try {
      const upsertSql = `
        insert into nft_skill_experience (asset_id, skill, experience)
        values ($1,$2,$3)
        on conflict (asset_id, skill) do update set
          experience = nft_skill_experience.experience + excluded.experience,
          updated_at = now()
        returning experience, level
      `
      const upsertRes = await client.query(upsertSql, [assetId, skill, experienceGain])
      const row = upsertRes.rows?.[0] as { experience: number; level: number }
      const newXp = Number(row?.experience || 0)
      const prevRowLevel = Number(row?.level || 1)
      const newLevel = xpToLevel(newXp)
      let leveledUp = false
      
      // Log level-up detection for debugging
      if (newLevel > prevRowLevel) {
        console.log(`🎉 [LEVEL_UP:PG] ${skill} leveled up! Level ${prevRowLevel} -> ${newLevel} (XP: ${newXp})`)
      }
      
      // Always update level to match XP (ensures level is always in sync)
      if (newLevel !== prevRowLevel) {
        const updSql = `update nft_skill_experience set level = $1, pending_onchain_update = $2, updated_at = now() where asset_id = $3 and skill = $4`
        await client.query(updSql, [newLevel, newLevel > prevRowLevel, assetId, skill])
        leveledUp = newLevel > prevRowLevel
      }
      
      // Update nfts table with new level (if level changed)
      let updatedStats: CharacterStats | null = null
      let playerPda: string | null = null
      
      if (newLevel !== prevRowLevel) {
        const nftsRow = await NftColumns.get(assetId)
        playerPda = nftsRow?.player_pda || null
        if (nftsRow) {
          // CRITICAL: Load ALL skills from nft_skill_experience table (source of truth)
          const allSkills = await getAllSkillXp(assetId)
          // Use columnsToStats with skills from nft_skill_experience
          const stats = NftColumns.columnsToStats(nftsRow, allSkills)
          
          // Update the specific skill that just leveled up
          const currentSkillLevel = Number(stats.skills[skill]?.level || 1)
          const targetLevel = Math.max(currentSkillLevel, newLevel)
          stats.skills[skill] = { level: targetLevel, experience: newXp }
          
          // Recalculate combatLevel and totalLevel from updated skills
          const totals = NftColumns.computeTotalsFromSkills(stats.skills)
          
          updatedStats = { 
            ...stats, 
            combatLevel: totals.combat_level,
            totalLevel: totals.total_level
          }
          await NftColumns.upsertMergeMaxFromStats(assetId, playerPda, updatedStats)
        }
      }
      
      // Update cNFT if skill leveled up (expensive operation, only on actual level up)
      // CRITICAL: This must run OUTSIDE the level comparison check to ensure cNFT updates even if DB level was already correct
      // leveledUp flag is authoritative - if true, we should update cNFT regardless of nfts table state
      if (leveledUp) {
        try {
          // If we didn't already load stats above, load them now for cNFT update
          if (!updatedStats) {
            const nftsRow = await NftColumns.get(assetId)
            playerPda = nftsRow?.player_pda || null
            if (nftsRow) {
              const allSkills = await getAllSkillXp(assetId)
              const stats = NftColumns.columnsToStats(nftsRow, allSkills)
              
              // Update the specific skill that just leveled up
              const currentSkillLevel = Number(stats.skills[skill]?.level || 1)
              const targetLevel = Math.max(currentSkillLevel, newLevel)
              stats.skills[skill] = { level: targetLevel, experience: newXp }
              
              // Recalculate combatLevel and totalLevel from updated skills
              const totals = NftColumns.computeTotalsFromSkills(stats.skills)
              
              updatedStats = { 
                ...stats, 
                combatLevel: totals.combat_level,
                totalLevel: totals.total_level
              }
              // Also update database if we're in this path
              await NftColumns.upsertMergeMaxFromStats(assetId, playerPda, updatedStats)
            }
          }
          
          if (updatedStats) {
            console.log(`🔄 [PG] Updating cNFT for skill level up: ${skill} -> level ${newLevel} (was ${prevRowLevel})`)
            const cnftResult = await updateCharacterCNFT(assetId, updatedStats, playerPda || undefined)
            if (cnftResult.success) {
              console.log(`✅ [PG] cNFT updated successfully for ${skill} level up to level ${newLevel}`)
            } else {
              console.warn(`⚠️ [PG] Failed to update cNFT: ${cnftResult.error}`)
            }
          } else {
            console.warn(`⚠️ [PG] Cannot update cNFT: nfts row not found for assetId ${assetId}`)
          }
        } catch (cnftError) {
          console.error(`❌ [PG] Error updating cNFT:`, cnftError)
        }
      }

      const progress = computeProgress(newXp)
      return {
        assetId,
        skill,
        experience: newXp,
        level: progress.level,
        leveledUp,
        xpForCurrentLevel: progress.xpForCurrentLevel,
        xpForNextLevel: progress.xpForNextLevel,
        progressPct: progress.progressPct,
      }
    } finally {
      await client.end()
    }
  }

  // If no PostgreSQL connection available, throw error
  throw new Error('DATABASE_URL or SKILLER_DATABASE_URL must be set for skill experience operations')
}

export async function getSkillXp(assetId: string, skill: CharacterSkill): Promise<{ experience: number; level: number } | null> {
  const result = await pgQuerySingle<{ experience: number; level: number }>(
    'SELECT experience, level FROM nft_skill_experience WHERE asset_id = $1 AND skill = $2',
    [assetId, skill]
  )
  
  if (result.error || !result.data) {
    return null
  }
  
  return { 
    experience: Number(result.data.experience || 0), 
    level: Number(result.data.level || 1) 
  }
}

export async function getAllSkillXp(assetId: string): Promise<Record<CharacterSkill, { experience: number; level: number }>> {
  const init: Record<CharacterSkill, { experience: number; level: number }> = {
    attack: { experience: 0, level: 1 },
    strength: { experience: 0, level: 1 },
    defense: { experience: 0, level: 1 },
    magic: { experience: 0, level: 1 },
    projectiles: { experience: 0, level: 1 },
    vitality: { experience: 0, level: 1 },
    crafting: { experience: 0, level: 1 },
    luck: { experience: 0, level: 1 },
    mining: { experience: 0, level: 1 },
    woodcutting: { experience: 0, level: 1 },
    fishing: { experience: 0, level: 1 },
    hunting: { experience: 0, level: 1 },
    smithing: { experience: 0, level: 1 },
    cooking: { experience: 0, level: 1 },
    alchemy: { experience: 0, level: 1 },
    construction: { experience: 0, level: 1 },
  }
  
  const result = await pgQuery<{ skill: string; experience: number; level: number }>(
    'SELECT skill, experience, level FROM nft_skill_experience WHERE asset_id = $1',
    [assetId]
  )
  
  if (!result.error && Array.isArray(result.data)) {
    for (const row of result.data) {
      const sk = row.skill as CharacterSkill
      const xp = Number(row.experience || 0)
      // CRITICAL: Always calculate level from XP to ensure accuracy
      // Don't trust stored level - it might be stale
      const calculatedLevel = xp > 0 ? xpToLevel(xp) : 1
      init[sk] = { experience: xp, level: calculatedLevel }
    }
  }
  
  return init
}

export async function markAssetSynced(assetId: string): Promise<void> {
  const result = await pgQuery(
    'UPDATE nft_skill_experience SET pending_onchain_update = $1, updated_at = $2 WHERE asset_id = $3',
    [false, new Date().toISOString(), assetId]
  )
  
  if (result.error) {
    console.error('❌ Error marking asset as synced:', result.error)
    throw new Error(`Failed to mark asset as synced: ${result.error.message}`)
  }
}


