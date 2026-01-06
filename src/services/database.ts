import { supabase } from '../config/database';
import { Client as PgClient } from 'pg'
import { PlayerSkillExperience, ExperienceLog, CharacterStats } from '../types/character';

// [DEPRECATED] CharacterDatabase removed. Characters are now represented by `nfts` table (per-skill columns).

// Skill experience database operations
export class SkillDatabase {
  
  // Get player skill experience
  static async getPlayerSkillExperience(playerPda: string): Promise<PlayerSkillExperience | null> {
    try {
      const { data, error } = await supabase
        .from('player_skill_experience')
        .select('*')
        .eq('player_pda', playerPda)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - create default entry
          return await this.createDefaultSkillExperience(playerPda);
        }
        console.error('❌ Error fetching skill experience:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Database error fetching skill experience:', error);
      return null;
    }
  }

  // Create default skill experience entry
  static async createDefaultSkillExperience(playerPda: string): Promise<PlayerSkillExperience | null> {
    try {
      const defaultData = {
        player_pda: playerPda,
        // Legacy columns removed: combat_xp, exploration_xp, gambling_xp, combat_level, exploration_level, gambling_level
        // These are no longer used - new system uses 18 skills (attack, strength, defense, etc.)
        magic_xp: 0,
        crafting_xp: 0,
        magic_level: 1,
        crafting_level: 1,
        pending_onchain_update: false
      };

      const { data, error } = await supabase
        .from('player_skill_experience')
        .insert([defaultData])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating default skill experience:', error);
        return null;
      }

      console.log('✅ Created default skill experience for:', playerPda);
      return data;
    } catch (error) {
      console.error('❌ Database error creating skill experience:', error);
      return null;
    }
  }

  // Add experience to skill
  static async addSkillExperience(
    playerPda: string,
    skill: 'attack' | 'strength' | 'defense' | 'magic' | 'projectiles' | 'vitality' | 'mining' | 'woodcutting' | 'fishing' | 'hunting' | 'smithing' | 'crafting' | 'cooking' | 'alchemy' | 'construction' | 'luck',
    experienceGain: number,
    source?: string,
    sessionId?: string,
    gameMode?: string,
    additionalData?: any
  ): Promise<boolean> {
    try {
      // Get current skill data
      const currentSkills = await this.getPlayerSkillExperience(playerPda);
      if (!currentSkills) {
        console.error('❌ Could not get current skill experience');
        return false;
      }

      // Calculate new experience and level
      const currentXp = currentSkills[`${skill}_xp` as keyof PlayerSkillExperience] as number;
      const newXp = currentXp + experienceGain;
      const newLevel = this.calculateLevelFromExperience(newXp);

      // Update skill experience
      const updateData = {
        [`${skill}_xp`]: newXp,
        [`${skill}_level`]: newLevel,
        pending_onchain_update: true,
        updated_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from('player_skill_experience')
        .update(updateData)
        .eq('player_pda', playerPda);

      if (updateError) {
        console.error('❌ Error updating skill experience:', updateError);
        return false;
      }

      // Log the experience gain
      await this.logExperienceGain(
        playerPda,
        skill,
        experienceGain,
        source,
        sessionId,
        gameMode,
        additionalData
      );

      console.log(`✅ Added ${experienceGain} ${skill} XP to ${playerPda} (New level: ${newLevel})`);
      return true;
    } catch (error) {
      console.error('❌ Database error adding skill experience:', error);
      return false;
    }
  }

  // Log experience gain
  static async logExperienceGain(
    playerPda: string,
    skill: 'attack' | 'strength' | 'defense' | 'magic' | 'projectiles' | 'vitality' | 'mining' | 'woodcutting' | 'fishing' | 'hunting' | 'smithing' | 'crafting' | 'cooking' | 'alchemy' | 'construction' | 'luck',
    experienceGain: number,
    source?: string,
    sessionId?: string,
    gameMode?: string,
    additionalData?: any
  ): Promise<boolean> {
    try {
      // Validate UUID format for session_id (database requires UUID or null)
      // UUID format: 8-4-4-4-12 hexadecimal digits
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validSessionId = sessionId && uuidRegex.test(sessionId) ? sessionId : null;
      
      const logData: any = {
        player_pda: playerPda,
        skill,
        experience_gain: experienceGain,
        source,
        game_mode: gameMode,
        additional_data: additionalData
      };
      
      // Only include session_id if it's a valid UUID
      if (validSessionId) {
        logData.session_id = validSessionId;
      }

      const { error } = await supabase
        .from('experience_logs')
        .insert([logData]);

      if (error) {
        console.error('❌ Error logging experience gain:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Database error logging experience:', error);
      return false;
    }
  }

  // Calculate level from experience (RuneScape-style formula)
  static calculateLevelFromExperience(experience: number): number {
    if (experience <= 0) return 1;
    
    // RuneScape formula: level = floor(1/4 * (1 + sqrt(1 + 8 * experience / 25)))
    // Simplified version for gaming
    let level = 1;
    let xpRequired = 0;
    
    while (xpRequired <= experience && level < 120) {
      level++;
      xpRequired = Math.floor(level * level * 2.5);
    }
    
    return Math.max(1, level - 1);
  }

  // Get experience required for next level
  static getExperienceForLevel(level: number): number {
    if (level <= 1) return 0;
    return Math.floor(level * level * 2.5);
  }

  // Mark skills as synced to blockchain
  static async markSkillsSynced(playerPda: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('player_skill_experience')
        .update({
          pending_onchain_update: false,
          last_onchain_sync: new Date().toISOString()
        })
        .eq('player_pda', playerPda);

      if (error) {
        console.error('❌ Error marking skills as synced:', error);
        return false;
      }

      console.log('✅ Marked skills as synced for:', playerPda);
      return true;
    } catch (error) {
      console.error('❌ Database error marking skills synced:', error);
      return false;
    }
  }

  // Get players with pending sync
  static async getPlayersWithPendingSync(): Promise<PlayerSkillExperience[]> {
    try {
      const { data, error } = await supabase
        .from('player_skill_experience')
        .select('*')
        .eq('pending_onchain_update', true)
        .order('updated_at', { ascending: true });

      if (error) {
        console.error('❌ Error fetching players with pending sync:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ Database error fetching pending sync:', error);
      return [];
    }
  }

  // Action-based skill training methods
  static async getActionSkillMappings(): Promise<Array<{action: string, skill: string, description: string}>> {
    try {
      const { data, error } = await supabase
        .from('action_skills')
        .select('action, skill, description')
        .order('skill, action');

      if (error) {
        console.error('❌ Error fetching action-skill mappings:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ Database error fetching action-skill mappings:', error);
      return [];
    }
  }

  static async getSkillForAction(action: string): Promise<{skill: string, description: string} | null> {
    try {
      const { data, error } = await supabase
        .from('action_skills')
        .select('skill, description')
        .eq('action', action)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Action not found
        }
        console.error('❌ Error fetching skill for action:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Database error fetching skill for action:', error);
      return null;
    }
  }

  static async logSkillTraining(params: {
    assetId: string;
    action: string;
    skill: string;
    expGained: number;
    playerPDA?: string;
    sessionId?: string;
    gameMode?: string;
    additionalData?: any;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('skill_training_logs')
        .insert({
          asset_id: params.assetId,
          action: params.action,
          skill: params.skill,
          exp_gained: params.expGained,
          player_pda: params.playerPDA,
          session_id: params.sessionId,
          game_mode: params.gameMode,
          additional_data: params.additionalData
        });

      if (error) {
        console.error('❌ Error logging skill training:', error);
        throw error;
      }
    } catch (error) {
      console.error('❌ Database error logging skill training:', error);
      throw error;
    }
  }

  static async getSkillTrainingHistory(assetId: string, options: {limit: number, offset: number}): Promise<Array<{
    id: number;
    action: string;
    skill: string;
    exp_gained: number;
    created_at: string;
    additional_data: any;
  }>> {
    try {
      const { data, error } = await supabase
        .from('skill_training_logs')
        .select('id, action, skill, exp_gained, created_at, additional_data')
        .eq('asset_id', assetId)
        .order('created_at', { ascending: false })
        .range(options.offset, options.offset + options.limit - 1);

      if (error) {
        console.error('❌ Error fetching skill training history:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ Database error fetching skill training history:', error);
      return [];
    }
  }
}

// Metadata storage (in-memory for now, can be moved to database later)
class MetadataStore {
  private static store = new Map<string, any>();

  static set(id: string, metadata: any): void {
    this.store.set(id, metadata);
    console.log(`💾 Stored metadata for ID: ${id}`);
  }

  static get(id: string): any | null {
    return this.store.get(id) || null;
  }

  static has(id: string): boolean {
    return this.store.has(id);
  }
}

export { MetadataStore };

// Authoritative NFT state (write-through to chain)
export interface NftRow {
  asset_id: string
  player_pda: string | null
  name: string
  level: number
  combat_level: number
  total_level: number
  version: string
  // Legacy JSON skills (not used when column model is present)
  skills?: Record<string, { level: number; experience?: number }>
  last_arweave_uri: string | null
  last_update_sig: string | null
  state_version: number
  updated_at: string
}

export class NftState {
  static async get(assetId: string): Promise<NftRow | null> {
    try {
      const { data, error } = await supabase
        .from('nfts')
        .select('*')
        .eq('asset_id', assetId)
        .single();
      if (error) {
        if ((error as any).code === 'PGRST116') return null;
        console.error('❌ NFT get error:', error);
        return null;
      }
      return data as NftRow;
    } catch (e) {
      console.error('❌ NFT get exception:', e);
      return null;
    }
  }
  
  static async upsertFromStats(
    assetId: string,
    playerPda: string | null,
    stats: CharacterStats,
    lastArweaveUri?: string | null,
    lastSig?: string | null
  ): Promise<boolean> {
    try {
      const row = {
        asset_id: assetId,
        player_pda: playerPda,
        name: stats.name,
        level: 1, // Default level since we removed the main character level
        combat_level: stats.combatLevel,
        total_level: stats.totalLevel,
        version: stats.version,
        skills: stats.skills as any,
        last_arweave_uri: lastArweaveUri ?? null,
        last_update_sig: lastSig ?? null,
        updated_at: new Date().toISOString(),
      } as any;

      const { error } = await supabase
        .from('nfts')
        .upsert(row, { onConflict: 'asset_id' });
      if (error) {
        console.error('❌ NFT upsert error:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('❌ NFT upsert exception:', e);
      return false;
    }
  }
}

// Column-based authoritative state
export interface NftColumnsRow {
  asset_id: string
  player_pda: string | null
  name: string
  level: number
  combat_level: number
  total_level: number
  version: string
  // Skill columns removed - skills are now stored exclusively in nft_skill_experience table
  // Skills are fetched via getAllSkillXp() when needed
  last_arweave_uri: string | null
  last_update_sig: string | null
  state_version: number
  updated_at: string
  character_image_url?: string | null // URL of generated character portrait image
}

export class NftColumns {
  private static getPgConn(): string | null {
    // Force REST path unless explicitly disabled
    if (process.env.FORCE_SUPABASE_REST !== 'false') return null
    const supa = process.env.SUPABASE_DB_URL || null
    if (supa) return supa
    if (process.env.ALLOW_DATABASE_URL_FALLBACK === 'true') return process.env.DATABASE_URL || null
    return null
  }
  
  private static needsSsl(conn: string): boolean {
    return process.env.PGSSL === 'true' || /supabase\.(co|net)/i.test(conn) || /render\.com|railway|rlwy\.net/i.test(conn)
  }
  
  static async get(assetId: string): Promise<NftColumnsRow | null> {
    try {
      console.log(`🗄️ [NftColumns.get] assetId=${assetId}`)
      const pgConn = this.getPgConn()
      if (pgConn) {
        try {
          const client: any = new PgClient({ connectionString: pgConn, ssl: this.needsSsl(pgConn) ? { rejectUnauthorized: false } : undefined } as any)
          await client.connect()
          const { rows } = await client.query('select * from nfts where asset_id = $1 limit 1', [assetId])
          await client.end()
          const row = rows?.[0] || null
          console.log(`✅ [NftColumns.get] via PG found=${!!row}`)
          return row as NftColumnsRow | null
        } catch (pgErr) {
          console.error('❌ [NftColumns.get] PG error:', pgErr)
          // fallthrough to supabase
        }
      }
      const { data, error } = await supabase
        .from('nfts')
        .select('*')
        .eq('asset_id', assetId)
        .single()
      if (error) {
        if ((error as any).code === 'PGRST116') return null
        console.error('❌ NFT columns get error:', error)
        return null
      }
      console.log(`✅ [NftColumns.get] found=${!!data}`)
      return data as NftColumnsRow
    } catch (e) {
      console.error('❌ NFT columns get exception:', e)
      return null
    }
  }

  static statsToColumns(stats: CharacterStats) {
    return {
      name: stats.name, // This is the NFT's name - should match nfts.name in database
      combat_level: stats.combatLevel,
      total_level: stats.totalLevel,
      version: stats.version,
      attack: stats.skills.attack?.level ?? 1,
      strength: stats.skills.strength?.level ?? 1,
      defense: stats.skills.defense?.level ?? 1,
      magic: stats.skills.magic?.level ?? 1,
      projectiles: stats.skills.projectiles?.level ?? 1,
      vitality: stats.skills.vitality?.level ?? 1,
      crafting: stats.skills.crafting?.level ?? 1,
      luck: stats.skills.luck?.level ?? 1,
      mining: stats.skills.mining?.level ?? 1,
      woodcutting: stats.skills.woodcutting?.level ?? 1,
      fishing: stats.skills.fishing?.level ?? 1,
      hunting: stats.skills.hunting?.level ?? 1,
      smithing: stats.skills.smithing?.level ?? 1,
      cooking: stats.skills.cooking?.level ?? 1,
      alchemy: stats.skills.alchemy?.level ?? 1,
      construction: stats.skills.construction?.level ?? 1,
    }
  }

  // NOTE: This method now requires skills to be passed in from nft_skill_experience
  // Use columnsToStatsWithSkills() for the async version that fetches skills automatically
  static columnsToStats(row: NftColumnsRow, skills?: Record<string, { level: number; experience: number }>): CharacterStats {
    const { name, combat_level, total_level, version } = row
    
    // If skills not provided, return defaults (caller should use columnsToStatsWithSkills instead)
    const defaultSkills: CharacterStats['skills'] = {
      attack: { level: 1, experience: 0 },
      strength: { level: 1, experience: 0 },
      defense: { level: 1, experience: 0 },
      magic: { level: 1, experience: 0 },
      projectiles: { level: 1, experience: 0 },
      vitality: { level: 1, experience: 0 },
      crafting: { level: 1, experience: 0 },
      luck: { level: 1, experience: 0 },
      mining: { level: 1, experience: 0 },
      woodcutting: { level: 1, experience: 0 },
      fishing: { level: 1, experience: 0 },
      hunting: { level: 1, experience: 0 },
      smithing: { level: 1, experience: 0 },
      cooking: { level: 1, experience: 0 },
      alchemy: { level: 1, experience: 0 },
      construction: { level: 1, experience: 0 },
    }
    
    // Merge skills from nft_skill_experience if provided
    const mergedSkills: CharacterStats['skills'] = skills ? Object.entries(skills).reduce((acc, [skill, data]) => {
      const skillKey = skill as keyof CharacterStats['skills']
      acc[skillKey] = {
        level: data.level,
        experience: data.experience
      }
      return acc
    }, { ...defaultSkills } as CharacterStats['skills']) : defaultSkills
    
    const skillExperience: CharacterStats['skillExperience'] = {
      attack: mergedSkills.attack.experience,
      strength: mergedSkills.strength.experience,
      defense: mergedSkills.defense.experience,
      magic: mergedSkills.magic.experience,
      projectiles: mergedSkills.projectiles.experience,
      vitality: mergedSkills.vitality.experience,
      crafting: mergedSkills.crafting.experience,
      luck: mergedSkills.luck.experience,
      mining: mergedSkills.mining.experience,
      woodcutting: mergedSkills.woodcutting.experience,
      fishing: mergedSkills.fishing.experience,
      hunting: mergedSkills.hunting.experience,
      smithing: mergedSkills.smithing.experience,
      cooking: mergedSkills.cooking.experience,
      alchemy: mergedSkills.alchemy.experience,
      construction: mergedSkills.construction.experience,
    }
    
    return {
      name,
      combatLevel: combat_level,
      totalLevel: total_level,
      version,
      experience: 100, // Default experience
      skills: mergedSkills,
      skillExperience,
    }
  }
  
  // Async version that fetches skills from nft_skill_experience
  static async columnsToStatsWithSkills(row: NftColumnsRow): Promise<CharacterStats> {
    const { getAllSkillXp } = await import('./nft-skill-experience')
    const skills = await getAllSkillXp(row.asset_id)
    return this.columnsToStats(row, skills)
  }

  // Updated to accept skills from CharacterStats instead of reading from row
  static computeTotalsFromSkills(skills: CharacterStats['skills']): { total_level: number; combat_level: number } {
    const attack = skills.attack?.level ?? 1, strength = skills.strength?.level ?? 1, defense = skills.defense?.level ?? 1,
      magic = skills.magic?.level ?? 1, projectiles = skills.projectiles?.level ?? 1, vitality = skills.vitality?.level ?? 1,
      crafting = skills.crafting?.level ?? 1, luck = skills.luck?.level ?? 1,
      mining = skills.mining?.level ?? 1, woodcutting = skills.woodcutting?.level ?? 1, fishing = skills.fishing?.level ?? 1,
      hunting = skills.hunting?.level ?? 1, smithing = skills.smithing?.level ?? 1,
      cooking = skills.cooking?.level ?? 1, alchemy = skills.alchemy?.level ?? 1, construction = skills.construction?.level ?? 1
    const total = attack + strength + defense + magic + projectiles + vitality + crafting + luck + 
                  mining + woodcutting + fishing + hunting + 
                  smithing + cooking + alchemy + construction
    // Combat Level = average of all 6 combat skills (Attack, Strength, Defense, Magic, Projectiles, Vitality)
    const combat = Math.floor((attack + strength + defense + magic + projectiles + vitality) / 6)
    return { total_level: total, combat_level: combat }
  }

  private static mergeMax(existing: Partial<NftColumnsRow> | null, incoming: Partial<NftColumnsRow>): Partial<NftColumnsRow> {
    // Filter out 'farming' from existing if present (legacy column removed)
    const existingFiltered = existing ? { ...existing } : null
    if (existingFiltered && 'farming' in existingFiltered) {
      delete (existingFiltered as any).farming
    }
    // Filter out 'farming' from incoming as well (legacy column removed)
    const incomingFiltered = incoming ? { ...incoming } : {}
    if (incomingFiltered && 'farming' in incomingFiltered) {
      delete (incomingFiltered as any).farming
    }
    // Remove any skill columns that might still be present (they're no longer in the interface)
    const skillColumns = ['attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality', 'crafting', 'luck', 
                          'mining', 'woodcutting', 'fishing', 'hunting', 'smithing', 'cooking', 'alchemy', 'construction']
    if (existingFiltered) {
      skillColumns.forEach(col => delete (existingFiltered as any)[col])
    }
    skillColumns.forEach(col => delete (incomingFiltered as any)[col])
    
    // Only merge metadata columns (skills are stored in nft_skill_experience)
    const res: Partial<NftColumnsRow> = {
      ...existingFiltered,
      ...incomingFiltered,
    }
    return res
  }

  static async upsertMergeMaxFromStats(
    assetId: string,
    playerPda: string | null,
    stats: CharacterStats,
    lastUri?: string | null,
    lastSig?: string | null
  ): Promise<NftColumnsRow | null> {
    const existing = await this.get(assetId)
    const cols = this.statsToColumns(stats) // Only metadata now (no skills)
    const merged = this.mergeMax(existing, cols)
    // Calculate totals from stats.skills (not from row columns)
    const totals = this.computeTotalsFromSkills(stats.skills)
    const row: Partial<NftColumnsRow> = {
      asset_id: assetId,
      player_pda: playerPda,
      ...merged,
      ...totals,
      last_arweave_uri: lastUri ?? existing?.last_arweave_uri ?? null,
      last_update_sig: lastSig ?? existing?.last_update_sig ?? null,
      updated_at: new Date().toISOString(),
    }
    console.log(`📝 [NftColumns.upsertMergeMaxFromStats] assetId=${assetId}`)
    const pgConn = this.getPgConn()
    if (pgConn) {
      try {
        const client: any = new PgClient({ connectionString: pgConn, ssl: this.needsSsl(pgConn) ? { rejectUnauthorized: false } : undefined } as any)
        await client.connect()
        // Updated SQL - removed all skill columns, only metadata columns remain
        const sql = `
          insert into nfts (
            asset_id, player_pda, name, combat_level, total_level, version,
            last_arweave_uri, last_update_sig, updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,
            $7,$8,$9
          ) on conflict (asset_id) do update set
            player_pda = excluded.player_pda,
            name = excluded.name,
            combat_level = excluded.combat_level,
            total_level = excluded.total_level,
            version = excluded.version,
            last_arweave_uri = coalesce(excluded.last_arweave_uri, nfts.last_arweave_uri),
            last_update_sig = coalesce(excluded.last_update_sig, nfts.last_update_sig),
            updated_at = excluded.updated_at,
            state_version = nfts.state_version + 1
          returning *;
        `
        const values = [
          assetId, playerPda, merged.name, totals.combat_level, totals.total_level, merged.version,
          row.last_arweave_uri, row.last_update_sig, row.updated_at
        ]
        const { rows } = await client.query(sql, values)
        await client.end()
        const saved = rows?.[0] || null
        console.log(`✅ [NftColumns.upsertMergeMaxFromStats:PG] saved assetId=${assetId}`)
        return saved as NftColumnsRow | null
      } catch (pgErr) {
        console.error('❌ [NftColumns.upsertMergeMaxFromStats:PG] error:', pgErr)
        // fall back to supabase
      }
    }
    const { data, error } = await supabase
      .from('nfts')
      .upsert(row, { onConflict: 'asset_id' })
      .select('*')
      .single()
    if (error) {
      console.error('❌ [NftColumns.upsertMergeMaxFromStats] supabase error:', error)
      return null
    }
    return data as NftColumnsRow
  }

  static async upsertFromStats(
    assetId: string,
    playerPda: string | null,
    stats: CharacterStats,
    lastUri?: string | null,
    lastSig?: string | null
  ): Promise<NftColumnsRow | null> {
    try {
      const supabaseUrl = process.env.SUPABASE_URL || ''
      const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || ''
      const targetInfo = `supabaseUrlHost=${(() => { try { return new URL(supabaseUrl).host } catch { return supabaseUrl.slice(0, 32) } })()} pgUrlHost=${(() => { try { return new URL(dbUrl).host } catch { return dbUrl.slice(0, 32) } })()}`
      console.log(`📝 [NftColumns.upsertFromStats] assetId=${assetId} playerPda=${playerPda ?? 'null'} targetDB=(${targetInfo})`)

      // Prefer direct PG if configured (Railway/Postgres)
      const pgConn = this.getPgConn()
      if (pgConn) {
        try {
          const client: any = new PgClient({ connectionString: pgConn, ssl: this.needsSsl(pgConn) ? { rejectUnauthorized: false } : undefined } as any)
          await client.connect()
          const cols = this.statsToColumns(stats)
          const totals = this.computeTotalsFromSkills(stats.skills)
          const nowIso = new Date().toISOString()
          // Updated SQL - removed all skill columns, only metadata columns remain
          const sql = `
            insert into nfts (
              asset_id, player_pda, name, combat_level, total_level, version,
              last_arweave_uri, last_update_sig, updated_at
            ) values (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9
            ) on conflict (asset_id) do update set
              player_pda = excluded.player_pda,
              name = excluded.name,
              combat_level = excluded.combat_level,
              total_level = excluded.total_level,
              version = excluded.version,
              last_arweave_uri = excluded.last_arweave_uri,
              last_update_sig = excluded.last_update_sig,
              updated_at = excluded.updated_at,
              state_version = nfts.state_version + 1
            returning *;
          `
          const values = [
            assetId, playerPda, cols.name, totals.combat_level, totals.total_level, cols.version,
            lastUri ?? null, lastSig ?? null, nowIso
          ]
          const { rows } = await client.query(sql, values)
          await client.end()
          const saved = rows?.[0] || null
          console.log(`✅ [NftColumns.upsertFromStats:PG] saved assetId=${assetId}`)
          return saved as NftColumnsRow | null
        } catch (pgErr) {
          console.error('❌ [NftColumns.upsertFromStats:PG] error:', pgErr)
          // fallback to supabase below
        }
      }

      const cols = this.statsToColumns(stats)
      const totals = this.computeTotalsFromSkills(stats.skills)
      const row: Partial<NftColumnsRow> = {
        asset_id: assetId,
        player_pda: playerPda,
        ...cols,
        ...totals,
        last_arweave_uri: lastUri ?? null,
        last_update_sig: lastSig ?? null,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('nfts')
        .upsert(row, { onConflict: 'asset_id' })
        .select('*')
        .single()
      if (error) {
        console.error('❌ [NftColumns.upsertFromStats] upsert error:', error)
        return null
      }
      console.log(`✅ [NftColumns.upsertFromStats] saved assetId=${assetId} name=${cols.name} combatLevel=${totals.combat_level} totalLevel=${totals.total_level}`)
      return data as NftColumnsRow
    } catch (e) {
      console.error('❌ [NftColumns.upsertFromStats] exception:', e)
      return null
    }
  }

  // DEPRECATED: Skills are no longer stored in nfts table
  // Use addSkillXp() from nft-skill-experience.ts instead
  static async incrementSkill(
    assetId: string,
    skill: 'attack' | 'strength' | 'defense' | 'magic' | 'projectiles' | 'vitality' | 'crafting' | 'luck' | 'mining' | 'woodcutting' | 'fishing' | 'hunting' | 'smithing' | 'cooking' | 'alchemy' | 'construction'
  ): Promise<NftColumnsRow | null> {
    console.warn(`⚠️ [NftColumns.incrementSkill] DEPRECATED: Skills are no longer stored in nfts table. Use addSkillXp() from nft-skill-experience.ts instead.`)
    // This method is deprecated - skills are now in nft_skill_experience table
    // Return existing row without modification
    return await this.get(assetId)
  }
}