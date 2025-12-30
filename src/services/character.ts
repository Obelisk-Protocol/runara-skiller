import { CharacterStats, Character } from '../types/character';
import { createCharacterCNFT, updateCharacterCNFT, fetchCharacterFromCNFT, generateDefaultCharacterStats } from './cnft';
import { SkillDatabase, NftColumns } from './database';

// Calculate combat level (Attack + Strength + Defense)
export function calculateCombatLevel(skills: CharacterStats['skills']): number {
  return skills.attack.level + skills.strength.level + skills.defense.level;
}

// Calculate total level (sum of all skills)
export function calculateTotalLevel(skills: CharacterStats['skills']): number {
  return Object.values(skills).reduce((total, skill) => total + skill.level, 0);
}

// Main Character Service
export class CharacterService {
  
  // Create a new character (cNFT + database)
  static async createCharacter(
    playerPDA: string,
    playerId: string,
    characterName: string
  ): Promise<{ success: boolean; character?: Character; error?: string }> {
    try {
      console.log(`🎯 Creating character "${characterName}" for player ${playerId}`);
      
      // Validate inputs
      if (!playerPDA || playerPDA.length < 32) {
        return { success: false, error: 'Invalid player PDA' };
      }
      
      if (!characterName || characterName.trim().length < 1 || characterName.length > 50) {
        return { success: false, error: 'Character name must be 1-50 characters' };
      }
      
      // Create the cNFT first
      const cnftResult = await createCharacterCNFT(playerPDA, characterName.trim());
      
      if (!cnftResult.success || !cnftResult.assetId) {
        return {
          success: false,
          error: cnftResult.error || 'Failed to create cNFT'
        };
      }
      
      // Generate character stats using the new 18-skill structure
      const characterStats = generateDefaultCharacterStats(characterName.trim());
      
      // Store initial authoritative NFT row (per-skill columns)
      await NftColumns.upsertMergeMaxFromStats(cnftResult.assetId, playerPDA, characterStats)
      
      // Initialize skill experience tracking
      await SkillDatabase.getPlayerSkillExperience(playerPDA);
      
      const character: Character = {
        id: cnftResult.assetId,
        characterStats,
        lastSynced: new Date()
      };
      
      console.log('✅ Character created successfully:', cnftResult.assetId);
      return {
        success: true,
        character
      };
      
    } catch (error) {
      console.error('❌ Error creating character:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  // Fetch character (prefer cNFT state first to get latest skill levels)
  static async getCharacter(assetId: string): Promise<Character | null> {
    try {
      console.log(`🔍 Fetching character (chain-first): ${assetId}`);

      // Prefer on-chain state so skill levels never regress to DB defaults
      const cnftCharacter = await fetchCharacterFromCNFT(assetId);
      if (cnftCharacter) {
        console.log(`📝 [getCharacter] Upserting fetched on-chain character assetId=${assetId}`)
        void NftColumns.upsertMergeMaxFromStats(assetId, null, cnftCharacter.characterStats)
        // If DB row exists, prefer it for return to avoid any gateway lag
        const row = await NftColumns.get(assetId)
        if (row) {
          const stats = NftColumns.columnsToStats(row)
          return { id: assetId, characterStats: stats, lastSynced: new Date(row.updated_at) }
        }
        return cnftCharacter;
      }

      // Fallback to column store if chain read fails
      const row = await NftColumns.get(assetId)
      if (row) {
        const stats = NftColumns.columnsToStats(row)
        return { id: assetId, characterStats: stats, lastSynced: new Date(row.updated_at) }
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ Error fetching character:', error);
      return null;
    }
  }
  
  // Train a skill (increase level by 1)
  static async trainSkill(
    assetId: string,
    skillName: keyof CharacterStats['skills'],
    playerPDA?: string
  ): Promise<{ success: boolean; character?: Character; error?: string }> {
    try {
      console.log(`⚔️ Training ${skillName} for character: ${assetId}`);
      
      // Always read current state from chain to avoid stale/default DB values
      const character = await fetchCharacterFromCNFT(assetId);
      if (!character) {
        return {
          success: false,
          error: 'Character not found'
        };
      }
      // Determine baseline from BOTH chain and DB so chain lag doesn't cap at 2
      const dbRow = await NftColumns.get(assetId);
      const dbLevelMap: Partial<Record<keyof CharacterStats['skills'], number>> | null = dbRow
        ? {
            attack: dbRow.attack,
            strength: dbRow.strength,
            defense: dbRow.defense,
            magic: dbRow.magic,
            projectiles: dbRow.projectiles,
            vitality: dbRow.vitality,
            crafting: dbRow.crafting,
            luck: dbRow.luck,
            mining: dbRow.mining,
            woodcutting: dbRow.woodcutting,
            fishing: dbRow.fishing,
            farming: dbRow.farming,
            hunting: dbRow.hunting,
            smithing: dbRow.smithing,
            cooking: dbRow.cooking,
            alchemy: dbRow.alchemy,
            construction: dbRow.construction,
          }
        : null;

      const chainLevel = character.characterStats.skills[skillName]?.level ?? 1;
      const dbLevel = dbLevelMap?.[skillName] ?? 1;
      const currentLevel = Math.max(chainLevel, dbLevel, 1);
      const SKILL_CAP = 99;
      const nextLevel = Math.min(currentLevel + 1, SKILL_CAP);

      // Update skill level (clamped)
      const updatedSkills = {
        ...character.characterStats.skills,
        [skillName]: {
          level: nextLevel,
          experience: nextLevel * 100
        }
      };
      
      // Recalculate combat and total levels
      const combatLevel = calculateCombatLevel(updatedSkills);
      const totalLevel = calculateTotalLevel(updatedSkills);
      
      // Update character stats
      const updatedCharacterStats: CharacterStats = {
        ...character.characterStats,
        skills: updatedSkills,
        combatLevel,
        totalLevel,
        version: '2.0.0' // Mark as current version
      };
      
      // Persist authoritative state first (column model)
      const upserted = await NftColumns.upsertMergeMaxFromStats(assetId, playerPDA || null, updatedCharacterStats)
      
      // Update cNFT
      const cnftResult = await updateCharacterCNFT(
        assetId,
        updatedCharacterStats,
        playerPDA
      );
      
      if (!cnftResult.success) {
        return {
          success: false,
          error: cnftResult.error || 'Failed to update cNFT'
        };
      }
      
      // Re-fetch from chain so returned state reflects the new Arweave JSON
      const refreshed = await fetchCharacterFromCNFT(assetId);
      if (refreshed) {
        console.log(`✅ ${skillName} trained successfully! New level: ${updatedSkills[skillName].level}`);
        return { success: true, character: refreshed };
      }
      // Fallback to local computed state if chain read fails
      return { success: true, character: { id: assetId, characterStats: updatedCharacterStats, lastSynced: new Date() } };
      
    } catch (error) {
      console.error(`❌ Error training ${skillName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  // Level up a primary stat - DEPRECATED (stats system removed)
  /*
  static async levelUpStat(
    assetId: string,
    statName: any, // Changed from keyof CharacterStats['stats'] since stats was removed
    playerPDA?: string
  ): Promise<{ success: boolean; character?: Character; error?: string }> {
    try {
      console.log(`📈 Leveling up ${statName} for character: ${assetId}`);
      
      // Get current character
      const character = await this.getCharacter(assetId);
      if (!character) {
        return {
          success: false,
          error: 'Character not found'
        };
      }
      
      // Update stat
      const updatedStats = {
        ...character.characterStats.stats,
        [statName]: character.characterStats.stats[statName] + 1
      };
      
      // Update character level
      const updatedCharacterStats: CharacterStats = {
        ...character.characterStats,
        stats: updatedStats,
        level: character.characterStats.level + 1,
        experience: (character.characterStats.level + 1) * 100,
        version: '2.0.0'
      };
      
      // Update cNFT
      const cnftResult = await updateCharacterCNFT(
        assetId,
        updatedCharacterStats,
        playerPDA
      );
      
      if (!cnftResult.success) {
        return {
          success: false,
          error: cnftResult.error || 'Failed to update cNFT'
        };
      }
      
      // Persist to column store
      await NftColumns.upsertMergeMaxFromStats(assetId, playerPDA || null, updatedCharacterStats)
      
      const updatedCharacter: Character = {
        id: assetId,
        characterStats: updatedCharacterStats,
        lastSynced: new Date()
      };
      
      console.log(`✅ ${statName} increased! New value: ${updatedStats[statName]}`);
      return {
        success: true,
        character: updatedCharacter
      };
      
    } catch (error) {
      console.error(`❌ Error leveling up ${statName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  */
  
  // Get characters by player ID
  static async getPlayerCharacters(playerId: string): Promise<Character[]> {
    try {
      console.log(`🔍 Fetching characters for player: ${playerId}`);
      
      // Profiles hold asset IDs; we no longer read legacy characters table here.
      const { supabase } = await import('../config/database')
      const { data: profile } = await supabase
        .from('profiles')
        .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5')
        .eq('id', playerId)
        .single()
      const assetIds: string[] = [
        profile?.character_cnft_1,
        profile?.character_cnft_2,
        profile?.character_cnft_3,
        profile?.character_cnft_4,
        profile?.character_cnft_5,
      ].filter(Boolean)
      console.log(`🧾 [getPlayerCharacters] assetIds=${assetIds.join(',') || 'none'}`)
      
      const characters: Character[] = [];
      
      for (const assetId of assetIds) {
        const character = await this.getCharacter(assetId);
        if (character) {
          characters.push(character);
        }
      }
      
      console.log(`✅ Found ${characters.length} characters for player`);
      return characters;
      
    } catch (error) {
      console.error('❌ Error fetching player characters:', error);
      return [];
    }
  }
  
  // Sync character from cNFT to database
  static async syncCharacterFromCNFT(assetId: string): Promise<boolean> {
    try {
      console.log(`🔄 Syncing character from cNFT: ${assetId}`);
      
      const cnftCharacter = await fetchCharacterFromCNFT(assetId);
      if (!cnftCharacter) {
        console.error('❌ Could not fetch character from cNFT');
        return false;
      }
      
      await NftColumns.upsertFromStats(assetId, null, cnftCharacter.characterStats)
      console.log('✅ Character synced from cNFT to database');
      return true;
      
    } catch (error) {
      console.error('❌ Error syncing character from cNFT:', error);
      return false;
    }
  }
}