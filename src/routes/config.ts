/**
 * Config API Routes
 * Manages Anchor program configuration initialization
 */

import { Router } from 'express';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { program, connection, serverKeypair, PROGRAM_ID } from '../config/anchor';

const router = Router();

/**
 * POST /api/config/initialize
 * Initialize Anchor program config (Admin)
 */
router.post('/initialize', async (req: any, res: any) => {
  try {
    // Note: Add admin check here if needed
    console.log('⚙️ INITIALIZE CONFIG: Starting config initialization...');

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    console.log('📍 INITIALIZE CONFIG: Config PDA:', configPda.toString());

    const configAccountInfo = await connection.getAccountInfo(configPda);
    if (configAccountInfo) {
      console.log('⚠️ INITIALIZE CONFIG: Config already exists!');
      return res.json({
        message: 'Config already initialized',
        configAddress: configPda.toString(),
        alreadyExists: true
      });
    }

    console.log('🚀 INITIALIZE CONFIG: Initializing config...');

    const tx = await program.methods
      .initializeConfig()
      .accounts({
        config: configPda,
        admin: serverKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([serverKeypair])
      .rpc();

    console.log('✅ INITIALIZE CONFIG: Config initialized successfully!');
    console.log('📋 INITIALIZE CONFIG: Transaction:', tx);

    return res.json({
      success: true,
      message: 'Config initialized successfully',
      transaction: tx,
      configAddress: configPda.toString(),
      nextStep: 'Now you can initialize the vault'
    });

  } catch (error: any) {
    console.error('❌ INITIALIZE CONFIG: Error:', error);
    return res.status(500).json({
      error: 'Failed to initialize config',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/config/initialize
 * Check config status
 */
router.get('/initialize', async (req: any, res: any) => {
  try {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const configAccountInfo = await connection.getAccountInfo(configPda);

    return res.json({
      configAddress: configPda.toString(),
      exists: !!configAccountInfo,
      info: configAccountInfo ? 'Config exists' : 'Config not initialized'
    });

  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to check config status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
