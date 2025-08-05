import { Router } from 'express';
import { z } from 'zod';
import { SkillDatabase } from '../services/database';

const router = Router();

// Validation schemas
const addExperienceSchema = z.object({
  playerPDA: z.string().min(32).max(44),
  skill: z.enum(['combat', 'magic', 'crafting', 'exploration', 'gambling']),
  experienceGain: z.number().min(1).max(1000000),
  source: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  gameMode: z.string().optional(),
  additionalData: z.any().optional()
});

const markSyncedSchema = z.object({
  playerPDA: z.string().min(32).max(44)
});

// GET /api/skills/:playerPDA - Get player skill experience
router.get('/:playerPDA', async (req, res) => {
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
router.post('/add-experience', async (req, res) => {
  try {
    const validatedData = addExperienceSchema.parse(req.body);
    
    console.log('📈 Adding skill experience:', validatedData);
    
    const success = await SkillDatabase.addSkillExperience(
      validatedData.playerPDA,
      validatedData.skill,
      validatedData.experienceGain,
      validatedData.source,
      validatedData.sessionId,
      validatedData.gameMode,
      validatedData.additionalData
    );
    
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
router.post('/mark-synced', async (req, res) => {
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
router.get('/admin/pending-sync', async (req, res) => {
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

// GET /api/skills/leaderboard/:skill - Get skill leaderboard
router.get('/leaderboard/:skill', async (req, res) => {
  try {
    const { skill } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    
    if (!['combat', 'magic', 'crafting', 'exploration', 'gambling'].includes(skill)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid skill name'
      });
    }
    
    console.log(`🏆 Fetching ${skill} leaderboard (limit: ${limit})`);
    
    // This would use the skill_leaderboards view from the database
    const { supabase } = await import('../config/database');
    const { data, error } = await supabase
      .from('skill_leaderboards')
      .select('*')
      .eq('skill', skill)
      .order('level', { ascending: false })
      .order('experience', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('❌ Error fetching leaderboard:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch leaderboard'
      });
    }
    
    res.json({
      success: true,
      skill,
      leaderboard: data || [],
      count: data?.length || 0
    });
    
  } catch (error) {
    console.error('❌ Error fetching skill leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/skills/total-level-rankings - Get total level rankings
router.get('/rankings/total-level', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    
    console.log(`🏆 Fetching total level rankings (limit: ${limit})`);
    
    // This would use the total_level_rankings view from the database
    const { supabase } = await import('../config/database');
    const { data, error } = await supabase
      .from('total_level_rankings')
      .select('*')
      .order('total_level', { ascending: false })
      .order('total_experience', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('❌ Error fetching total level rankings:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch rankings'
      });
    }
    
    res.json({
      success: true,
      rankings: data || [],
      count: data?.length || 0
    });
    
  } catch (error) {
    console.error('❌ Error fetching total level rankings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/skills/calculate-level - Calculate level from experience
router.post('/calculate-level', async (req, res) => {
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