import { Router } from 'express';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { program, connection, serverKeypair, PROGRAM_ID, getCobxMint, createWeb2IdHash } from '../config/anchor';
import { supabase } from '../config/database';
import { createHash } from 'crypto';
import { PlayerItemService } from '../services/player-items';
import { z } from 'zod';

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

// GET /api/players/:playerId/items - Get all items for a player
router.get('/:playerId/items', async (req: any, res: any) => {
  try {
    console.log('📦 GET /api/players/:playerId/items - Request received:', {
      playerId: req.params.playerId,
      query: req.query,
      url: req.url
    })
    
    const { playerId } = req.params
    const includeDefinitions = req.query.include_definitions === 'true'
    
    // Get player profile to find user ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('player_pda', playerId)
      .single()
    
    if (profileError || !profile) {
      console.log('❌ Player not found:', { playerId, error: profileError })
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      })
    }
    
    console.log('✅ Player found, fetching items:', { userId: profile.id, includeDefinitions })
    
    let items
    if (includeDefinitions) {
      items = await PlayerItemService.getPlayerItemsWithDefinitions(profile.id)
    } else {
      items = await PlayerItemService.getPlayerItems(profile.id)
    }
    
    console.log('✅ Items fetched:', { count: items.length })
    
    return res.json({
      success: true,
      items
    })
  } catch (error) {
    console.error('❌ Get player items error:', error)
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch player items'
    })
  }
})

// POST /api/players/:playerId/inventory/move - Move items between inventory slots
// NOTE: Without slot_position field, we work with quantities and item IDs
// Stacking works perfectly, but moves to empty slots may reorder items
router.post('/:playerId/inventory/move', async (req: any, res: any) => {
  try {
    const { playerId } = req.params
    const { from_slot, to_slot, quantity } = req.body

    console.log(`📦 [inventory/move] Request received:`, { playerId, from_slot, to_slot, quantity })

    if (typeof from_slot !== 'number' || typeof to_slot !== 'number' || typeof quantity !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: from_slot, to_slot, and quantity must be numbers'
      })
    }

    // Get player profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('player_pda', playerId)
      .single()
    
    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      })
    }

    // Get current inventory (ordered by minted_at)
    const items = await PlayerItemService.getPlayerItemsWithDefinitions(profile.id)
    
    console.log(`📦 [inventory/move] Current inventory: ${items.length} items`)
    
    // Map to slots (first 30 items = slots 0-29)
    const fromItem = items[from_slot]
    const toItem = items[to_slot] || null

    if (!fromItem) {
      console.error(`❌ [inventory/move] No item at slot ${from_slot}`)
      return res.status(400).json({
        success: false,
        error: `No item at slot ${from_slot}`
      })
    }
    
    // SECURITY: Re-fetch items by ID to get current quantities (prevents stale data exploits)
    const { data: fromItemCurrent, error: fromFetchError } = await supabase
      .from('player_items')
      .select('id, quantity, item_definition_id')
      .eq('id', fromItem.id)
      .single()
    
    if (fromFetchError || !fromItemCurrent) {
      console.error('❌ [inventory/move] Source item not found in database:', fromFetchError)
      return res.status(404).json({
        success: false,
        error: 'Source item not found'
      })
    }
    
    // SECURITY: Validate current quantity matches expected
    if (fromItemCurrent.quantity !== fromItem.quantity) {
      console.error(`❌ [inventory/move] Source quantity mismatch: expected ${fromItem.quantity}, got ${fromItemCurrent.quantity}`)
      return res.status(409).json({
        success: false,
        error: 'Source item quantity changed. Please refresh and try again.'
      })
    }
    
    // SECURITY: Validate move quantity doesn't exceed available
    if (quantity > fromItemCurrent.quantity) {
      console.error(`❌ [inventory/move] Move quantity (${quantity}) exceeds available (${fromItemCurrent.quantity})`)
      return res.status(400).json({
        success: false,
        error: `Cannot move ${quantity} items (only ${fromItemCurrent.quantity} available)`
      })
    }
    
    let toItemCurrent = null
    if (toItem) {
      const { data: toItemCurrentData, error: toFetchError } = await supabase
        .from('player_items')
        .select('id, quantity, item_definition_id')
        .eq('id', toItem.id)
        .single()
      
      if (toFetchError || !toItemCurrentData) {
        console.error('❌ [inventory/move] Target item not found in database:', toFetchError)
        return res.status(404).json({
          success: false,
          error: 'Target item not found'
        })
      }
      
      // SECURITY: Validate current quantity matches expected
      if (toItemCurrentData.quantity !== toItem.quantity) {
        console.error(`❌ [inventory/move] Target quantity mismatch: expected ${toItem.quantity}, got ${toItemCurrentData.quantity}`)
        return res.status(409).json({
          success: false,
          error: 'Target item quantity changed. Please refresh and try again.'
        })
      }
      
      toItemCurrent = toItemCurrentData
    }

    console.log(`📦 [inventory/move] From item:`, { 
      id: fromItem.id, 
      item_definition_id: fromItem.item_definition_id, 
      quantity: fromItem.quantity,
      name: fromItem.definition?.name 
    })
    if (toItem) {
      console.log(`📦 [inventory/move] To item:`, { 
        id: toItem.id, 
        item_definition_id: toItem.item_definition_id, 
        quantity: toItem.quantity,
        name: toItem.definition?.name 
      })
    }

    // Use current quantities from database (not cached values)
    const fromQuantity = fromItemCurrent.quantity - quantity
    const toQuantity = toItemCurrent ? toItemCurrent.quantity + quantity : quantity

    // Check if stacking same item
    const isSameItem = toItemCurrent && fromItemCurrent.item_definition_id === toItemCurrent.item_definition_id
    const isStackable = fromItem.definition?.max_stack_size && fromItem.definition.max_stack_size > 1
    const maxStack = fromItem.definition?.max_stack_size || 1

    if (isSameItem && isStackable && toQuantity <= maxStack) {
      // STACKING: Atomic operation with validation to prevent exploits
      console.log(`📦 [inventory/move] Stacking: fromSlot=${from_slot}, toSlot=${to_slot}, quantity=${quantity}, fromItem.id=${fromItem.id}, toItem.id=${toItem.id}`)
      
      // SECURITY: Use current quantities from database (already validated above)
      const expectedFromQuantity = fromItemCurrent.quantity
      const expectedToQuantity = toItemCurrent!.quantity
      
      if (expectedFromQuantity < quantity) {
        console.error(`❌ [inventory/move] Invalid move: source quantity (${expectedFromQuantity}) < move quantity (${quantity})`)
        return res.status(400).json({
          success: false,
          error: `Invalid move: source quantity (${expectedFromQuantity}) is less than move quantity (${quantity})`
        })
      }
      
      if (fromQuantity > 0) {
        // Partial stack - reduce source, increase target
        // SECURITY: Use conditional update with expected quantity (optimistic locking)
        // This ensures the item hasn't changed between read and update
        const { data: sourceUpdate, error: sourceError } = await supabase
          .from('player_items')
          .update({ quantity: fromQuantity })
          .eq('id', fromItem.id)
          .eq('quantity', expectedFromQuantity) // Optimistic lock: only update if quantity matches
          .select()
          .single()
        
        if (sourceError || !sourceUpdate) {
          console.error('❌ Error updating source item (possible race condition):', sourceError)
          return res.status(409).json({
            success: false,
            error: 'Source item quantity changed during move. Please try again.'
          })
        }
        
        // SECURITY: Verify source was actually updated
        if (sourceUpdate.quantity !== fromQuantity) {
          console.error(`❌ [inventory/move] Source quantity mismatch: expected ${fromQuantity}, got ${sourceUpdate.quantity}`)
          // Revert source update
          await supabase
            .from('player_items')
            .update({ quantity: expectedFromQuantity })
            .eq('id', fromItem.id)
          return res.status(500).json({
            success: false,
            error: 'Failed to update source item quantity correctly'
          })
        }
        
        // Update target item quantity by ID with optimistic locking
        const { data: targetUpdate, error: targetError } = await supabase
          .from('player_items')
          .update({ quantity: toQuantity })
          .eq('id', toItem.id)
          .eq('quantity', expectedToQuantity) // Optimistic lock: only update if quantity matches
          .select()
          .single()
        
        if (targetError || !targetUpdate) {
          console.error('❌ Error updating target item (possible race condition):', targetError)
          // Revert source update
          await supabase
            .from('player_items')
            .update({ quantity: expectedFromQuantity })
            .eq('id', fromItem.id)
          return res.status(409).json({
            success: false,
            error: 'Target item quantity changed during move. Please try again.'
          })
        }
        
        // SECURITY: Verify target was actually updated
        if (targetUpdate.quantity !== toQuantity) {
          console.error(`❌ [inventory/move] Target quantity mismatch: expected ${toQuantity}, got ${targetUpdate.quantity}`)
          // Revert both updates
          await supabase
            .from('player_items')
            .update({ quantity: expectedFromQuantity })
            .eq('id', fromItem.id)
          await supabase
            .from('player_items')
            .update({ quantity: expectedToQuantity })
            .eq('id', toItem.id)
          return res.status(500).json({
            success: false,
            error: 'Failed to update target item quantity correctly'
          })
        }
        
        // SECURITY: Final validation - verify total quantity is preserved
        const totalBefore = expectedFromQuantity + expectedToQuantity
        const totalAfter = fromQuantity + toQuantity
        if (totalBefore !== totalAfter) {
          console.error(`❌ [inventory/move] Quantity mismatch: before=${totalBefore}, after=${totalAfter}`)
          // Revert both updates
          await supabase
            .from('player_items')
            .update({ quantity: expectedFromQuantity })
            .eq('id', fromItem.id)
          await supabase
            .from('player_items')
            .update({ quantity: expectedToQuantity })
            .eq('id', toItem.id)
          return res.status(500).json({
            success: false,
            error: 'Quantity validation failed'
          })
        }
        
        console.log(`✅ [inventory/move] Stacked: source=${fromQuantity}, target=${toQuantity}`)
      } else {
        // Moving entire stack - delete source by ID, update target
        // SECURITY: Use conditional update with expected quantity (optimistic locking)
        const { data: targetUpdate, error: targetError } = await supabase
          .from('player_items')
          .update({ quantity: toQuantity })
          .eq('id', toItem.id)
          .eq('quantity', expectedToQuantity) // Optimistic lock
          .select()
          .single()
        
        if (targetError || !targetUpdate) {
          console.error('❌ Error updating target item (possible race condition):', targetError)
          return res.status(409).json({
            success: false,
            error: 'Target item quantity changed during move. Please try again.'
          })
        }
        
        // SECURITY: Verify target was actually updated
        if (targetUpdate.quantity !== toQuantity) {
          console.error(`❌ [inventory/move] Target quantity mismatch: expected ${toQuantity}, got ${targetUpdate.quantity}`)
          // Revert target update
          await supabase
            .from('player_items')
            .update({ quantity: expectedToQuantity })
            .eq('id', toItem.id)
          return res.status(500).json({
            success: false,
            error: 'Failed to update target item quantity correctly'
          })
        }
        
        // CRITICAL: Delete source by specific item ID, only if quantity matches (prevents deletion of wrong item)
        const { error: deleteError } = await supabase
          .from('player_items')
          .delete()
          .eq('id', fromItem.id)
          .eq('quantity', expectedFromQuantity) // Only delete if quantity matches (prevents exploits)
        
        if (deleteError) {
          console.error('❌ Error deleting source item:', deleteError)
          // Revert target update
          await supabase
            .from('player_items')
            .update({ quantity: expectedToQuantity })
            .eq('id', toItem.id)
          throw deleteError
        }
        
        // SECURITY: Verify source was deleted (check it doesn't exist)
        const { data: deletedCheck } = await supabase
          .from('player_items')
          .select('id')
          .eq('id', fromItem.id)
          .single()
        
        if (deletedCheck) {
          console.error('❌ [inventory/move] Source item was not deleted properly')
          // Revert target update
          await supabase
            .from('player_items')
            .update({ quantity: expectedToQuantity })
            .eq('id', toItem.id)
          return res.status(500).json({
            success: false,
            error: 'Failed to delete source item'
          })
        }
        
        // SECURITY: Final validation - verify total quantity is preserved
        const totalBefore = expectedFromQuantity + expectedToQuantity
        const totalAfter = toQuantity
        if (totalBefore !== totalAfter) {
          console.error(`❌ [inventory/move] Quantity mismatch: before=${totalBefore}, after=${totalAfter}`)
          // Revert target update (source already deleted, so we need to recreate it)
          await supabase
            .from('player_items')
            .update({ quantity: expectedToQuantity })
            .eq('id', toItem.id)
          // Recreate source item
          await supabase
            .from('player_items')
            .insert({
              player_id: profile.id,
              item_definition_id: fromItem.item_definition_id,
              cnft_address: fromItem.cnft_address,
              mint_signature: fromItem.mint_signature,
              quantity: expectedFromQuantity,
              rarity: fromItem.rarity,
              item_type: fromItem.item_type,
              current_durability: fromItem.current_durability,
              mint_cost: fromItem.mint_cost || 0,
              is_stacked: fromItem.is_stacked || false,
              acquisition_source: fromItem.acquisition_source,
              minted_at: fromItem.minted_at
            })
          return res.status(500).json({
            success: false,
            error: 'Quantity validation failed'
          })
        }
        
        console.log(`✅ [inventory/move] Moved entire stack: target=${toQuantity}`)
      }
    } else if (!toItem) {
      // Moving to empty slot
      console.log(`📦 [inventory/move] Moving to empty slot: fromQuantity=${fromQuantity}, quantity=${quantity}`)
      
      if (fromQuantity > 0) {
        // Split stack - update source by ID, create new entry for split
        const { error: sourceError } = await supabase
          .from('player_items')
          .update({ quantity: fromQuantity })
          .eq('id', fromItem.id)
        
        if (sourceError) {
          console.error('❌ Error updating source item:', sourceError)
          throw sourceError
        }
        
        // Create new entry for the moved quantity
        // IMPORTANT: Position the new item correctly in the list based on slot positions
        // Items are ordered by minted_at DESC (newest first)
        // If toSlot < fromSlot, new item should appear before source (newer timestamp)
        // If toSlot > fromSlot, new item should appear after source (older timestamp)
        const sourceMintedAt = new Date(fromItem.minted_at || new Date())
        let newMintedAt: Date
        if (to_slot < from_slot) {
          // New item should appear before source (newer timestamp)
          newMintedAt = new Date(sourceMintedAt.getTime() + 1)
        } else {
          // New item should appear after source (older timestamp)
          newMintedAt = new Date(sourceMintedAt.getTime() - 1)
        }
        
        const { data: newItem, error: createError } = await supabase
          .from('player_items')
          .insert({
            player_id: profile.id,
            item_definition_id: fromItem.item_definition_id,
            cnft_address: `item_${profile.id}_${fromItem.item_definition_id}_${Date.now()}`,
            mint_signature: `mint_item_${profile.id}_${fromItem.item_definition_id}_${Date.now()}`,
            quantity: quantity,
            rarity: fromItem.rarity,
            item_type: fromItem.item_type,
            current_durability: fromItem.current_durability,
            mint_cost: fromItem.mint_cost || 0,
            is_stacked: fromItem.is_stacked || false,
            acquisition_source: 'inventory_move',
            minted_at: newMintedAt.toISOString()
          })
          .select()
          .single()
        
        if (createError) {
          console.error('❌ Error creating split item:', createError)
          throw createError
        }
        
        console.log(`✅ [inventory/move] Split stack: source=${fromQuantity}, new=${quantity}, newItemId=${newItem.id}`)
      } else {
        // Moving entire stack to empty slot
        // Since we can't change slot_position, we need to create a new entry and delete the old one
        // This ensures the item appears in the correct position in the list
        const sourceMintedAt = new Date(fromItem.minted_at || new Date())
        
        // Create new entry with same data but new minted_at (will appear at top of list)
        const { data: newItem, error: createError } = await supabase
          .from('player_items')
          .insert({
            player_id: profile.id,
            item_definition_id: fromItem.item_definition_id,
            cnft_address: `item_${profile.id}_${fromItem.item_definition_id}_${Date.now()}`,
            mint_signature: `mint_item_${profile.id}_${fromItem.item_definition_id}_${Date.now()}`,
            quantity: fromItem.quantity,
            rarity: fromItem.rarity,
            item_type: fromItem.item_type,
            current_durability: fromItem.current_durability,
            mint_cost: fromItem.mint_cost || 0,
            is_stacked: fromItem.is_stacked || false,
            acquisition_source: 'inventory_move',
            minted_at: new Date().toISOString() // New timestamp for new position
          })
          .select()
          .single()
        
        if (createError) {
          console.error('❌ Error creating moved item:', createError)
          throw createError
        }
        
        // Delete old entry
        const { error: deleteError } = await supabase
          .from('player_items')
          .delete()
          .eq('id', fromItem.id)
        
        if (deleteError) {
          console.error('❌ Error deleting source item:', deleteError)
          throw deleteError
        }
        
        console.log(`✅ [inventory/move] Moved entire stack to empty slot: newItemId=${newItem.id}`)
      }
    } else {
      // Different items - can't merge, operation not supported without slot_position
      console.log(`❌ [inventory/move] Different items - cannot swap without slot_position`)
      return res.status(400).json({
        success: false,
        error: 'Moving different items requires slot_position field (not yet implemented)'
      })
    }

    console.log(`✅ [inventory/move] Move completed successfully`)

    return res.json({
      success: true
    })
  } catch (error) {
    console.error('❌ Inventory move error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to move item'
    })
  }
})

// POST /api/players/:playerId/items/award - Award item to player (server-to-server)
router.post('/:playerId/items/award', async (req: any, res: any) => {
  try {
    const { playerId } = req.params
    const schema = z.object({
      itemId: z.string().min(1),
      quantity: z.number().int().positive().default(1),
      source: z.string().optional().default('game_reward'),
      interactionId: z.string().optional()
    })
    
    const { itemId, quantity, source, interactionId } = schema.parse(req.body)
    
    // playerId can be either:
    // 1. player_pda (Solana PDA) - from client requests
    // 2. userId (Supabase UUID) - from chunk server
    // Try to find profile by either identifier
    let profile: any = null
    let profileError: any = null
    
    // First, try as UUID (chunk server sends userId)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidPattern.test(playerId)) {
      // It's a UUID - look up by id directly
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', playerId)
        .single()
      
      profile = data
      profileError = error
    }
    
    // If not found as UUID, try as player_pda
    if (!profile && profileError) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('player_pda', playerId)
        .single()
      
      profile = data
      profileError = error
    }
    
    if (profileError || !profile) {
      console.error(`❌ Player not found for identifier: ${playerId}`, profileError)
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      })
    }
    
    const playerItem = await PlayerItemService.awardItemToPlayer({
      playerId: profile.id,
      itemId,
      quantity,
      source: source || 'game_reward',
      interactionId
    })
    
    return res.json({
      success: true,
      item: playerItem
    })
  } catch (error) {
    console.error('❌ Award item error:', error)
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to award item'
    })
  }
})

export default router;
