/**
 * Quests API Routes
 * Manages quest definitions for the game world
 */

import { Router } from 'express';
import { Client } from 'pg';
import { authenticateUser } from '../utils/auth-helper';
import { z } from 'zod';

const router = Router();

function getPgClient(): InstanceType<typeof Client> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set');
  }
  return new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
}

// Validation schemas
const QuestSchema = z.object({
  id: z.string().optional(),
  world_name: z.string().default('runara_world'),
  title: z.string().min(1),
  description: z.string().optional(),
  quest_type: z.enum(['fetch', 'kill', 'deliver', 'interact', 'craft']),
  min_level: z.number().int().min(1).default(1),
  repeatable: z.boolean().default(false),
  time_limit_ms: z.number().int().optional(),
  rewards: z.any().optional(),
  config: z.any(),
  giver_npc_id: z.string().optional(),
});

/**
 * GET /api/quests
 * Get quests for a world
 */
router.get('/', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const worldName = req.query.worldName || 'runara_world';
    const id = req.query.id;
    
    let query = 'SELECT * FROM quests WHERE world_name = $1';
    const params: any[] = [worldName];
    
    if (id) {
      query += ' AND id = $2';
      params.push(id);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await client.query(query, params);
    
    return res.json({
      success: true,
      quests: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching quests:', error);
    return res.status(500).json({
      error: 'Failed to fetch quests',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

/**
 * POST /api/quests
 * Create or update a quest (requires authentication)
 */
router.post('/', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { userId } = await authenticateUser(req);
    const questData = QuestSchema.parse(req.body);
    
    if (questData.id) {
      // Update existing quest
      const result = await client.query(
        `UPDATE quests 
         SET title = $1, description = $2, quest_type = $3, min_level = $4, 
             repeatable = $5, time_limit_ms = $6, rewards = $7, config = $8, 
             giver_npc_id = $9, updated_at = NOW()
         WHERE id = $10 AND world_name = $11
         RETURNING *`,
        [
          questData.title,
          questData.description || null,
          questData.quest_type,
          questData.min_level,
          questData.repeatable,
          questData.time_limit_ms || null,
          questData.rewards ? JSON.stringify(questData.rewards) : null,
          JSON.stringify(questData.config),
          questData.giver_npc_id || null,
          questData.id,
          questData.world_name
        ]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Quest not found'
        });
      }
      
      return res.json({
        success: true,
        quest: result.rows[0]
      });
    } else {
      // Create new quest
      const result = await client.query(
        `INSERT INTO quests (world_name, title, description, quest_type, min_level, 
                           repeatable, time_limit_ms, rewards, config, giver_npc_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          questData.world_name,
          questData.title,
          questData.description || null,
          questData.quest_type,
          questData.min_level,
          questData.repeatable,
          questData.time_limit_ms || null,
          questData.rewards ? JSON.stringify(questData.rewards) : null,
          JSON.stringify(questData.config),
          questData.giver_npc_id || null
        ]
      );
      
      return res.json({
        success: true,
        quest: result.rows[0]
      });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid quest data',
        details: error.errors
      });
    }
    
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Error creating/updating quest:', error);
    return res.status(500).json({
      error: 'Failed to create/update quest',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

/**
 * DELETE /api/quests
 * Delete a quest (requires authentication)
 */
router.delete('/', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { userId } = await authenticateUser(req);
    const id = req.query.id;
    
    if (!id) {
      return res.status(400).json({
        error: 'Quest ID required'
      });
    }
    
    const result = await client.query(
      'DELETE FROM quests WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Quest not found'
      });
    }
    
    return res.json({
      success: true,
      message: 'Quest deleted successfully',
      id: result.rows[0].id
    });
  } catch (error: any) {
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Error deleting quest:', error);
    return res.status(500).json({
      error: 'Failed to delete quest',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

export default router;
