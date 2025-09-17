// Character types matching your frontend exactly

export interface SkillData {
  level: number;
  experience: number;
}

export interface CharacterStats {
  name: string;
  combatLevel: number;
  totalLevel: number;
  version: string;
  experience: number;
  skills: {
    // Combat Skills
    attack: SkillData;
    strength: SkillData;
    defense: SkillData;
    magic: SkillData;
    projectiles: SkillData;
    vitality: SkillData;
    // Gathering Skills
    mining: SkillData;
    woodcutting: SkillData;
    fishing: SkillData;
    farming: SkillData;
    hunting: SkillData;
    // Crafting Skills
    smithing: SkillData;
    crafting: SkillData;
    cooking: SkillData;
    alchemy: SkillData;
    construction: SkillData;
    // Unique Skills
    luck: SkillData;
  };
  skillExperience: {
    // Combat Skills
    attack: number;
    strength: number;
    defense: number;
    magic: number;
    projectiles: number;
    vitality: number;
    // Gathering Skills
    mining: number;
    woodcutting: number;
    fishing: number;
    farming: number;
    hunting: number;
    // Crafting Skills
    smithing: number;
    crafting: number;
    cooking: number;
    alchemy: number;
    construction: number;
    // Unique Skills
    luck: number;
  };
}

export interface Character {
  id: string; // cNFT address
  characterStats: CharacterStats;
  lastSynced?: Date;
}

// Database types
export interface DatabaseCharacter {
  id: string;
  character_cnft_id: string;
  player_id: string;
  character_name: string;
  character_level: number;
  character_class: string;
  combat_level: number;
  total_level: number;
  experience: number;
  version: string;
  strength: number;
  agility: number;
  intelligence: number;
  vitality: number;
  luck: number;
  equipped_weapon?: string;
  equipped_armor?: string;
  equipped_accessory?: string;
  achievements: string[];
  created_at: string;
  updated_at: string;
  last_synced_to_cnft?: string;
}

// Skill tracking types
export interface PlayerSkillExperience {
  player_pda: string;
  combat_xp: number;
  magic_xp: number;
  crafting_xp: number;
  exploration_xp: number;
  gambling_xp: number;
  combat_level: number;
  magic_level: number;
  crafting_level: number;
  exploration_level: number;
  gambling_level: number;
  last_onchain_sync: string;
  pending_onchain_update: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExperienceLog {
  id: number;
  player_pda: string;
  skill: 'combat' | 'magic' | 'crafting' | 'exploration' | 'gambling';
  experience_gain: number;
  source?: string;
  timestamp: string;
  session_id?: string;
  game_mode?: string;
  additional_data?: any;
}

// API request/response types
export interface CreateCharacterRequest {
  playerPDA: string;
  characterName: string;
  characterClass?: string;
}

export interface UpdateCharacterStatsRequest {
  assetId: string;
  characterStats: CharacterStats;
  playerPDA?: string;
}

export interface TrainSkillRequest {
  assetId: string;
  skillName: keyof CharacterStats['skills'];
  playerPDA?: string;
}

export interface FetchCharactersRequest {
  playerId: string;
}