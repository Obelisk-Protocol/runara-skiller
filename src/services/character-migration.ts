// Character Migration System for Skill Updates

export const GAME_VERSIONS = {
  "1.0.0": {
    skills: ['combat', 'magic', 'crafting', 'exploration'],
    description: "Initial release with core skills"
  },
  "1.1.0": {
    skills: ['combat', 'magic', 'crafting', 'exploration', 'gambling'],
    description: "Added gambling skill for casino games"
  },
  "2.0.0": {
    skills: ['attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality', 'crafting', 'luck', 'gathering'],
    combatSkills: ['attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality'],
    nonCombatSkills: ['crafting', 'luck', 'gathering'],
    description: "Major overhaul: New 9-skill system with combat level formula"
  }
};

export const CURRENT_VERSION = "2.0.0"; // Updated to new 9-skill system

export interface SkillData {
  level: number;
  experience: number;
}

export interface CharacterData {
  name: string;
  level: number; // Character level (for skill points)
  combatLevel?: number; // Combat effectiveness (calculated from combat skills)
  totalLevel?: number; // Sum of all skill levels
  
  // Legacy stats (will be removed in v2.0.0)
  stats?: {
    str: number;
    agi: number;
    int: number;
    vit: number;
    luk: number;
  };
  
  // New 9-skill system
  skills: Record<string, SkillData>;
  skillPoints?: number; // Available points to spend on stats
  
  // Character progression
  experience?: number; // Character XP (for leveling)
  
  // Legacy support
  skillExperience?: Record<string, number>; // Old format
  
  // Metadata
  version?: string;
  lastUpdated?: number;
  achievements?: string[];
  equipment?: {
    weapon?: string;
    armor?: string;
    accessory?: string;
  };
}

// Check if character needs migration
export function needsMigration(character: CharacterData): boolean {
  const charVersion = character.version || "1.0.0";
  return charVersion < CURRENT_VERSION;
}

// Get missing skills for a character
export function getMissingSkills(character: CharacterData): string[] {
  const charVersion = character.version || "1.0.0";
  const currentSkills = GAME_VERSIONS[CURRENT_VERSION].skills;
  const characterSkills = Object.keys(character.skills || {});
  
  return currentSkills.filter(skill => !characterSkills.includes(skill));
}

// Calculate combat level from 6 combat skills
export function calculateCombatLevel(skills: Record<string, SkillData>): number {
  const attack = skills.attack?.level || 1;
  const strength = skills.strength?.level || 1;
  const defense = skills.defense?.level || 1;
  const magic = skills.magic?.level || 1;
  const projectiles = skills.projectiles?.level || 1;
  const vitality = skills.vitality?.level || 1;

  // Melee combat level
  const meleeCombat = (attack + strength + defense) / 3;
  
  // Magic combat level  
  const magicCombat = (magic * 1.5 + defense) / 2.5;
  
  // Projectile combat level
  const projectileCombat = (projectiles + defense) / 2;
  
  // Take the highest combat style
  const primaryCombat = Math.max(meleeCombat, magicCombat, projectileCombat);
  
  // Add vitality bonus (health is always important)
  const vitalityBonus = vitality * 0.25;
  
  // Final combat level (only from combat skills)
  return Math.floor(primaryCombat + vitalityBonus);
}

// Calculate total level (sum of all skills)
export function calculateTotalLevel(skills: Record<string, SkillData>): number {
  return Object.values(skills).reduce((sum, skill) => sum + skill.level, 0);
}

// Migrate character data to current version
export function migrateCharacter(character: CharacterData): CharacterData {
  if (!needsMigration(character)) {
    return character;
  }

  console.log(`🔄 Migrating ${character.name} from v${character.version || '1.0.0'} to v${CURRENT_VERSION}`);

  const migrated: CharacterData = {
    ...character,
    version: CURRENT_VERSION,
    lastUpdated: Date.now()
  };

  // Ensure skills object exists
  if (!migrated.skills) {
    migrated.skills = {};
  }

  // Handle major v2.0.0 migration (old skills → new 9-skill system)
  if ((character.version || '1.0.0') < '2.0.0') {
    console.log('🚀 Major migration to v2.0.0 skill system...');
    
    // Map old skills to new skills
    const oldSkills = { ...migrated.skills };
    migrated.skills = {};
    
    // Map legacy skills to new system
    if (oldSkills.combat) {
      // Split old combat into attack/strength
      const combatLevel = oldSkills.combat.level || oldSkills.combat as any || 1;
      migrated.skills.attack = { level: combatLevel, experience: getExperienceForLevel(combatLevel) };
      migrated.skills.strength = { level: Math.max(1, combatLevel - 5), experience: getExperienceForLevel(Math.max(1, combatLevel - 5)) };
    }
    
    if (oldSkills.magic) {
      migrated.skills.magic = oldSkills.magic;
    }
    
    if (oldSkills.crafting) {
      migrated.skills.crafting = oldSkills.crafting;
    }
    
    if (oldSkills.gambling) {
      migrated.skills.luck = oldSkills.gambling; // Rename gambling → luck
    }
    
    // Map legacy stats to new skills if available
    if (character.stats) {
      // Use legacy stats to initialize some skills
      migrated.skills.vitality = { 
        level: Math.max(1, Math.floor(character.stats.vit / 2)), 
        experience: getExperienceForLevel(Math.max(1, Math.floor(character.stats.vit / 2)))
      };
    }
  }

  // Handle legacy skillExperience format
  if (character.skillExperience && !migrated.skills.attack?.experience) {
    console.log('📦 Converting legacy skillExperience format...');
    Object.entries(character.skillExperience).forEach(([skillName, exp]) => {
      if (typeof exp === 'number') {
        const level = getLevelFromExperience(exp);
        migrated.skills[skillName] = { level, experience: exp };
      }
    });
  }

  // Add missing skills from current version (PRESERVE EXISTING LEVELS)
  const requiredSkills = GAME_VERSIONS[CURRENT_VERSION].skills;
  requiredSkills.forEach(skillName => {
    if (!migrated.skills[skillName]) {
      migrated.skills[skillName] = { level: 1, experience: 0 };
      console.log(`➕ Added ${skillName} skill to ${character.name}`);
    } else {
      // PRESERVE existing skill levels (don't overwrite trained skills)
      console.log(`✅ Preserved ${skillName} skill at level ${migrated.skills[skillName].level}`);
    }
  });

  // Validate all skills have proper structure
  Object.keys(migrated.skills).forEach(skillName => {
    const skill = migrated.skills[skillName];
    if (typeof skill === 'number') {
      // Legacy format: just a level number
      migrated.skills[skillName] = { level: skill, experience: getExperienceForLevel(skill) };
    } else if (!skill.experience) {
      // Missing experience, calculate from level
      skill.experience = getExperienceForLevel(skill.level);
    }
  });

  // Calculate new combat and total levels
  migrated.combatLevel = calculateCombatLevel(migrated.skills);
  migrated.totalLevel = calculateTotalLevel(migrated.skills);
  
  // CRITICAL: Mark as v2.0.0 to prevent future migrations
  migrated.version = CURRENT_VERSION;

  console.log(`✅ Migration complete for ${character.name} - Combat Level: ${migrated.combatLevel}, Total Level: ${migrated.totalLevel}`);
  return migrated;
}

// Migration announcement for players
export function getMigrationMessage(character: CharacterData): string | null {
  if (!needsMigration(character)) return null;

  const missingSkills = getMissingSkills(character);
  const versionInfo = GAME_VERSIONS[CURRENT_VERSION];

  return `🎉 New skills available! ${missingSkills.join(', ')} have been added to your character. ${versionInfo.description}`;
}

// Experience table for skill level calculations
const SKILL_EXPERIENCE_TABLE = [
  0, 83, 174, 276, 388, 512, 650, 801, 969, 1154, 1358, 1584, 1833, 2107, 2411,
  2746, 3115, 3523, 3973, 4470, 5018, 5624, 6291, 7028, 7842, 8740, 9730, 10824,
  12031, 13363, 14833, 16456, 18247, 20224, 22406, 24815, 27473, 30408, 33648, 37224,
  41171, 45529, 50339, 55649, 61512, 67983, 75127, 83014, 91721, 101333, 111945
];

function getLevelFromExperience(experience: number): number {
  for (let i = SKILL_EXPERIENCE_TABLE.length - 1; i >= 0; i--) {
    if (experience >= SKILL_EXPERIENCE_TABLE[i]) {
      return i;
    }
  }
  return 1;
}

function getExperienceForLevel(level: number): number {
  return SKILL_EXPERIENCE_TABLE[Math.min(level, SKILL_EXPERIENCE_TABLE.length - 1)] || 0;
}

