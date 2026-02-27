import { Router } from 'express';
import { z } from 'zod';
import { addSkillXp } from '../services/nft-skill-experience';
import { SkillDatabase } from '../services/database';

const router = Router();

// Schema for the simple training endpoint
const TrainSkillSchema = z.object({
  assetId: z.string().min(1, 'Asset ID is required'),
  action: z.string().min(1, 'Action is required'),
  expGained: z.number().min(1, 'Experience gained must be positive'),
  playerPDA: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  gameMode: z.string().optional(),
  additionalData: z.any().optional()
});

// GET /api/skill-training/actions - Get all available actions
router.get('/actions', async (req: any, res: any) => {
  try {
    const actions = await SkillDatabase.getActionSkillMappings();
    res.json({
      success: true,
      actions: actions
    });
  } catch (error) {
    console.error('❌ Error fetching actions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available actions'
    });
  }
});

// POST /api/skill-training/train - Train a skill through an action
router.post('/train', async (req: any, res: any) => {
  try {
    const { assetId, action, expGained, playerPDA, sessionId, gameMode, additionalData } = TrainSkillSchema.parse(req.body);
    
    console.log(`🎯 Training skill via action: ${action} (+${expGained} exp) for asset ${assetId}`);
    
    // Get the skill associated with this action
    const actionSkill = await SkillDatabase.getSkillForAction(action);
    if (!actionSkill) {
      return res.status(400).json({
        success: false,
        error: `Unknown action: ${action}. Use GET /api/skill-training/actions to see available actions.`
      });
    }
    
    // Add experience to the skill
    const result = await addSkillXp(
      assetId,
      actionSkill.skill as any,
      expGained,
      {
        playerPDA,
        source: `action:${action}`,
        sessionId,
        gameMode,
        additionalData: {
          ...additionalData,
          action,
          actionDescription: actionSkill.description
        }
      }
    );
    
    // Log the training activity
    await SkillDatabase.logSkillTraining({
      assetId,
      action,
      skill: actionSkill.skill,
      expGained,
      playerPDA,
      sessionId,
      gameMode,
      additionalData
    });
    
    res.json({
      success: true,
      message: `Successfully trained ${actionSkill.skill} via ${action}`,
      result: {
        skill: result.skill,
        level: result.level,
        experience: result.experience,
        leveledUp: result.leveledUp,
        progressPct: result.progressPct
      }
    });
    
  } catch (error) {
    console.error('❌ Error training skill:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to train skill'
    });
  }
});

// GET /api/skill-training/history/:assetId - Get training history for an asset
router.get('/history/:assetId', async (req: any, res: any) => {
  try {
    const { assetId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const history = await SkillDatabase.getSkillTrainingHistory(assetId, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      history: history
    });
  } catch (error) {
    console.error('❌ Error fetching training history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch training history'
    });
  }
});

export default router;
