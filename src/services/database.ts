import { supabase } from '../config/database';
import { DatabaseCharacter, PlayerSkillExperience, ExperienceLog, CharacterStats } from '../types/character';

// Character database operations
export class CharacterDatabase {
  
  // Create new character record
  static async createCharacter(
    characterCnftId: string,
    playerId: string,
    characterStats: CharacterStats
  ): Promise<DatabaseCharacter | null> {
    try {
      const characterData = {
        character_cnft_id: characterCnftId,
        player_id: playerId,
        character_name: characterStats.name,
        character_level: characterStats.level,
        character_class: characterStats.characterClass,
        combat_level: characterStats.combatLevel,
        total_level: characterStats.totalLevel,
        experience: characterStats.experience,
        version: characterStats.version,
        strength: characterStats.stats.str,
        agility: characterStats.stats.agi,
        intelligence: characterStats.stats.int,
        vitality: characterStats.stats.vit,
        luck: characterStats.stats.luk,
        equipped_weapon: characterStats.equipment.weapon,
        equipped_armor: characterStats.equipment.armor,
        equipped_accessory: characterStats.equipment.accessory,
        achievements: characterStats.achievements
      };

      const { data, error } = await supabase
        .from('characters')
        .insert([characterData])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating character in database:', error);
        return null;
      }

      console.log('✅ Character created in database:', data.id);
      return data;
    } catch (error) {
      console.error('❌ Database error creating character:', error);
      return null;
    }
  }

  // Update character record
  static async updateCharacter(
    characterCnftId: string,
    characterStats: CharacterStats
  ): Promise<boolean> {
    try {
      const updateData = {
        character_name: characterStats.name,
        character_level: characterStats.level,
        character_class: characterStats.characterClass,
        combat_level: characterStats.combatLevel,
        total_level: characterStats.totalLevel,
        experience: characterStats.experience,
        version: characterStats.version,
        strength: characterStats.stats.str,
        agility: characterStats.stats.agi,
        intelligence: characterStats.stats.int,
        vitality: characterStats.stats.vit,
        luck: characterStats.stats.luk,
        equipped_weapon: characterStats.equipment.weapon,
        equipped_armor: characterStats.equipment.armor,
        equipped_accessory: characterStats.equipment.accessory,
        achievements: characterStats.achievements,
        updated_at: new Date().toISOString(),
        last_synced_to_cnft: new Date().toISOString()
      };

      const { error } = await supabase
        .from('characters')
        .update(updateData)
        .eq('character_cnft_id', characterCnftId);

      if (error) {
        console.error('❌ Error updating character in database:', error);
        return false;
      }

      console.log('✅ Character updated in database');
      return true;
    } catch (error) {
      console.error('❌ Database error updating character:', error);
      return false;
    }
  }

  // Get character by cNFT ID
  static async getCharacterByCnftId(characterCnftId: string): Promise<DatabaseCharacter | null> {
    try {
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .eq('character_cnft_id', characterCnftId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        console.error('❌ Error fetching character:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Database error fetching character:', error);
      return null;
    }
  }

  // Get characters by player ID
  static async getCharactersByPlayerId(playerId: string): Promise<DatabaseCharacter[]> {
    try {
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching characters by player:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ Database error fetching characters:', error);
      return [];
    }
  }
}

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