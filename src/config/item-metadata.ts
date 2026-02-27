/**
 * 🎮 cNFT Item Metadata System
 * 
 * Comprehensive metadata definitions for all basic items and materials
 * that can be minted as compressed NFTs in Runara
 */

export interface CNFTAttribute {
  trait_type: string;
  value: string | number;
}

export interface CNFTMetadata {
  name: string;
  description: string;
  image: string;
  external_url?: string;
  attributes: CNFTAttribute[];
  properties?: {
    files: Array<{
      uri: string;
      type: string;
    }>;
    category: string;
  };
}

export interface ItemDefinition {
  id: string;
  name: string;
  category: 'material' | 'consumable' | 'equipment' | 'weapon' | 'armor';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  description: string;
  imageFileName: string; // For placeholder image generation
  sellValue: number; // Base sell value in gold
  stackable: boolean;
  attributes: Record<string, string | number>;
}

// 📦 BASIC MATERIALS (Common crafting components)
export const BASIC_MATERIALS: ItemDefinition[] = [
  // Ore & Metals
  {
    id: 'iron_ore',
    name: 'Iron Ore',
    category: 'material',
    rarity: 'common',
    description: 'Raw iron ore extracted from deep mines. Essential for basic metalworking.',
    imageFileName: 'iron-ore.png',
    sellValue: 5,
    stackable: true,
    attributes: {
      material_type: 'metal',
      hardness: 'medium',
      source: 'mining'
    }
  },
  {
    id: 'mithril_ore',
    name: 'Mithril Ore',
    category: 'material',
    rarity: 'uncommon',
    description: 'Rare silvery ore that gleams with inner light. Prized by master smiths.',
    imageFileName: 'mithril-ore.png',
    sellValue: 25,
    stackable: true,
    attributes: {
      material_type: 'metal',
      hardness: 'high',
      source: 'deep_mining'
    }
  },
  {
    id: 'steel_ingot',
    name: 'Steel Ingot',
    category: 'material',
    rarity: 'common',
    description: 'Refined steel ready for crafting. The backbone of quality equipment.',
    imageFileName: 'steel-ingot.png',
    sellValue: 15,
    stackable: true,
    attributes: {
      material_type: 'metal',
      quality: 'refined',
      source: 'smelting'
    }
  },
  {
    id: 'gold_ingot',
    name: 'Gold Ingot',
    category: 'material',
    rarity: 'uncommon',
    description: 'Pure gold ingot that never tarnishes. Used for premium equipment.',
    imageFileName: 'gold-ingot.png',
    sellValue: 50,
    stackable: true,
    attributes: {
      material_type: 'precious_metal',
      purity: 'high',
      source: 'smelting'
    }
  },
  {
    id: 'silver_ingot',
    name: 'Silver Ingot',
    category: 'material',
    rarity: 'common',
    description: 'Refined silver with magical conductivity properties.',
    imageFileName: 'silver-ingot.png',
    sellValue: 30,
    stackable: true,
    attributes: {
      material_type: 'precious_metal',
      magical_conductivity: 'medium',
      source: 'smelting'
    }
  },

  // Wood & Organic Materials
  {
    id: 'oak_wood',
    name: 'Oak Wood',
    category: 'material',
    rarity: 'common',
    description: 'Sturdy oak planks perfect for weapon handles and basic equipment.',
    imageFileName: 'oak-wood.png',
    sellValue: 3,
    stackable: true,
    attributes: {
      material_type: 'wood',
      durability: 'high',
      source: 'forestry'
    }
  },
  {
    id: 'enchanted_leather',
    name: 'Enchanted Leather',
    category: 'material',
    rarity: 'uncommon',
    description: 'Leather infused with protective enchantments. Flexible yet strong.',
    imageFileName: 'enchanted-leather.png',
    sellValue: 20,
    stackable: true,
    attributes: {
      material_type: 'leather',
      enchantment: 'protection',
      source: 'magical_tanning'
    }
  },

  // Monster Drops
  {
    id: 'goblin_hide',
    name: 'Goblin Hide',
    category: 'material',
    rarity: 'common',
    description: 'Tough hide from defeated goblins. Surprisingly durable for its size.',
    imageFileName: 'goblin-hide.png',
    sellValue: 4,
    stackable: true,
    attributes: {
      material_type: 'hide',
      source: 'goblin',
      toughness: 'medium'
    }
  },
  {
    id: 'bat_wing',
    name: 'Bat Wing',
    category: 'material',
    rarity: 'common',
    description: 'Leathery wing membrane from cave bats. Used in alchemy and light armor.',
    imageFileName: 'bat-wing.png',
    sellValue: 8,
    stackable: true,
    attributes: {
      material_type: 'membrane',
      source: 'flying_vampire',
      flexibility: 'high'
    }
  },
  {
    id: 'undead_bone_dust',
    name: 'Undead Bone Dust',
    category: 'material',
    rarity: 'uncommon',
    description: 'Powdered bones from ancient undead. Radiates dark energy.',
    imageFileName: 'bone-dust.png',
    sellValue: 15,
    stackable: true,
    attributes: {
      material_type: 'bone',
      source: 'undead',
      dark_energy: 'medium'
    }
  },
  {
    id: 'dragon_scale',
    name: 'Dragon Scale',
    category: 'material',
    rarity: 'epic',
    description: 'A massive scale from an ancient dragon. Nearly indestructible.',
    imageFileName: 'dragon-scale.png',
    sellValue: 200,
    stackable: true,
    attributes: {
      material_type: 'scale',
      source: 'dragon',
      fire_resistance: 'very_high',
      durability: 'legendary'
    }
  },
  {
    id: 'spider_silk',
    name: 'Spider Silk',
    category: 'material',
    rarity: 'common',
    description: 'Strong silk threads from giant spiders. Lighter than steel.',
    imageFileName: 'spider-silk.png',
    sellValue: 6,
    stackable: true,
    attributes: {
      material_type: 'silk',
      source: 'spider',
      tensile_strength: 'very_high',
      weight: 'minimal'
    }
  },
  {
    id: 'wolf_pelt',
    name: 'Wolf Pelt',
    category: 'material',
    rarity: 'common',
    description: 'Thick fur from wild wolves. Provides excellent insulation.',
    imageFileName: 'wolf-pelt.png',
    sellValue: 7,
    stackable: true,
    attributes: {
      material_type: 'fur',
      source: 'wolf_vader',
      insulation: 'high',
      warmth: 'excellent'
    }
  },
  {
    id: 'bear_claw',
    name: 'Bear Claw',
    category: 'material',
    rarity: 'uncommon',
    description: 'Razor-sharp claw from a massive bear. Natural weapon.',
    imageFileName: 'bear-claw.png',
    sellValue: 12,
    stackable: true,
    attributes: {
      material_type: 'claw',
      source: 'bear',
      sharpness: 'very_high',
      natural_weapon: 'true'
    }
  },
  {
    id: 'gryphon_feather',
    name: 'Gryphon Feather',
    category: 'material',
    rarity: 'rare',
    description: 'Magnificent feather from a noble gryphon. Contains wind magic.',
    imageFileName: 'gryphon-feather.png',
    sellValue: 45,
    stackable: true,
    attributes: {
      material_type: 'feather',
      source: 'gryphon',
      wind_magic: 'medium',
      rarity: 'high'
    }
  },

  // Gems & Magical Components
  {
    id: 'shadow_gem',
    name: 'Shadow Gem',
    category: 'material',
    rarity: 'rare',
    description: 'Dark crystal that absorbs light. Pulses with shadow magic.',
    imageFileName: 'shadow-gem.png',
    sellValue: 60,
    stackable: true,
    attributes: {
      material_type: 'gem',
      element: 'shadow',
      magical_power: 'high',
      light_absorption: 'complete'
    }
  },
  {
    id: 'sunstone',
    name: 'Sunstone',
    category: 'material',
    rarity: 'rare',
    description: 'Brilliant crystal that captures sunlight. Warm to the touch.',
    imageFileName: 'sunstone.png',
    sellValue: 65,
    stackable: true,
    attributes: {
      material_type: 'gem',
      element: 'light',
      magical_power: 'high',
      temperature: 'warm'
    }
  },
  {
    id: 'moonstone',
    name: 'Moonstone',
    category: 'material',
    rarity: 'rare',
    description: 'Ethereal gem that glows with moonlight. Enhances magical focus.',
    imageFileName: 'moonstone.png',
    sellValue: 70,
    stackable: true,
    attributes: {
      material_type: 'gem',
      element: 'moon',
      magical_focus: 'high',
      glow: 'ethereal'
    }
  },
  {
    id: 'demonic_essence',
    name: 'Demonic Essence',
    category: 'material',
    rarity: 'epic',
    description: 'Concentrated evil energy from powerful demons. Handle with extreme care.',
    imageFileName: 'demonic-essence.png',
    sellValue: 150,
    stackable: true,
    attributes: {
      material_type: 'essence',
      alignment: 'evil',
      corruption_level: 'very_high',
      danger: 'extreme'
    }
  }
];

// 🧪 CONSUMABLES (Potions, foods, scrolls)
export const BASIC_CONSUMABLES: ItemDefinition[] = [
  {
    id: 'health_potion',
    name: 'Health Potion',
    category: 'consumable',
    rarity: 'common',
    description: 'Red liquid that instantly restores health. Essential for any adventurer.',
    imageFileName: 'health-potion.png',
    sellValue: 25,
    stackable: true,
    attributes: {
      effect: 'heal',
      potency: 'medium',
      duration: 'instant',
      hp_restore: 50
    }
  },
  {
    id: 'mana_potion',
    name: 'Mana Potion',
    category: 'consumable',
    rarity: 'common',
    description: 'Blue elixir that restores magical energy. Glows with arcane power.',
    imageFileName: 'mana-potion.png',
    sellValue: 30,
    stackable: true,
    attributes: {
      effect: 'restore_mana',
      potency: 'medium',
      duration: 'instant',
      mana_restore: 75
    }
  },
  {
    id: 'experience_boost',
    name: 'Experience Boost',
    category: 'consumable',
    rarity: 'uncommon',
    description: 'Golden elixir that enhances learning. Doubles experience for one hour.',
    imageFileName: 'experience-boost.png',
    sellValue: 100,
    stackable: true,
    attributes: {
      effect: 'exp_boost',
      multiplier: 2,
      duration: '3600', // 1 hour in seconds
      rarity: 'valuable'
    }
  }
];

// 🗡️ BASIC EQUIPMENT (Tier 1 items that are commonly found/crafted)
export const BASIC_EQUIPMENT: ItemDefinition[] = [
  // Weapons
  {
    id: 'iron_sword',
    name: 'Iron Sword',
    category: 'weapon',
    rarity: 'common',
    description: 'Well-balanced iron blade. Reliable weapon for novice warriors.',
    imageFileName: 'iron-sword.png',
    sellValue: 150,
    stackable: false,
    attributes: {
      weapon_type: 'sword',
      damage: 25,
      durability: 100,
      required_class: 'sunblade',
      tier: 1
    }
  },
  {
    id: 'oak_bow',
    name: 'Oak Bow',
    category: 'weapon',
    rarity: 'common',
    description: 'Sturdy bow crafted from seasoned oak. Perfect for hunting.',
    imageFileName: 'oak-bow.png',
    sellValue: 120,
    stackable: false,
    attributes: {
      weapon_type: 'bow',
      damage: 20,
      range: 'long',
      required_class: 'voidcarver',
      tier: 1
    }
  },
  {
    id: 'apprentice_staff',
    name: 'Apprentice Staff',
    category: 'weapon',
    rarity: 'common',
    description: 'Simple wooden staff topped with a focus crystal. Channels magical energy.',
    imageFileName: 'apprentice-staff.png',
    sellValue: 130,
    stackable: false,
    attributes: {
      weapon_type: 'staff',
      spell_power: 22,
      mana_efficiency: 'medium',
      required_class: 'glyphweaver',
      tier: 1
    }
  },
  {
    id: 'steel_axe',
    name: 'Steel Axe',
    category: 'weapon',
    rarity: 'common',
    description: 'Heavy two-handed axe with a razor-sharp edge. Devastating in combat.',
    imageFileName: 'steel-axe.png',
    sellValue: 180,
    stackable: false,
    attributes: {
      weapon_type: 'axe',
      damage: 35,
      crit_chance: 'high',
      required_class: 'machina',
      tier: 1
    }
  },

  // Armor
  {
    id: 'leather_armor',
    name: 'Leather Armor',
    category: 'armor',
    rarity: 'common',
    description: 'Flexible leather protection. Doesn\'t restrict movement.',
    imageFileName: 'leather-armor.png',
    sellValue: 100,
    stackable: false,
    attributes: {
      armor_type: 'light',
      defense: 15,
      agility_bonus: 5,
      weight: 'light',
      tier: 1
    }
  },
  {
    id: 'chain_mail',
    name: 'Chain Mail',
    category: 'armor',
    rarity: 'uncommon',
    description: 'Interlocked metal rings provide excellent protection against slashing.',
    imageFileName: 'chain-mail.png',
    sellValue: 200,
    stackable: false,
    attributes: {
      armor_type: 'medium',
      defense: 25,
      slash_resistance: 'high',
      weight: 'medium',
      tier: 1
    }
  },
  {
    id: 'iron_shield',
    name: 'Iron Shield',
    category: 'armor',
    rarity: 'common',
    description: 'Sturdy iron shield that can deflect most attacks. Essential for defense.',
    imageFileName: 'iron-shield.png',
    sellValue: 80,
    stackable: false,
    attributes: {
      armor_type: 'shield',
      block_chance: 25,
      durability: 80,
      weight: 'medium',
      tier: 1
    }
  }
];

// 📋 COMPLETE ITEM REGISTRY
export const ALL_BASIC_ITEMS: ItemDefinition[] = [
  ...BASIC_MATERIALS,
  ...BASIC_CONSUMABLES,
  ...BASIC_EQUIPMENT
];

// 🔍 UTILITY FUNCTIONS
export function getItemById(id: string): ItemDefinition | undefined {
  return ALL_BASIC_ITEMS.find(item => item.id === id);
}

export function getItemsByCategory(category: ItemDefinition['category']): ItemDefinition[] {
  return ALL_BASIC_ITEMS.filter(item => item.category === category);
}

export function getItemsByRarity(rarity: ItemDefinition['rarity']): ItemDefinition[] {
  return ALL_BASIC_ITEMS.filter(item => item.rarity === rarity);
}

/**
 * Generate complete cNFT metadata for an item
 */
export function generateCNFTMetadata(
  item: ItemDefinition,
  options: {
    foundInDungeon?: string;
    foundOnFloor?: number;
    discoveredBy?: string;
    playerClass?: number;
    imageBaseUrl?: string;
  } = {}
): CNFTMetadata {
  const {
    foundInDungeon = 'Unknown Dungeon',
    foundOnFloor = 1,
    discoveredBy = 'Anonymous Adventurer',
    imageBaseUrl = 'https://runara.fun/images/items'
  } = options;

  // Base attributes from item definition
  const attributes: CNFTAttribute[] = [
    { trait_type: 'Category', value: item.category },
    { trait_type: 'Rarity', value: item.rarity },
    { trait_type: 'Stackable', value: item.stackable ? 'Yes' : 'No' },
    { trait_type: 'Sell Value', value: item.sellValue },
    { trait_type: 'Found In', value: foundInDungeon },
    { trait_type: 'Floor Found', value: foundOnFloor },
    { trait_type: 'Discovered By', value: discoveredBy }
  ];

  // Add item-specific attributes
  Object.entries(item.attributes).forEach(([key, value]) => {
    attributes.push({
      trait_type: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: value
    });
  });

  return {
    name: item.name,
    description: `${item.description}\n\nDiscovered in ${foundInDungeon} on floor ${foundOnFloor} by ${discoveredBy}.`,
    image: `${imageBaseUrl}/${item.imageFileName}`,
    external_url: 'https://runara.fun',
    attributes,
    properties: {
      files: [
        {
          uri: `${imageBaseUrl}/${item.imageFileName}`,
          type: 'image/png'
        }
      ],
      category: 'image'
    }
  };
}

/**
 * Get suggested rarity weights for dungeon drops
 */
export const RARITY_WEIGHTS = {
  common: 70,    // 70% chance
  uncommon: 20,  // 20% chance
  rare: 8,       // 8% chance
  epic: 1.8,     // 1.8% chance
  legendary: 0.2, // 0.2% chance
  mythic: 0.01   // 0.01% chance (for future items)
};

/**
 * Get random item based on rarity weights
 */
export function getRandomItemByRarity(): ItemDefinition {
  const random = Math.random() * 100;
  let cumulative = 0;
  
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    cumulative += weight;
    if (random <= cumulative) {
      const itemsOfRarity = getItemsByRarity(rarity as ItemDefinition['rarity']);
      if (itemsOfRarity.length > 0) {
        return itemsOfRarity[Math.floor(Math.random() * itemsOfRarity.length)];
      }
    }
  }
  
  // Fallback to common items
  const commonItems = getItemsByRarity('common');
  return commonItems[Math.floor(Math.random() * commonItems.length)];
}

