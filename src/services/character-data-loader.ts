/**
 * Character data loader service
 * Loads character customization and equipment data from database
 */

// Supabase removed - using PostgreSQL directly
import { pgQuerySingle } from '../utils/pg-helper';
import { CharacterCustomization, getDefaultCustomization, validateCustomization } from '../types/character-customization';
import { PlayerItemService } from './player-items';
import { NftColumns } from './database';
import { fetchCharacterFromCNFT } from './cnft';

export interface CharacterImageData {
  customization: CharacterCustomization;
  equippedGear?: {
    weapon?: string;
    armor?: string;
    helmet?: string;
    boots?: string;
    gloves?: string;
    accessory?: string;
  };
  characterName: string;
  playerPDA?: string;
}

/**
 * Load character customization from database
 * Falls back to default if not found
 */
async function loadCharacterCustomization(
  assetId: string,
  playerPDA?: string
): Promise<CharacterCustomization> {
  try {
    // Try to get playerPDA from nfts table if not provided
    if (!playerPDA) {
      const row = await NftColumns.get(assetId);
      if (row?.player_pda) {
        playerPDA = row.player_pda;
      }
    }

    if (!playerPDA) {
      console.warn(`[CharacterDataLoader] No playerPDA found for assetId ${assetId}, using default customization`);
      return getDefaultCustomization();
    }

    // Get profile by playerPDA
      const profileResult = await pgQuerySingle<any>(
        'SELECT character_customization FROM profiles WHERE player_pda = $1',
        [playerPDA]
      );
      const profile = profileResult.data;
      const error = profileResult.error;

    if (error || !profile) {
      console.warn(`[CharacterDataLoader] Profile not found for playerPDA ${playerPDA}, using default customization`);
      return getDefaultCustomization();
    }

    // Parse customization from JSONB column
    if (profile.character_customization) {
      const parsed = typeof profile.character_customization === 'string'
        ? JSON.parse(profile.character_customization)
        : profile.character_customization;
      
      return validateCustomization(parsed);
    }

    return getDefaultCustomization();
  } catch (error) {
    console.warn(`[CharacterDataLoader] Error loading customization: ${error instanceof Error ? error.message : String(error)}, using default`);
    return getDefaultCustomization();
  }
}

/**
 * Load equipped gear for a character
 * Currently returns empty object - will be implemented when equipment system is ready
 * This is extensible for future equipment sprites
 */
async function loadEquippedGear(
  assetId: string,
  playerPDA?: string
): Promise<CharacterImageData['equippedGear']> {
  try {
    // Try to get playerPDA from nfts table if not provided
    if (!playerPDA) {
      const row = await NftColumns.get(assetId);
      if (row?.player_pda) {
        playerPDA = row.player_pda;
      }
    }

    if (!playerPDA) {
      console.warn(`[CharacterDataLoader] No playerPDA found for assetId ${assetId}, no equipment loaded`);
      return {};
    }

    // Get profile to find player_id
    const profileResult = await pgQuerySingle<any>(
      'SELECT character_customization FROM profiles WHERE player_pda = $1',
      [playerPDA]
    );
    const profile = profileResult.data;
    const profileError = profileResult.error;

    if (profileError || !profile) {
      console.warn(`[CharacterDataLoader] Profile not found for playerPDA ${playerPDA}, no equipment loaded`);
      return {};
    }

    // TODO: When equipment system is implemented, query player_items for equipped items
    // For now, return empty object - equipment sprites will be added later
    // Example future implementation:
    // const equippedItems = await PlayerItemService.getEquippedItems(profile.id);
    // return {
    //   weapon: equippedItems.find(i => i.slot === 'weapon')?.item_definition_id,
    //   armor: equippedItems.find(i => i.slot === 'armor')?.item_definition_id,
    //   // ... etc
    // };

    return {};
  } catch (error) {
    console.warn(`[CharacterDataLoader] Error loading equipment: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

/**
 * Load character name from database or chain
 */
async function loadCharacterName(assetId: string): Promise<string> {
  try {
    // Try database first
    const row = await NftColumns.get(assetId);
    if (row?.name) {
      return row.name;
    }

    // Fallback to chain
    const character = await fetchCharacterFromCNFT(assetId);
    if (character?.characterStats?.name) {
      return character.characterStats.name;
    }

    return 'Character';
  } catch (error) {
    console.warn(`[CharacterDataLoader] Error loading character name: ${error instanceof Error ? error.message : String(error)}`);
    return 'Character';
  }
}

/**
 * Load all character data needed for image generation
 */
export async function loadCharacterImageData(
  assetId: string,
  playerPDA?: string
): Promise<CharacterImageData> {
  try {
    // Get playerPDA from database if not provided
    if (!playerPDA) {
      const row = await NftColumns.get(assetId);
      if (row?.player_pda) {
        playerPDA = row.player_pda;
      }
    }

    // Load all data in parallel
    const [customization, equippedGear, characterName] = await Promise.all([
      loadCharacterCustomization(assetId, playerPDA),
      loadEquippedGear(assetId, playerPDA),
      loadCharacterName(assetId),
    ]);

    return {
      customization,
      equippedGear,
      characterName,
      playerPDA: playerPDA || undefined,
    };
  } catch (error) {
    console.error(`[CharacterDataLoader] Error loading character data: ${error instanceof Error ? error.message : String(error)}`);
    // Return defaults on error
    return {
      customization: getDefaultCustomization(),
      equippedGear: {},
      characterName: 'Character',
      playerPDA: playerPDA || undefined,
    };
  }
}

