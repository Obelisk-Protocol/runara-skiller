import {
  getAssetWithProof,
  mintToCollectionV1,
  updateMetadata
} from '@metaplex-foundation/mpl-bubblegum';
import { 
  publicKey, 
  some, 
  none,
  generateSigner
} from '@metaplex-foundation/umi';
import { umi, serverSigner, COLLECTION_MINT, MERKLE_TREE } from '../config/solana';
import { CharacterStats, Character } from '../types/character';

// Exactly matching your frontend's character generation
export function generateDefaultCharacterStats(name: string, characterClass: string = 'Adventurer'): CharacterStats {
  return {
    name,
    level: 1,
    combatLevel: 3, // Default combat level (Attack + Strength + Defense)
    totalLevel: 9,  // Default total level (all skills at 1)
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
}

// Create character cNFT (exactly matching your frontend logic)
export async function createCharacterCNFT(
  playerPDA: string,
  characterName: string,
  characterClass: string = 'Adventurer'
): Promise<{ success: boolean; assetId?: string; error?: string }> {
  try {
    console.log('🎯 Creating character cNFT for:', playerPDA);
    
    // Generate character stats
    const characterStats = generateDefaultCharacterStats(characterName, characterClass);
    
    // Generate asset signer (new cNFT address)
    const assetSigner = generateSigner(umi);
    console.log('🆔 Generated asset ID:', assetSigner.publicKey);
    
    // Create metadata URI (pointing to our backend endpoint)
    const metadataId = Date.now().toString();
    const metadataUri = `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/cnft/player-metadata/${metadataId}`;
    
    // Store metadata off-chain first
    await storeCharacterMetadata(metadataId, characterStats);
    
    // Build Metaplex standard metadata (exactly like frontend)
    const displayName = `${characterName} (Level ${characterStats.level}, Combat ${characterStats.combatLevel})`;
    
    const metadata = {
      name: displayName,
      symbol: 'PLAYER',
      uri: metadataUri,
      sellerFeeBasisPoints: 500,
      collection: { key: publicKey(COLLECTION_MINT), verified: false },
      creators: [
        {
          address: serverSigner.publicKey,
          verified: true,
          share: 100
        }
      ]
    };

    // Mint the cNFT (exactly like frontend)
    console.log('🌱 Minting character cNFT...');
    const mintTx = await mintToCollectionV1(umi, {
      leafOwner: publicKey(playerPDA),
      merkleTree: publicKey(MERKLE_TREE),
      collectionMint: publicKey(COLLECTION_MINT),
      metadata
    }).sendAndConfirm(umi);

    console.log('✅ Character cNFT minted successfully');
    console.log('🔗 Transaction:', mintTx.signature);
    
    return {
      success: true,
      assetId: assetSigner.publicKey.toString()
    };
    
  } catch (error) {
    console.error('❌ Failed to create character cNFT:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Update character cNFT metadata (exactly matching your frontend logic)
export async function updateCharacterCNFT(
  assetId: string,
  characterStats: CharacterStats,
  playerPDA?: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    console.log('🔄 Starting cNFT metadata update for:', assetId);
    
    // Fetch asset with proof (with retry logic like frontend)
    const fetchAssetWithRetry = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`🔄 Attempt ${i + 1}/${retries} to fetch asset proof...`);
          const asset = await getAssetWithProof(umi, publicKey(assetId), {
            truncateCanopy: true
          });
          console.log('✅ Asset proof fetched successfully');
          return asset;
        } catch (error) {
          console.error(`❌ Attempt ${i + 1} failed:`, error);
          if (i === retries - 1) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    };

    const assetWithProof = await fetchAssetWithRetry();
    if (!assetWithProof) {
      throw new Error('Failed to fetch asset proof');
    }
    
    // Extract metadata ID from existing URI (exactly like frontend)
    const existingUri = assetWithProof.metadata.uri;
    let metadataId = characterStats.name || Date.now().toString();
    
    if (existingUri && existingUri.includes('player-metadata/')) {
      const uriParts = existingUri.split('player-metadata/');
      if (uriParts.length > 1) {
        metadataId = uriParts[1];
      }
    }
    
    console.log(`📋 Using metadata ID: ${metadataId}`);
    
    // Generate display name with combat level (exactly like frontend)
    const combatLevel = characterStats.combatLevel;
    const shouldIncludeCombat = (combatLevel !== null && combatLevel !== undefined);
    const displayName = shouldIncludeCombat ? 
      `${characterStats.name} (Level ${characterStats.level}, Combat ${combatLevel})` : 
      `${characterStats.name} (Level ${characterStats.level})`;
      
    console.log(`🔧 Name generation: shouldIncludeCombat=${shouldIncludeCombat}, displayName="${displayName}"`);
    
    // Store detailed character data off-chain (exactly like frontend)
    await storeCharacterMetadata(metadataId, characterStats);
    
    // Minimal on-chain update (only name to keep transaction size small) - exactly like frontend
    const updateArgs = {
      name: some(displayName)
      // Only update name to keep transaction as small as possible
      // All detailed character data is stored at the metadata URI
    };
    
    // Determine leaf owner (exactly like frontend)
    const leafOwner = playerPDA ? publicKey(playerPDA) : assetWithProof.leafOwner;
    console.log(`🎯 Using leaf owner: ${leafOwner}`);
    
    // Build update transaction (exactly like frontend)
    const updateTx = updateMetadata(umi, {
      ...assetWithProof,
      leafOwner: leafOwner,
      currentMetadata: assetWithProof.metadata,
      updateArgs,
      collectionMint: publicKey(COLLECTION_MINT)
    });
    
    // Send transaction (exactly like frontend)
    console.log('🚀 Sending metadata update transaction...');
    const result = await updateTx.sendAndConfirm(umi, {
      send: { skipPreflight: false }
    });
    
    console.log('✅ Metadata update completed! Signature:', result.signature);
    
    return {
      success: true,
      signature: result.signature.toString()
    };
    
  } catch (error) {
    console.error('❌ cNFT metadata update error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Fetch character from cNFT (exactly matching your frontend parsing logic)
export async function fetchCharacterFromCNFT(assetId: string): Promise<Character | null> {
  try {
    console.log('🔍 Fetching character data for:', assetId);
    
    const assetWithProof = await getAssetWithProof(umi, publicKey(assetId), {
      truncateCanopy: true
    });
    
    console.log('✅ Successfully fetched real cNFT metadata');
    
    // Parse character data from cNFT (exactly like frontend)
    const characterStats = await parseCharacterFromMetadata(assetWithProof);
    
    return {
      id: assetId,
      characterStats,
      lastSynced: new Date()
    };
    
  } catch (error) {
    console.error('❌ Error fetching character from cNFT:', error);
    return null;
  }
}

// Parse character from metadata (exactly matching frontend logic)
async function parseCharacterFromMetadata(assetWithProof: any): Promise<CharacterStats> {
  const metadata = assetWithProof.metadata;
  
  // Initialize default values (exactly like frontend)
  let characterName = metadata.name || 'Unknown';
  let characterLevel = 1;
  let combatLevel = 3;
  let totalLevel = 9;
  let characterClass = 'Adventurer';
  let characterVersion = '1.0.0';
  let experience = 0;
  let isV2Format = false;
  
  // Parse name for level info (exactly like frontend)
  const nameMatch = characterName.match(/^(.+?)\s*\(Level\s+(\d+)(?:,\s*Combat\s+(\d+))?\)$/);
  if (nameMatch) {
    characterName = nameMatch[1];
    characterLevel = parseInt(nameMatch[2]);
    if (nameMatch[3]) {
      combatLevel = parseInt(nameMatch[3]);
      isV2Format = true;
    }
  }
  
  // Initialize skill data (exactly like frontend)
  let skillData: Record<string, { level: number; experience: number }> = {};
  
  // Parse attributes (exactly like frontend skill mapping)
  if (metadata.attributes) {
    const skillMap = {
      // Full names (legacy)
      'Attack': 'attack', 'Strength': 'strength', 'Defense': 'defense',
      'Magic': 'magic', 'Projectiles': 'projectiles', 'Vitality': 'vitality',
      'Crafting': 'crafting', 'Luck': 'luck', 'Gathering': 'gathering',
      // Shortened names (current)
      'Att': 'attack', 'Str': 'strength', 'Def': 'defense', 
      'Mag': 'magic', 'Pro': 'projectiles', 'Vit': 'vitality',
      'Cra': 'crafting', 'Luc': 'luck', 'Gat': 'gathering'
    };
    
    metadata.attributes.forEach((attr: any) => {
      if (skillMap[attr.trait_type as keyof typeof skillMap]) {
        const skillName = skillMap[attr.trait_type as keyof typeof skillMap];
        const level = parseInt(attr.value);
        skillData[skillName] = { level, experience: level * 100 };
      } else if (attr.trait_type === 'Version') {
        characterVersion = attr.value || characterVersion;
        if (characterVersion === '2.0.0' || characterVersion === '2.1.0') {
          isV2Format = true;
        }
      } else if (attr.trait_type === 'Combat Level') {
        combatLevel = parseInt(attr.value);
      } else if (attr.trait_type === 'Total Level') {
        totalLevel = parseInt(attr.value);
      }
    });
  }
  
  // Try loading from metadata URI if no skills in attributes (exactly like frontend)
  if (Object.keys(skillData).length === 0 && metadata.uri) {
    try {
      console.log('🔍 No skills in attributes, trying metadata URI:', metadata.uri);
      
      // Convert external URI to local API endpoint (exactly like frontend)
      let metadataUrl = metadata.uri;
      if (metadataUrl.includes('api.obeliskparadox.com/player-metadata/')) {
        const metadataId = metadataUrl.split('player-metadata/')[1];
        metadataUrl = `https://obelisk-skiller-production.up.railway.app/api/cnft/player-metadata/${metadataId}`;
        console.log(`🔄 Converted to local API: ${metadataUrl}`);
      }
      
      const metadataResponse = await fetch(metadataUrl);
      if (metadataResponse.ok) {
        const metadataJson = await metadataResponse.json() as any;
        
        // Check for characterStats format first (exactly like frontend)
        if (metadataJson.characterStats && metadataJson.characterStats.skills) {
          console.log('✅ Loaded skills from metadata URI (characterStats format)');
          skillData = metadataJson.characterStats.skills;
          if (metadataJson.characterStats.combatLevel) combatLevel = metadataJson.characterStats.combatLevel;
          if (metadataJson.characterStats.totalLevel) totalLevel = metadataJson.characterStats.totalLevel;
          if (metadataJson.characterStats.experience) experience = metadataJson.characterStats.experience;
        }
        // Parse from attributes format (exactly like frontend)
        else if (metadataJson.attributes) {
          console.log('✅ Loaded skills from metadata URI (attributes format)');
          const skillMap = {
            'Att': 'attack', 'Str': 'strength', 'Def': 'defense', 
            'Mag': 'magic', 'Pro': 'projectiles', 'Vit': 'vitality',
            'Cra': 'crafting', 'Luc': 'luck', 'Gat': 'gathering'
          };
          
          metadataJson.attributes.forEach((attr: any) => {
            if (skillMap[attr.trait_type as keyof typeof skillMap]) {
              const skillName = skillMap[attr.trait_type as keyof typeof skillMap];
              const level = parseInt(attr.value);
              skillData[skillName] = { level, experience: level * 100 };
            }
            else if (attr.trait_type === 'Combat Level') {
              combatLevel = parseInt(attr.value);
            }
            else if (attr.trait_type === 'Total Level') {
              totalLevel = parseInt(attr.value);
            }
          });
        }
      }
    } catch (uriError) {
      console.log('⚠️ Could not load from metadata URI:', uriError);
    }
  }
  
  // Fill in missing skills with defaults (exactly like frontend)
  const defaultSkills = ['attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality', 'crafting', 'luck', 'gathering'];
  defaultSkills.forEach(skill => {
    if (!skillData[skill]) {
      skillData[skill] = { level: 1, experience: 0 };
    }
  });
  
  // Calculate experience level based on character level (exactly like frontend)
  experience = characterLevel * 100;
  
  // Build character stats object (exactly matching frontend structure)
  return {
    name: characterName,
    level: characterLevel,
    combatLevel,
    totalLevel,
    characterClass,
    version: characterVersion,
    stats: {
      str: 10,
      agi: 10,
      int: 10,
      vit: 10,
      luk: 10
    },
    experience,
    skills: {
      attack: skillData.attack || { level: 1, experience: 0 },
      strength: skillData.strength || { level: 1, experience: 0 },
      defense: skillData.defense || { level: 1, experience: 0 },
      magic: skillData.magic || { level: 1, experience: 0 },
      projectiles: skillData.projectiles || { level: 1, experience: 0 },
      vitality: skillData.vitality || { level: 1, experience: 0 },
      crafting: skillData.crafting || { level: 1, experience: 0 },
      luck: skillData.luck || { level: 1, experience: 0 },
      gathering: skillData.gathering || { level: 1, experience: 0 }
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
}

// Store character metadata off-chain (exactly like frontend)
async function storeCharacterMetadata(metadataId: string, characterStats: CharacterStats): Promise<void> {
  try {
    const metadataPayload = {
      name: characterStats.name,
      description: `Level ${characterStats.level} ${characterStats.characterClass} with ${characterStats.totalLevel} total skill levels`,
      image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${characterStats.name}&backgroundColor=b6e3f4`,
      attributes: [
        { trait_type: 'Version', value: characterStats.version || '2.0.0' },
        { trait_type: 'Level', value: characterStats.level.toString() },
        { trait_type: 'Combat Level', value: characterStats.combatLevel.toString() },
        { trait_type: 'Total Level', value: characterStats.totalLevel.toString() },
        { trait_type: 'Att', value: characterStats.skills.attack.level.toString() },
        { trait_type: 'Str', value: characterStats.skills.strength.level.toString() },
        { trait_type: 'Def', value: characterStats.skills.defense.level.toString() },
        { trait_type: 'Mag', value: characterStats.skills.magic.level.toString() },
        { trait_type: 'Pro', value: characterStats.skills.projectiles.level.toString() },
        { trait_type: 'Vit', value: characterStats.skills.vitality.level.toString() },
        { trait_type: 'Cra', value: characterStats.skills.crafting.level.toString() },
        { trait_type: 'Luc', value: characterStats.skills.luck.level.toString() },
        { trait_type: 'Gat', value: characterStats.skills.gathering.level.toString() }
      ],
      characterStats // Store full character data for fallback
    };
    
    // Store using our metadata service directly (no need for HTTP call)
    const { MetadataStore } = await import('../services/database');
    MetadataStore.set(metadataId, metadataPayload);
    
    console.log('✅ Character metadata stored successfully');
    
  } catch (error) {
    console.error('⚠️ Error storing character metadata:', error);
    throw error;
  }
}