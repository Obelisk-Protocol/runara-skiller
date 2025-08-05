import { Router } from 'express';
import { z } from 'zod';
import { createCharacterCNFT, updateCharacterCNFT, fetchCharacterFromCNFT } from '../services/cnft';
import { CharacterService } from '../services/character';
import { MetadataStore } from '../services/database';
import { supabase } from '../config/database';

const router = Router();

// Validation schemas
const CreateCharacterSchema = z.object({
  playerPDA: z.string(),
  characterName: z.string().min(1).max(50),
  characterClass: z.string().optional().default('Adventurer')
});

const UpdateCNFTMetadataSchema = z.object({
  assetId: z.string(),
  characterStats: z.object({
    name: z.string(),
    level: z.number(),
    combatLevel: z.number(),
    totalLevel: z.number(),
    characterClass: z.string(),
    version: z.string(),
    stats: z.object({
      str: z.number(),
      agi: z.number(),
      int: z.number(),
      vit: z.number(),
      luk: z.number()
    }),
    experience: z.number(),
    skills: z.object({
      attack: z.object({ level: z.number(), experience: z.number() }),
      strength: z.object({ level: z.number(), experience: z.number() }),
      defense: z.object({ level: z.number(), experience: z.number() }),
      magic: z.object({ level: z.number(), experience: z.number() }),
      projectiles: z.object({ level: z.number(), experience: z.number() }),
      vitality: z.object({ level: z.number(), experience: z.number() }),
      crafting: z.object({ level: z.number(), experience: z.number() }),
      luck: z.object({ level: z.number(), experience: z.number() }),
      gathering: z.object({ level: z.number(), experience: z.number() })
    }),
    skillExperience: z.object({
      attack: z.number(),
      strength: z.number(),
      defense: z.number(),
      magic: z.number(),
      projectiles: z.number(),
      vitality: z.number(),
      crafting: z.number(),
      luck: z.number(),
      gathering: z.number()
    }),
    achievements: z.array(z.string()),
    equipment: z.object({
      weapon: z.string(),
      armor: z.string(),
      accessory: z.string()
    })
  }),
  playerPDA: z.string().optional()
});

const FetchPlayerCNFTsSchema = z.object({
  playerId: z.string()
});

const TrainSkillSchema = z.object({
  assetId: z.string(),
  skillName: z.enum(['attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality', 'crafting', 'luck', 'gathering']),
  playerPDA: z.string().optional()
});

const LevelUpStatSchema = z.object({
  assetId: z.string(),
  statName: z.enum(['str', 'agi', 'int', 'vit', 'luk']),
  playerPDA: z.string().optional()
});

// POST /api/characters/create
router.post('/create', async (req, res) => {
  try {
    const { playerPDA, characterName, characterClass } = CreateCharacterSchema.parse(req.body);
    
    console.log('🎯 Creating character:', { playerPDA, characterName, characterClass });
    
    const result = await createCharacterCNFT(playerPDA, characterName, characterClass);
    
    if (result.success) {
      // Update Supabase with the asset ID (exactly like frontend)
      if (result.assetId) {
        try {
          // Find the player by PDA and update with the new character asset ID
          const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5')
            .eq('player_pda', playerPDA)
            .single();
          
          if (profile && !fetchError) {
            // Find the next available character slot
            let updateData: any = {};
            
            if (!profile.character_cnft_1) {
              updateData.character_cnft_1 = result.assetId;
            } else if (!profile.character_cnft_2) {
              updateData.character_cnft_2 = result.assetId;
            } else if (!profile.character_cnft_3) {
              updateData.character_cnft_3 = result.assetId;
            } else if (!profile.character_cnft_4) {
              updateData.character_cnft_4 = result.assetId;
            } else if (!profile.character_cnft_5) {
              updateData.character_cnft_5 = result.assetId;
            }
            
            if (Object.keys(updateData).length > 0) {
              const { error: updateError } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('player_pda', playerPDA);
                
              if (updateError) {
                console.error('⚠️ Failed to update Supabase with asset ID:', updateError);
              } else {
                console.log('✅ Updated Supabase with asset ID:', result.assetId);
              }
            } else {
              console.log('⚠️ All character slots are full');
            }
          } else {
            console.error('⚠️ Could not find profile for PDA:', playerPDA);
          }
        } catch (supabaseError) {
          console.error('⚠️ Supabase update error:', supabaseError);
        }
      }
      
      res.json({
        success: true,
        assetId: result.assetId,
        message: 'Character created successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to create character'
      });
    }
  } catch (error) {
    console.error('❌ Create character error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

// POST /api/characters/update-cnft-metadata
router.post('/update-cnft-metadata', async (req, res) => {
  try {
    const { assetId, characterStats, playerPDA } = UpdateCNFTMetadataSchema.parse(req.body);
    
    console.log('🔄 Updating cNFT metadata:', { assetId, characterName: characterStats.name });
    
    const result = await updateCharacterCNFT(assetId, characterStats, playerPDA);
    
    if (result.success) {
      res.json({
        success: true,
        signature: result.signature,
        message: 'Character metadata updated successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to update character metadata'
      });
    }
  } catch (error) {
    console.error('❌ Update cNFT metadata error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

// GET /api/characters/:assetId
router.get('/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;
    
    console.log('🔍 Fetching character:', assetId);
    
    const character = await fetchCharacterFromCNFT(assetId);
    
    if (character) {
      res.json({
        success: true,
        character
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Character not found'
      });
    }
  } catch (error) {
    console.error('❌ Fetch character error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch character'
    });
  }
});

// POST /api/characters/fetch-player-cnfts-simple
router.post('/fetch-player-cnfts-simple', async (req, res) => {
  try {
    const { playerId } = FetchPlayerCNFTsSchema.parse(req.body);
    
    console.log('🔍 Fetching player cNFTs for playerId:', playerId);
    
    // Get the user profile from Supabase to find character asset IDs
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, player_pda')
      .eq('player_pda', playerId)
      .single();

    console.log('📊 Supabase query result:');
    console.log('- Profile data:', profile);
    console.log('- Profile error:', profileError);

    if (profileError || !profile) {
      console.error('❌ Failed to fetch profile:', profileError);
      return res.status(404).json({
        success: false,
        error: `Player profile not found: ${profileError?.message || 'Unknown error'}`
      });
    }

    console.log('📋 Profile found:', profile);

    // Collect all non-null character asset IDs
    const assetIds = [
      profile.character_cnft_1,
      profile.character_cnft_2,
      profile.character_cnft_3,
      profile.character_cnft_4,
      profile.character_cnft_5
    ].filter(Boolean);

    console.log('🎯 Asset IDs found:', assetIds);

    if (assetIds.length === 0) {
      console.log('📋 No character asset IDs found in profile');
      return res.json({
        success: true,
        characters: []
      });
    }

    // Fetch character data for each asset ID
    const characters = [];
    for (const assetId of assetIds) {
      try {
        console.log(`🔄 Fetching REAL character data for asset: ${assetId}`);
        
        // Fetch the actual cNFT data from the blockchain
        const character = await fetchCharacterFromCNFT(assetId);
        if (character) {
          characters.push(character);
          console.log(`✅ REAL Character fetched: ${character.characterStats?.name || 'Unknown'}`);
        } else {
          console.warn(`⚠️ Could not fetch character data for asset: ${assetId}`);
          // Add a fallback placeholder if cNFT fetch fails
          const fallbackCharacter = {
            id: assetId,
            characterStats: {
              name: `Character ${assetId.slice(-4)} (Failed to Load)`,
              level: 0,
              combatLevel: 0,
              totalLevel: 0,
              characterClass: 'Unknown',
              version: '2.0.0',
              stats: { str: 0, agi: 0, int: 0, vit: 0, luk: 0 },
              experience: 0,
              skills: {
                attack: { level: 0, experience: 0 },
                strength: { level: 0, experience: 0 },
                defense: { level: 0, experience: 0 },
                magic: { level: 0, experience: 0 },
                projectiles: { level: 0, experience: 0 },
                vitality: { level: 0, experience: 0 },
                crafting: { level: 0, experience: 0 },
                luck: { level: 0, experience: 0 },
                gathering: { level: 0, experience: 0 }
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
              achievements: [],
              equipment: {
                weapon: 'None',
                armor: 'None',
                accessory: 'None'
              }
            },
            lastSynced: new Date()
          };
          characters.push(fallbackCharacter);
        }
      } catch (error) {
        console.error(`❌ Error fetching character ${assetId}:`, error);
      }
    }

    console.log(`🎉 Successfully fetched ${characters.length} characters`);
    
    res.json({
      success: true,
      characters
    });
  } catch (error) {
    console.error('❌ Fetch player cNFTs error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch characters'
    });
  }
});

// POST /api/characters/train-skill
router.post('/train-skill', async (req, res) => {
  try {
    const { assetId, skillName, playerPDA } = TrainSkillSchema.parse(req.body);
    
    console.log(`⚔️ Training ${skillName} for character: ${assetId}`);
    
    const result = await CharacterService.trainSkill(assetId, skillName, playerPDA);
    
    if (result.success) {
      res.json({
        success: true,
        character: result.character,
        message: `Successfully trained ${skillName}!`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to train skill'
      });
    }
  } catch (error) {
    console.error('❌ Train skill error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

// POST /api/characters/level-up-stat
router.post('/level-up-stat', async (req, res) => {
  try {
    const { assetId, statName, playerPDA } = LevelUpStatSchema.parse(req.body);
    
    console.log(`💪 Leveling up ${statName} for character: ${assetId}`);
    
    const result = await CharacterService.levelUpStat(assetId, statName, playerPDA);
    
    if (result.success) {
      res.json({
        success: true,
        character: result.character,
        message: `Successfully leveled up ${statName}!`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to level up stat'
      });
    }
  } catch (error) {
    console.error('❌ Level up stat error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

export default router;