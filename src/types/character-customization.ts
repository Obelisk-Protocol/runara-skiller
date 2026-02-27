/**
 * Character customization types and utilities
 */

export interface CharacterCustomization {
  outfit: string;
  hair?: string;
  eyes?: string;
}

export interface OutfitOption {
  id: string;
  name: string;
  armorPath: string;
  thumbnailPath?: string;
}

/**
 * Available outfit options
 * Currently only default outfit, but extensible for more
 */
export const OUTFIT_OPTIONS: OutfitOption[] = [
  {
    id: 'default',
    name: 'Default Outfit',
    armorPath: 'idlearmor.png',
  },
];

/**
 * Get outfit option by ID
 */
export function getOutfitOption(outfitId: string): OutfitOption | undefined {
  return OUTFIT_OPTIONS.find((outfit) => outfit.id === outfitId);
}

/**
 * Get default customization
 */
export function getDefaultCustomization(): CharacterCustomization {
  return {
    outfit: 'default',
  };
}

/**
 * Validate customization object
 */
export function validateCustomization(
  customization: any
): CharacterCustomization {
  const defaultCustomization = getDefaultCustomization();

  if (!customization || typeof customization !== 'object') {
    return defaultCustomization;
  }

  return {
    outfit:
      typeof customization.outfit === 'string' &&
      OUTFIT_OPTIONS.some((o) => o.id === customization.outfit)
        ? customization.outfit
        : defaultCustomization.outfit,
    hair:
      typeof customization.hair === 'string'
        ? customization.hair
        : defaultCustomization.hair,
    eyes:
      typeof customization.eyes === 'string'
        ? customization.eyes
        : defaultCustomization.eyes,
  };
}

