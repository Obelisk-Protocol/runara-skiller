/**
 * Character Customization API Routes
 */

import { Router } from 'express';
import { Client } from 'pg';
import { authenticateUser } from '../utils/auth-helper';

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

/**
 * GET /api/character-customization
 * Fetch saved character customization for the authenticated user
 */
router.get('/', async (req: any, res: any) => {
  const client = getPgClient();

  try {
    await client.connect();

    const { userId } = await authenticateUser(req);

    const result = await client.query(
      'SELECT character_customization FROM profiles WHERE id = $1',
      [userId]
    );

    const raw = result.rows[0]?.character_customization ?? null;
    const customization = raw == null
      ? null
      : typeof raw === 'string'
        ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
        : raw;

    return res.json({ customization });
  } catch (error: any) {
    if (error.message?.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }

    console.error('Error fetching customization:', error);
    return res.status(500).json({
      error: 'Failed to fetch customization',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

/**
 * POST /api/character-customization
 * Save character customization
 */
router.post('/', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { userId } = await authenticateUser(req);
    const { customization } = req.body;
    
    if (!customization) {
      return res.status(400).json({ error: 'Customization object required' });
    }
    
    await client.query(
      'UPDATE profiles SET character_customization = $1, updated_at = NOW() WHERE id = $2 RETURNING character_customization',
      [JSON.stringify(customization), userId]
    );
    
    return res.json({
      success: true,
      message: 'Customization saved'
    });
  } catch (error: any) {
    if (error?.message?.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Error saving customization:', error);
    return res.status(500).json({
      error: 'Failed to save customization',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

export default router;
