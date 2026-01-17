import { Router } from 'express';
import { z } from 'zod';
import { SkillDatabase } from '../services/database';
import { addSkillXp } from '../services/nft-skill-experience';
// Supabase removed - use PostgreSQL via pg-helper
import { pgQuerySingle, pgQuery } from '../utils/pg-helper';

const router = Router();

// Validation schemas
const addExperienceSchema = z.object({
  playerPDA: z.string().min(32).max(44),
  skill: z.enum([
    // Combat Skills
    'attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality',
    // Gathering Skills
    'mining', 'woodcutting', 'fishing', 'hunting',
    // Crafting Skills
    'smithing', 'crafting', 'cooking', 'alchemy', 'construction',
    // Unique Skills
    'luck'
  ]),
  experienceGain: z.number().min(1).max(1000000),
  source: z.string().optional(),
  sessionId: z.string().optional(),
  gameMode: z.string().optional(),
  additionalData: z.any().optional()
});

const markSyncedSchema = z.object({
  playerPDA: z.string().min(32).max(44)
});

// GET /api/skills/:playerPDA - Get player skill experience
router.get('/:playerPDA', async (req: any, res: any) => {
  try {
    const { playerPDA } = req.params;
    
    if (!playerPDA || playerPDA.length < 32) {
      return res.status(400).json({
        success: false,
        error: 'Invalid player PDA'
      });
    }
    
    console.log('🔍 Fetching skill experience for:', playerPDA);
    
    const skillData = await SkillDatabase.getPlayerSkillExperience(playerPDA);
    
    if (skillData) {
      res.json({
        success: true,
        skillData
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Player skill data not found'
      });
    }
    
  } catch (error) {
    console.error('❌ Error fetching skill experience:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/skills/add-experience - Add experience to a skill
router.post('/add-experience', async (req: any, res: any) => {
  try {
    const validatedData = addExperienceSchema.parse(req.body);
    
    console.log('📈 Adding skill experience:', validatedData);
    
    // Update player_skill_experience table (legacy support)
    const success = await SkillDatabase.addSkillExperience(
      validatedData.playerPDA,
      validatedData.skill,
      validatedData.experienceGain,
      validatedData.source,
      validatedData.sessionId,
      validatedData.gameMode,
      validatedData.additionalData
    );
    
    // ALSO update nft_skill_experience table (what the game actually reads from)
    // Look up the active character's assetId from the profiles table
    // Note: playerPDA might be a UUID (user id) or a Solana address, so try both
    try {
      console.log(`🔍 [Skills] Looking up profile for playerPDA: ${validatedData.playerPDA}`);
      
      // Try by player_pda first (Solana address), then fall back to id (UUID)
      let profileResult = await pgQuerySingle<any>(
        'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot, player_pda FROM profiles WHERE player_pda = $1',
        [validatedData.playerPDA]
      );
      let profile = profileResult.data;
      let profileError = profileResult.error;
      
      if (profileError || !profile) {
        console.log(`🔍 [Skills] Not found by player_pda, trying by id (UUID)...`);
        const altResult = await pgQuerySingle<any>(
          'SELECT character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot, player_pda FROM profiles WHERE id = $1',
          [validatedData.playerPDA]
        );
        profile = altResult.data as any;
        profileError = altResult.error;
        profileError = altResult.error as any;
      }
      
      if (profileError) {
        console.warn(`⚠️ [Skills] Profile lookup error for ${validatedData.playerPDA}:`, profileError);
      } else if (!profile) {
        console.warn(`⚠️ [Skills] No profile found for playerPDA: ${validatedData.playerPDA}`);
      } else if (!profile.active_character_slot) {
        console.warn(`⚠️ [Skills] No active_character_slot for playerPDA: ${validatedData.playerPDA}`);
      } else {
        const assetId = (profile as any)[`character_cnft_${profile.active_character_slot}`];
        const actualPlayerPDA = profile.player_pda || validatedData.playerPDA;
        console.log(`🔍 [Skills] Found active character slot ${profile.active_character_slot}, assetId: ${assetId}, actual playerPDA: ${actualPlayerPDA}`);
        
        if (assetId) {
          console.log(`🔄 [Skills] Calling addSkillXp for assetId ${assetId}, skill ${validatedData.skill}, XP ${validatedData.experienceGain}`);
          // Update nft_skill_experience table using addSkillXp (what the game reads from)
          const addSkillResult = await addSkillXp(
            assetId,
            validatedData.skill as any,
            validatedData.experienceGain,
            {
              playerPDA: actualPlayerPDA, // Use the actual Solana PDA if available
              source: validatedData.source,
              sessionId: validatedData.sessionId,
              gameMode: validatedData.gameMode,
              additionalData: validatedData.additionalData
            }
          );
          console.log(`✅ [Skills] Updated nft_skill_experience for assetId ${assetId}. Leveled up: ${addSkillResult.leveledUp}, New level: ${addSkillResult.level}`);
        } else {
          console.warn(`⚠️ [Skills] No assetId found for slot ${profile.active_character_slot} for playerPDA: ${validatedData.playerPDA}`);
        }
      }
    } catch (nftError) {
      // Don't fail the request if nft_skill_experience update fails
      console.error('❌ [Skills] Failed to update nft_skill_experience (non-fatal):', nftError);
    }
    
    if (success) {
      // Get updated skill data
      const updatedSkillData = await SkillDatabase.getPlayerSkillExperience(validatedData.playerPDA);
      
      res.json({
        success: true,
        message: `Added ${validatedData.experienceGain} ${validatedData.skill} experience`,
        skillData: updatedSkillData
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to add skill experience'
      });
    }
    
  } catch (error) {
    console.error('❌ Error adding skill experience:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/skills/mark-synced - Mark skills as synced to blockchain
router.post('/mark-synced', async (req: any, res: any) => {
  try {
    const validatedData = markSyncedSchema.parse(req.body);
    
    console.log('✅ Marking skills as synced for:', validatedData.playerPDA);
    
    const success = await SkillDatabase.markSkillsSynced(validatedData.playerPDA);
    
    if (success) {
      res.json({
        success: true,
        message: 'Skills marked as synced'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to mark skills as synced'
      });
    }
    
  } catch (error) {
    console.error('❌ Error marking skills as synced:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/skills/pending-sync - Get players with pending sync
router.get('/admin/pending-sync', async (req: any, res: any) => {
  try {
    console.log('🔍 Fetching players with pending sync...');
    
    const pendingPlayers = await SkillDatabase.getPlayersWithPendingSync();
    
    res.json({
      success: true,
      pendingPlayers,
      count: pendingPlayers.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching pending sync players:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// REMOVED: GET /api/skills/leaderboard/:skill - Unused endpoint
// REMOVED: GET /api/skills/rankings/total-level - Unused endpoint
// These endpoints were removed because:
// 1. Views (skill_leaderboards, total_level_rankings) are being removed
// 2. No client code calls these endpoints
// 3. Leaderboard data can be computed on-demand from player_skill_experience table if needed

// POST /api/skills/calculate-level - Calculate level from experience
router.post('/calculate-level', async (req: any, res: any) => {
  try {
    const { experience } = req.body;
    
    if (typeof experience !== 'number' || experience < 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid experience number required'
      });
    }
    
    const level = SkillDatabase.calculateLevelFromExperience(experience);
    const experienceForLevel = SkillDatabase.getExperienceForLevel(level);
    const experienceForNextLevel = SkillDatabase.getExperienceForLevel(level + 1);
    
    res.json({
      success: true,
      experience,
      level,
      experienceForCurrentLevel: experienceForLevel,
      experienceForNextLevel,
      experienceToNextLevel: Math.max(0, experienceForNextLevel - experience)
    });
    
  } catch (error) {
    console.error('❌ Error calculating level:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;