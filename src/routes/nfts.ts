/**
 * NFTs API Routes
 * Provides NFT/character data via PostgreSQL (replaces Supabase queries)
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

/**
 * GET /api/nfts/:assetId
 * Get NFT by assetId
 */
router.get('/:assetId', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    const { assetId } = req.params;
    
    const result = await client.query(
      'SELECT * FROM nfts WHERE asset_id = $1',
      [assetId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NFT not found'
      });
    }
    
    return res.json({
      success: true,
      nft: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error fetching NFT:', error);
    return res.status(500).json({
      error: 'Failed to fetch NFT',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

/**
 * PATCH /api/nfts/:assetId
 * Update NFT (requires authentication)
 */
router.patch('/:assetId', async (req: any, res: any) => {
  const client = getPgClient();
  
  try {
    await client.connect();
    
    await authenticateUser(req); // Verify auth
    const { assetId } = req.params;
    const updates = req.body;
    
    // Build dynamic update query
    const allowedFields = ['name', 'character_image_url'];
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    updateFields.push(`updated_at = NOW()`);
    values.push(assetId);
    
    const query = `
      UPDATE nfts 
      SET ${updateFields.join(', ')}
      WHERE asset_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await client.query(query, values);
    
    return res.json({
      success: true,
      nft: result.rows[0]
    });
  } catch (error: any) {
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Error updating NFT:', error);
    return res.status(500).json({
      error: 'Failed to update NFT',
      details: error.message
    });
  } finally {
    await client.end();
  }
});

export default router;
