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
        combat_xp: 0,
        magic_xp: 0,
        crafting_xp: 0,
        exploration_xp: 0,
        gambling_xp: 0,
        combat_level: 1,
        magic_level: 1,
        crafting_level: 1,
        exploration_level: 1,
        gambling_level: 1,
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
    skill: 'combat' | 'magic' | 'crafting' | 'exploration' | 'gambling',
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
    skill: 'combat' | 'magic' | 'crafting' | 'exploration' | 'gambling',
    experienceGain: number,
    source?: string,
    sessionId?: string,
    gameMode?: string,
    additionalData?: any
  ): Promise<boolean> {
    try {
      const logData = {
        player_pda: playerPda,
        skill,
        experience_gain: experienceGain,
        source,
        session_id: sessionId,
        game_mode: gameMode,
        additional_data: additionalData
      };

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
        level: stats.level,
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
  att: number
  str: number
  def: number
  mag: number
  pro: number
  vit: number
  cra: number
  luc: number
  gat: number
  last_arweave_uri: string | null
  last_update_sig: string | null
  state_version: number
  updated_at: string
}

export class NftColumns {
  private static getPgConn(): string | null {
    return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null
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
      name: stats.name,
      level: stats.level,
      combat_level: stats.combatLevel,
      total_level: stats.totalLevel,
      version: stats.version,
      att: stats.skills.attack?.level ?? 1,
      str: stats.skills.strength?.level ?? 1,
      def: stats.skills.defense?.level ?? 1,
      mag: stats.skills.magic?.level ?? 1,
      pro: stats.skills.projectiles?.level ?? 1,
      vit: stats.skills.vitality?.level ?? 1,
      cra: stats.skills.crafting?.level ?? 1,
      luc: stats.skills.luck?.level ?? 1,
      gat: stats.skills.gathering?.level ?? 1,
    }
  }

  static columnsToStats(row: NftColumnsRow): CharacterStats {
    const { name, level, combat_level, total_level, version } = row
    return {
      name,
      level,
      combatLevel: combat_level,
      totalLevel: total_level,
      version,
      characterClass: 'Adventurer',
      stats: { str: 10, agi: 10, int: 10, vit: 10, luk: 10 },
      experience: level * 100,
      skills: {
        attack: { level: row.att, experience: row.att * 100 },
        strength: { level: row.str, experience: row.str * 100 },
        defense: { level: row.def, experience: row.def * 100 },
        magic: { level: row.mag, experience: row.mag * 100 },
        projectiles: { level: row.pro, experience: row.pro * 100 },
        vitality: { level: row.vit, experience: row.vit * 100 },
        crafting: { level: row.cra, experience: row.cra * 100 },
        luck: { level: row.luc, experience: row.luc * 100 },
        gathering: { level: row.gat, experience: row.gat * 100 },
      },
      skillExperience: {
        attack: 0, strength: 0, defense: 0, magic: 0,
        projectiles: 0, vitality: 0, crafting: 0, luck: 0, gathering: 0,
      },
      achievements: ['First Character'],
      equipment: { weapon: 'None', armor: 'None', accessory: 'None' }
    }
  }

  static computeTotals(row: Partial<NftColumnsRow>): { total_level: number; combat_level: number } {
    const att = row.att ?? 1, str = row.str ?? 1, def = row.def ?? 1,
      mag = row.mag ?? 1, pro = row.pro ?? 1, vit = row.vit ?? 1,
      cra = row.cra ?? 1, luc = row.luc ?? 1, gat = row.gat ?? 1
    const total = att + str + def + mag + pro + vit + cra + luc + gat
    const melee = (att + str + def) / 3
    const magicStyle = (mag * 1.5 + def) / 2.5
    const projectileStyle = (pro + def) / 2
    const combat = Math.floor(Math.max(melee, magicStyle, projectileStyle) + vit * 0.25)
    return { total_level: total, combat_level: combat }
  }

  private static mergeMax(existing: Partial<NftColumnsRow> | null, incoming: Partial<NftColumnsRow>): Partial<NftColumnsRow> {
    const pickMax = (a?: number, b?: number) => Math.max(a ?? 1, b ?? 1)
    const res: Partial<NftColumnsRow> = {
      ...existing,
      ...incoming,
    }
    const skills: (keyof NftColumnsRow)[] = ['att','str','def','mag','pro','vit','cra','luc','gat']
    for (const k of skills) {
      const e = (existing as any)?.[k]
      const i = (incoming as any)?.[k]
      ;(res as any)[k] = pickMax(e, i)
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
    const cols = this.statsToColumns(stats)
    const merged = this.mergeMax(existing, cols)
    const totals = this.computeTotals(merged)
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
        const sql = `
          insert into nfts (
            asset_id, player_pda, name, level, combat_level, total_level, version,
            att, str, def, mag, pro, vit, cra, luc, gat,
            last_arweave_uri, last_update_sig, updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,
            $8,$9,$10,$11,$12,$13,$14,$15,$16,
            $17,$18,$19
          ) on conflict (asset_id) do update set
            player_pda = excluded.player_pda,
            name = excluded.name,
            level = excluded.level,
            combat_level = excluded.combat_level,
            total_level = excluded.total_level,
            version = excluded.version,
            att = greatest(nfts.att, excluded.att),
            str = greatest(nfts.str, excluded.str),
            def = greatest(nfts.def, excluded.def),
            mag = greatest(nfts.mag, excluded.mag),
            pro = greatest(nfts.pro, excluded.pro),
            vit = greatest(nfts.vit, excluded.vit),
            cra = greatest(nfts.cra, excluded.cra),
            luc = greatest(nfts.luc, excluded.luc),
            gat = greatest(nfts.gat, excluded.gat),
            last_arweave_uri = coalesce(excluded.last_arweave_uri, nfts.last_arweave_uri),
            last_update_sig = coalesce(excluded.last_update_sig, nfts.last_update_sig),
            updated_at = excluded.updated_at,
            state_version = nfts.state_version + 1
          returning *;
        `
        const values = [
          assetId, playerPda, merged.name, (merged as any).level, totals.combat_level, totals.total_level, merged.version,
          (merged as any).att, (merged as any).str, (merged as any).def, (merged as any).mag, (merged as any).pro,
          (merged as any).vit, (merged as any).cra, (merged as any).luc, (merged as any).gat,
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
          const totals = this.computeTotals(cols)
          const nowIso = new Date().toISOString()
          const sql = `
            insert into nfts (
              asset_id, player_pda, name, level, combat_level, total_level, version,
              att, str, def, mag, pro, vit, cra, luc, gat,
              last_arweave_uri, last_update_sig, updated_at
            ) values (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9,$10,$11,$12,$13,$14,$15,$16,
              $17,$18,$19
            ) on conflict (asset_id) do update set
              player_pda = excluded.player_pda,
              name = excluded.name,
              level = excluded.level,
              combat_level = excluded.combat_level,
              total_level = excluded.total_level,
              version = excluded.version,
              att = excluded.att,
              str = excluded.str,
              def = excluded.def,
              mag = excluded.mag,
              pro = excluded.pro,
              vit = excluded.vit,
              cra = excluded.cra,
              luc = excluded.luc,
              gat = excluded.gat,
              last_arweave_uri = excluded.last_arweave_uri,
              last_update_sig = excluded.last_update_sig,
              updated_at = excluded.updated_at,
              state_version = nfts.state_version + 1
            returning *;
          `
          const values = [
            assetId, playerPda, cols.name, cols.level, totals.combat_level, totals.total_level, cols.version,
            cols.att, cols.str, cols.def, cols.mag, cols.pro, cols.vit, cols.cra, cols.luc, cols.gat,
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
      const totals = this.computeTotals(cols)
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
      console.log(`✅ [NftColumns.upsertFromStats] saved assetId=${assetId} name=${cols.name} att=${cols.att} str=${cols.str} def=${cols.def}`)
      return data as NftColumnsRow
    } catch (e) {
      console.error('❌ [NftColumns.upsertFromStats] exception:', e)
      return null
    }
  }

  static async incrementSkill(
    assetId: string,
    skill: 'attack' | 'strength' | 'defense' | 'magic' | 'projectiles' | 'vitality' | 'crafting' | 'luck' | 'gathering'
  ): Promise<NftColumnsRow | null> {
    console.log(`🧮 [NftColumns.incrementSkill] assetId=${assetId} skill=${skill}`)
    const existing = await this.get(assetId)
    if (!existing) return null
    const map: Record<string, keyof NftColumnsRow> = {
      attack: 'att', strength: 'str', defense: 'def', magic: 'mag', projectiles: 'pro', vitality: 'vit', crafting: 'cra', luck: 'luc', gathering: 'gat'
    }
    const col = map[skill]
    const nextVal = (existing as any)[col] + 1
    const update: any = { [col]: nextVal }
    const totals = this.computeTotals({ ...existing, ...update })
    const { data, error } = await supabase
      .from('nfts')
      .update({ ...update, ...totals, updated_at: new Date().toISOString(), state_version: (existing.state_version ?? 0) + 1 })
      .eq('asset_id', assetId)
      .select('*')
      .single()
    if (error) {
      console.error('❌ [NftColumns.incrementSkill] error:', error)
      return null
    }
    console.log(`✅ [NftColumns.incrementSkill] ${String(col)}=${nextVal}`)
    return data as NftColumnsRow
  }
}