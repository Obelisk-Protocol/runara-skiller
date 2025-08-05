import { CharacterStats, Character } from '../types/character';
import { createCharacterCNFT, updateCharacterCNFT, fetchCharacterFromCNFT } from './cnft';
import { CharacterDatabase, SkillDatabase } from './database';

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
    characterName: string,
    characterClass: string = 'Adventurer'
  ): Promise<{ success: boolean; character?: Character; error?: string }> {
    try {
      console.log(`🎯 Creating character "${characterName}" for player ${playerId}`);
      
      // Create the cNFT first
      const cnftResult = await createCharacterCNFT(playerPDA, characterName, characterClass);
      
      if (!cnftResult.success || !cnftResult.assetId) {
        return {
          success: false,
          error: cnftResult.error || 'Failed to create cNFT'
        };
      }
      
      // Generate character stats
      const characterStats: CharacterStats = {
        name: characterName,
        level: 1,
        combatLevel: 3,
        totalLevel: 9,
        characterClass,
        version: '2.0.0',
        stats: {
          str: 10,
          agi: 10,
          int: 10,
          vit: 10,
          luk: 10
        },
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
          attack: 0,
          strength: 0,
          defense: 0,
          magic: 0,
          projectiles: 0,
          vitality: 0,
          crafting: 0,
          luck: 0,
          gathering: 0
        },
        achievements: ['First Character'],
        equipment: {
          weapon: 'None',
          armor: 'None',
          accessory: 'None'
        }
      };
      
      // Store in database
      const dbCharacter = await CharacterDatabase.createCharacter(
        cnftResult.assetId,
        playerId,
        characterStats
      );
      
      if (!dbCharacter) {
        console.warn('⚠️ Character cNFT created but database storage failed');
      }
      
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
  
  // Fetch character (try database first, then cNFT)
  static async getCharacter(assetId: string): Promise<Character | null> {
    try {
      console.log(`🔍 Fetching character: ${assetId}`);
      
      // Try database first for faster response
      const dbCharacter = await CharacterDatabase.getCharacterByCnftId(assetId);
      
      if (dbCharacter) {
        console.log('✅ Character found in database');
        
        // Convert database format to CharacterStats
        const characterStats: CharacterStats = {
          name: dbCharacter.character_name,
          level: dbCharacter.character_level,
          combatLevel: dbCharacter.combat_level,
          totalLevel: dbCharacter.total_level,
          characterClass: dbCharacter.character_class,
          version: dbCharacter.version,
          stats: {
            str: dbCharacter.strength,
            agi: dbCharacter.agility,
            int: dbCharacter.intelligence,
            vit: dbCharacter.vitality,
            luk: dbCharacter.luck
          },
          experience: dbCharacter.experience,
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
            attack: 0,
            strength: 0,
            defense: 0,
            magic: 0,
            projectiles: 0,
            vitality: 0,
            crafting: 0,
            luck: 0,
            gathering: 0
          },
          achievements: dbCharacter.achievements,
          equipment: {
            weapon: dbCharacter.equipped_weapon || 'None',
            armor: dbCharacter.equipped_armor || 'None',
            accessory: dbCharacter.equipped_accessory || 'None'
          }
        };
        
        return {
          id: assetId,
          characterStats,
          lastSynced: new Date(dbCharacter.last_synced_to_cnft || dbCharacter.updated_at)
        };
      }
      
      // Fallback to cNFT if not in database
      console.log('⚠️ Character not in database, fetching from cNFT...');
      const cnftCharacter = await fetchCharacterFromCNFT(assetId);
      
      if (cnftCharacter) {
        console.log('✅ Character fetched from cNFT, syncing to database...');
        // Sync to database for future fast access
        await CharacterDatabase.updateCharacter(assetId, cnftCharacter.characterStats);
      }
      
      return cnftCharacter;
      
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
      
      // Get current character
      const character = await this.getCharacter(assetId);
      if (!character) {
        return {
          success: false,
          error: 'Character not found'
        };
      }
      
      // Update skill level
      const updatedSkills = {
        ...character.characterStats.skills,
        [skillName]: {
          level: character.characterStats.skills[skillName].level + 1,
          experience: (character.characterStats.skills[skillName].level + 1) * 100
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
      
      // Update database
      await CharacterDatabase.updateCharacter(assetId, updatedCharacterStats);
      
      const updatedCharacter: Character = {
        id: assetId,
        characterStats: updatedCharacterStats,
        lastSynced: new Date()
      };
      
      console.log(`✅ ${skillName} trained successfully! New level: ${updatedSkills[skillName].level}`);
      return {
        success: true,
        character: updatedCharacter
      };
      
    } catch (error) {
      console.error(`❌ Error training ${skillName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  // Level up a primary stat
  static async levelUpStat(
    assetId: string,
    statName: keyof CharacterStats['stats'],
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
      
      // Update database
      await CharacterDatabase.updateCharacter(assetId, updatedCharacterStats);
      
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
  
  // Get characters by player ID
  static async getPlayerCharacters(playerId: string): Promise<Character[]> {
    try {
      console.log(`🔍 Fetching characters for player: ${playerId}`);
      
      const dbCharacters = await CharacterDatabase.getCharactersByPlayerId(playerId);
      
      const characters: Character[] = [];
      
      for (const dbChar of dbCharacters) {
        const character = await this.getCharacter(dbChar.character_cnft_id);
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
      
      const success = await CharacterDatabase.updateCharacter(
        assetId,
        cnftCharacter.characterStats
      );
      
      if (success) {
        console.log('✅ Character synced from cNFT to database');
      }
      
      return success;
      
    } catch (error) {
      console.error('❌ Error syncing character from cNFT:', error);
      return false;
    }
  }
}