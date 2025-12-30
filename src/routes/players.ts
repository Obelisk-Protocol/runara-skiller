import { Router } from 'express';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { program, connection, serverKeypair, PROGRAM_ID, getCobxMint, createWeb2IdHash } from '../config/anchor';
import { supabase } from '../config/database';
import { createHash } from 'crypto';

const router = Router();

// Helper to authenticate user from Supabase auth header
async function authenticateUser(req: any): Promise<{ userId: string; profile: any }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized - missing or invalid auth header');
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Unauthorized - invalid token');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Profile not found');
  }

  return { userId: user.id, profile };
}

// POST /api/players/initialize-web2 - Initialize Web2 player
router.post('/initialize-web2', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { name, characterClass } = req.body;

    if (profile?.player_pda) {
      return res.status(409).json({ error: 'Player account already exists' });
    }

    if (name && name.length < 3) {
      return res.status(400).json({ error: 'Name must be at least 3 characters long' });
    }

    if (characterClass !== undefined && (characterClass < 0 || characterClass > 3)) {
      return res.status(400).json({ error: 'Invalid character class. Must be 0-3' });
    }

    // Validate environment configuration before proceeding
    let COBX_MINT;
    try {
      COBX_MINT = getCobxMint();
    } catch (error: any) {
      console.error('=== Configuration Error ===');
      console.error('Failed to get COBX mint:', error?.message);
      const cluster = process.env.SOLANA_CLUSTER || 'unknown';
      return res.status(500).json({
        error: 'Server configuration error',
        details: `cOBX mint not configured for cluster: ${cluster}. Please ensure COBX_MINT_MAINNET (or COBX_MINT_DEVNET) is set in environment variables.`
      });
    }

    // Create a fresh PDA by adding a timestamp salt to avoid collision with old accounts
    const saltedUserId = `${userId}_${Date.now()}`;
    const web2IdHash = createWeb2IdHash(saltedUserId);
    console.log('Creating FRESH player PDA with salted ID:', saltedUserId.slice(-20));

    const [playerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('player'), Buffer.from(web2IdHash)],
      PROGRAM_ID
    );

    console.log('Player PDA:', playerPda.toBase58());

    const playerName = name || 'New Player';
    const playerClass = characterClass !== undefined ? characterClass : 0;

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const [playerCobxAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('player_cobx'), Buffer.from(web2IdHash)],
      PROGRAM_ID
    );

    // @ts-ignore - Anchor type inference limitation
    const tx = await program.methods
      .initializeWeb2Player(playerName, playerClass, Array.from(web2IdHash))
      .accounts({
        config: configPda,
        playerAccount: playerPda,
        playerCobxAccount: playerCobxAccount,
        cobxMint: COBX_MINT,
        signer: serverKeypair.publicKey,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log('Transaction successful:', tx);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        player_pda: playerPda.toBase58(),
        cobx_token_account: playerCobxAccount.toBase58(),
        pda_status: 'active', // Allowed: 'pending', 'creating', 'active', 'failed'
        pda_created_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    console.log('Profile updated successfully');

    return res.json({
      success: true,
      playerPda: playerPda.toBase58(),
      transaction: tx,
      message: 'Player account created successfully'
    });

  } catch (error: any) {
    console.error('=== Initialize Web2 Player Error ===');
    console.error('Error message:', error?.message || String(error));

    if (error?.message?.includes('insufficient funds')) {
      return res.status(500).json({
        error: 'Server wallet has insufficient funds. Please contact support.'
      });
    }

    if (error?.message?.includes('already in use')) {
      console.log('🔄 RECOVERY: Player PDA already exists, linking to profile...');
      
      try {
        const { userId, profile } = await authenticateUser(req);
        
        // For recovery, use the original user ID to find the existing PDA
        const originalWeb2IdHash = createWeb2IdHash(userId);
        const [playerPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('player'), Buffer.from(originalWeb2IdHash)],
          PROGRAM_ID
        );
        
        const COBX_MINT = getCobxMint();
        const [playerCobxAccount] = PublicKey.findProgramAddressSync(
          [Buffer.from('player_cobx'), Buffer.from(originalWeb2IdHash)],
          PROGRAM_ID
        );
        
        const cobxAccountInfo = await connection.getAccountInfo(playerCobxAccount);
        
        if (!cobxAccountInfo) {
          console.log('⚡ RECOVERY: Creating missing cOBX Token Account...');
          
          const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
          const { Transaction } = await import('@solana/web3.js');
          
          const createAtaIx = createAssociatedTokenAccountInstruction(
            serverKeypair.publicKey,
            playerCobxAccount,
            playerPda,
            COBX_MINT,
            TOKEN_2022_PROGRAM_ID
          );
          
          const createTx = new Transaction().add(createAtaIx);
          const { blockhash } = await connection.getLatestBlockhash();
          createTx.recentBlockhash = blockhash;
          createTx.feePayer = serverKeypair.publicKey;
          createTx.sign(serverKeypair);
          
          const signature = await connection.sendRawTransaction(createTx.serialize());
          await connection.confirmTransaction(signature, 'confirmed');
          
          console.log('✅ RECOVERY: cOBX Token Account created:', signature);
        } else {
          console.log('✅ RECOVERY: cOBX Token Account already exists');
        }
        
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            player_pda: playerPda.toBase58(),
            cobx_token_account: playerCobxAccount.toBase58(),
          })
          .eq('id', userId);

        if (updateError) {
          console.error('Error updating profile during recovery:', updateError);
          return res.status(500).json({
            error: 'Failed to update profile during recovery'
          });
        }

        console.log('✅ RECOVERY: Database updated with existing PDA');
        return res.json({
          success: true,
          playerPda: playerPda.toBase58(),
          message: 'Player account recovered successfully'
        });
        
      } catch (recoveryError) {
        console.error('⚠️ RECOVERY: Failed to recover account:', recoveryError);
        return res.status(500).json({
          error: 'Failed to recover existing player account'
        });
      }
    }

    return res.status(500).json({
      error: 'Failed to create player account',
      details: error?.message || 'Unknown error'
    });
  }
});

// POST /api/players/initialize-web3 - Initialize Web3 player
router.post('/initialize-web3', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { name, characterClass } = req.body;

    if (!name || typeof characterClass !== 'number') {
      return res.status(400).json({
        error: 'Missing required parameters: name and characterClass'
      });
    }

    if (name.length < 3) {
      return res.status(400).json({ error: 'Name must be at least 3 characters long' });
    }

    if (characterClass < 0 || characterClass > 2) {
      return res.status(400).json({
        error: 'Invalid character class. Must be 0 (Warrior), 1 (Mage), or 2 (Ranger)'
      });
    }

    if (!profile.wallet_address) {
      return res.status(400).json({
        error: 'No wallet address found for user. Please connect wallet first.'
      });
    }

    if (profile?.player_pda) {
      return res.status(409).json({ error: 'Player account already exists' });
    }

    const COBX_MINT = getCobxMint();
    const userWallet = new PublicKey(profile.wallet_address);

    const [playerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('player'), userWallet.toBuffer()],
      PROGRAM_ID
    );

    console.log('Player PDA:', playerPda.toBase58());

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const [playerCobxAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('player_cobx'), userWallet.toBuffer()],
      PROGRAM_ID
    );

    const tx = await program.methods
      .initializeWeb3Player(name, characterClass)
      .accounts({
        config: configPda,
        playerAccount: playerPda,
        playerCobxAccount: playerCobxAccount,
        cobxMint: COBX_MINT,
        signer: userWallet,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers([serverKeypair])
      .rpc();

    console.log('Transaction successful:', tx);

    // Generate SpacetimeDB credentials
    const spacetimePrivateKey = Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)));
    const spacetimeIdentity = createHash('sha256').update(spacetimePrivateKey).digest('hex');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        player_pda: playerPda.toBase58(),
        cobx_token_account: playerCobxAccount.toBase58(),
        spacetime_private_key: spacetimePrivateKey.toString('hex'),
        spacetime_identity: spacetimeIdentity,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    console.log('Profile updated successfully');

    return res.json({
      success: true,
      playerPda: playerPda.toBase58(),
      transaction: tx,
      message: 'Web3 player account created successfully'
    });

  } catch (error: any) {
    console.error('=== Initialize Web3 Player Error ===');
    console.error('Error message:', error?.message || String(error));

    if (error?.message?.includes('insufficient funds')) {
      return res.status(500).json({
        error: 'Server wallet has insufficient funds. Please contact support.'
      });
    }

    if (error?.message?.includes('already in use')) {
      return res.status(409).json({
        error: 'Player account already exists on-chain'
      });
    }

    return res.status(500).json({
      error: 'Failed to create Web3 player account',
      details: error?.message || 'Unknown error'
    });
  }
});

// POST /api/players/initialize-web3-direct - Direct Web3 initialization (no Supabase auth)
router.post('/initialize-web3-direct', async (req: any, res: any) => {
  try {
    const { walletAddress, name, characterClass } = req.body;

    if (!walletAddress || !name || typeof characterClass !== 'number') {
      return res.status(400).json({
        error: 'Missing required parameters: walletAddress, name, characterClass'
      });
    }

    if (name.length < 3) {
      return res.status(400).json({ error: 'Name must be at least 3 characters long' });
    }

    if (characterClass < 0 || characterClass > 2) {
      return res.status(400).json({
        error: 'Invalid character class. Must be 0 (Warrior), 1 (Mage), or 2 (Ranger)'
      });
    }

    const COBX_MINT = getCobxMint();
    const userWallet = new PublicKey(walletAddress);

    const [playerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('player'), userWallet.toBuffer()],
      PROGRAM_ID
    );

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const [playerCobxAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('player_cobx'), userWallet.toBuffer()],
      PROGRAM_ID
    );

    // Return transaction for client signing instead of executing server-side
    const instruction = await program.methods
      .initializeWeb3Player(name, characterClass)
      .accounts({
        config: configPda,
        playerAccount: playerPda,
        playerCobxAccount: playerCobxAccount,
        cobxMint: COBX_MINT,
        signer: userWallet,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .instruction();

    const { Transaction } = await import('@solana/web3.js');
    const transaction = new Transaction().add(instruction);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userWallet;

    // Server signs as payer
    transaction.partialSign(serverKeypair);

    return res.json({
      success: true,
      needsClientSigning: true,
      transactionData: Array.from(transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      })),
      playerPda: playerPda.toBase58(),
      playerCobxAccount: playerCobxAccount.toBase58(),
      message: 'Transaction ready for client-side signing'
    });

  } catch (error: any) {
    console.error('Error preparing Web3 direct initialization:', error);
    return res.status(500).json({
      error: 'Failed to prepare initialization transaction',
      details: error?.message || 'Unknown error'
    });
  }
});

// POST /api/players/initialize-config - Initialize Anchor program config (Admin)
router.post('/initialize-config', async (req: any, res: any) => {
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

// GET /api/players/initialize-config - Check config status
router.get('/initialize-config', async (req: any, res: any) => {
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
