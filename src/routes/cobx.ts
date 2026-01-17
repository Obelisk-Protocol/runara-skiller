import { Router } from 'express';
import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint, getAccount, createTransferInstruction, createBurnInstruction, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { program, connection, serverKeypair, PROGRAM_ID, getObxMint, getCobxMint, createWeb2IdHash } from '../config/anchor';
import { Client } from 'pg';
import { z } from 'zod';
import { authenticateUser } from '../utils/auth-helper';

const router = Router();

// Helper to get PostgreSQL client
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

// GET /api/cobx/balance - Query cOBX balance
router.get('/balance', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const isDebug = url.searchParams.get('debug') === 'true';
    const shouldLog = Math.random() < 0.05 || isDebug;

    if (shouldLog || isDebug) {
      console.log('=== cOBX Balance API (sampled) ===');
    }

    if (!profile.player_pda && !isDebug) {
      return res.status(400).json({
        error: 'Player account not found. Please initialize your account first.'
      });
    }

    if (shouldLog || isDebug) {
      console.log('User profile found:', { wallet: profile.wallet_address, pda: profile.player_pda });
    }

    const COBX_MINT = getCobxMint();
    let playerCOBXAccount: PublicKey;
    const isWeb3Player = !!profile.wallet_address;

    if (profile.cobx_token_account) {
      playerCOBXAccount = new PublicKey(profile.cobx_token_account);
      if (shouldLog || isDebug) console.log('🔍 Using stored cOBX account:', playerCOBXAccount.toBase58());
    } else {
      if (shouldLog || isDebug) console.log('⚠️ No stored cOBX account, falling back to derivation');

      if (isWeb3Player) {
        [playerCOBXAccount] = PublicKey.findProgramAddressSync(
          [Buffer.from('player_cobx'), new PublicKey(profile.wallet_address).toBuffer()],
          PROGRAM_ID
        );
        if (shouldLog || isDebug) console.log('🔍 Derived Web3 cOBX account:', playerCOBXAccount.toBase58());
      } else {
        const web2IdHash = createWeb2IdHash(userId);
        [playerCOBXAccount] = PublicKey.findProgramAddressSync(
          [Buffer.from('player_cobx'), web2IdHash],
          PROGRAM_ID
        );
        if (shouldLog || isDebug) console.log('🔍 Derived Web2 cOBX account:', playerCOBXAccount.toBase58());
      }
    }

    if (shouldLog || isDebug) console.log(`Player cOBX account: ${playerCOBXAccount.toBase58()}`);

    try {
      const accountInfo = await connection.getAccountInfo(playerCOBXAccount);

      if (!accountInfo) {
        if (shouldLog || isDebug) console.log('cOBX account not found - balance is 0');
        return res.json({
          balance: 0,
          formattedBalance: '0.000000000',
          accountExists: false,
          account: playerCOBXAccount.toBase58(),
          ...(isDebug && {
            debug: {
              playerPDA: profile.player_pda,
              cobxAccount: playerCOBXAccount.toBase58(),
              cobxAccountSource: profile.cobx_token_account ? 'stored' : 'derived',
              storedCobxAccount: profile.cobx_token_account || 'none',
              userId,
              isWeb3Player
            }
          })
        });
      }

      if (!accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        throw new Error(`Invalid account owner: ${accountInfo.owner.toBase58()}`);
      }

      // Parse token account data manually
      if (accountInfo.data.length < 72) {
        throw new Error('Invalid token account data length');
      }

      const amount = accountInfo.data.readBigUInt64LE(64);
      const balance = parseInt(amount.toString());
      const formattedBalance = (balance / 1_000_000_000).toFixed(9);

      console.log(`✅ Balance found: ${formattedBalance} cOBX`);

      return res.json({
        balance: balance,
        formattedBalance: formattedBalance,
        accountExists: true,
        account: playerCOBXAccount.toBase58(),
        mint: COBX_MINT.toBase58(),
        ...(isDebug && {
          debug: {
            playerPDA: profile.player_pda,
            cobxAccount: playerCOBXAccount.toBase58(),
            userId,
            isWeb3Player
          }
        })
      });

    } catch (parseError) {
      console.error('Error parsing account data:', parseError);

      try {
        const tokenAccount = await getAccount(
          connection,
          playerCOBXAccount,
          'confirmed',
          TOKEN_2022_PROGRAM_ID
        );

        const balance = Number(tokenAccount.amount);
        const formattedBalance = (balance / 1_000_000_000).toFixed(9);

        console.log(`✅ Balance found (fallback): ${formattedBalance} cOBX`);

        return res.json({
          balance: balance,
          formattedBalance: formattedBalance,
          accountExists: true,
          account: playerCOBXAccount.toBase58(),
          mint: COBX_MINT.toBase58(),
          ...(isDebug && {
            debug: {
              playerPDA: profile.player_pda,
              cobxAccount: playerCOBXAccount.toBase58(),
              userId,
              isWeb3Player
            }
          })
        });
      } catch (fallbackError) {
        console.error('Fallback parsing failed:', fallbackError);
        throw parseError;
      }
    }
  } catch (error: any) {
    console.error('❌ Balance fetch failed:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      error: 'Balance fetch failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/cobx/mint-reward - Mint cOBX rewards (Server-initiated)
// NOTE: This endpoint is for server-initiated rewards (e.g., mines cashout, quest rewards, etc.)
// For OBX deposits, use the /api/cobx/deposit endpoint which handles atomic deposit + mint via program instruction
router.post('/mint-reward', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { amount, signature } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    console.log(`Mint reward request: ${amount} cOBX${signature ? ` for transaction: ${signature}` : ' (test mint)'}`);

    if (!profile.player_pda) {
      return res.status(404).json({
        error: 'Player PDA not found. Please initialize your player account first.'
      });
    }

    const COBX_MINT = getCobxMint();
    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const playerPDA = new PublicKey(profile.player_pda);
    let playerCOBXAccount: PublicKey;

    if (profile.cobx_token_account) {
      playerCOBXAccount = new PublicKey(profile.cobx_token_account);
      console.log('🔍 MINT: Using stored cOBX account:', playerCOBXAccount.toBase58());
    } else {
      console.log('⚠️ MINT: No stored cOBX account, deriving PDA with Web2 seeds');
      const web2IdHash = createWeb2IdHash(userId);
      [playerCOBXAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('player_cobx'), web2IdHash],
        PROGRAM_ID
      );
      console.log('🔍 MINT: Derived cOBX account (Web2 seeds):', playerCOBXAccount.toBase58());
    }

    if (signature) {
      console.log('Verifying OBX transfer transaction...');
      const txInfo = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!txInfo || txInfo.meta?.err) {
        return res.status(400).json({
          error: 'OBX transfer transaction not found or failed'
        });
      }

      console.log('✅ OBX transfer confirmed, minting cOBX...');
    } else {
      console.log('🧪 Test mode: Skipping transaction verification, minting cOBX...');
    }

    const cobxAccountInfo = await connection.getAccountInfo(playerCOBXAccount);
    if (!cobxAccountInfo) {
      console.log('❌ MINT: cOBX account does not exist on-chain.');
      return res.status(400).json({
        error: 'Player cOBX account not initialized. Please contact support.',
        details: 'The player account was not properly initialized with a cOBX token account.'
      });
    }

    const cobxMintInfo = await getMint(connection, COBX_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID as any);
    const cobxDecimals = Number((cobxMintInfo as any).decimals ?? 9);
    const mintAmount = Math.floor(Number(amount) * Math.pow(10, cobxDecimals));
    const mintBN = new BN(mintAmount);

    // @ts-ignore - Anchor type inference issue
    const tx = await program.methods
      .mintCobxReward(mintBN)
      .accounts({
        config: configPDA,
        playerAccount: playerPDA,
        cobxMint: COBX_MINT,
        playerCobxAccount: playerCOBXAccount,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log(`✅ Mint successful: ${tx}`);

    return res.json({
      success: true,
      message: signature
        ? `Successfully minted ${amount} cOBX as deposit reward`
        : `Successfully minted ${amount} cOBX for testing`,
      signature: tx,
      originalTx: signature,
      isTestMint: !signature,
      amounts: {
        obxDeposited: signature ? amount : 0,
        cobxMinted: amount
      }
    });

  } catch (error: any) {
    console.error('❌ Mint failed:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      error: 'Mint failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/cobx/deposit - Generate OBX transfer transaction (Step 1)
router.post('/deposit', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { amount, isWeb3Player } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    console.log(`Deposit request: ${amount} OBX -> cOBX, Web3: ${isWeb3Player}`);

    if (!profile.player_pda) {
      return res.status(400).json({
        error: 'Player account not found. Please initialize your account first.'
      });
    }

    const OBX_MINT = getObxMint();
    const COBX_MINT = getCobxMint();
    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const playerPDA = new PublicKey(profile.player_pda);
    let playerCOBXAccount: PublicKey;

    if (profile.cobx_token_account) {
      playerCOBXAccount = new PublicKey(profile.cobx_token_account);
      console.log('🔍 DEPOSIT: Using stored cOBX account:', playerCOBXAccount.toBase58());
    } else {
      console.log('⚠️ DEPOSIT: No stored cOBX account, falling back to Web2 derivation');
      const web2IdHash = createWeb2IdHash(userId);
      [playerCOBXAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('player_cobx'), web2IdHash],
        PROGRAM_ID
      );
      console.log('🔍 DEPOSIT: Derived cOBX account (Web2 seeds):', playerCOBXAccount.toBase58());
    }

    let userWallet: PublicKey;
    if (profile.wallet_address) {
      userWallet = new PublicKey(profile.wallet_address);
    } else {
      const web2IdHash = createWeb2IdHash(userId);
      userWallet = new PublicKey(web2IdHash);
    }

    const userOBXAccount = getAssociatedTokenAddressSync(
      OBX_MINT,
      userWallet,
      false,
      TOKEN_PROGRAM_ID
    );

    const [vaultOBXAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault')],
      PROGRAM_ID
    );

    console.log('Accounts prepared:');
    console.log(`  Config: ${configPDA.toBase58()}`);
    console.log(`  Player PDA: ${playerPDA.toBase58()}`);
    console.log(`  Player cOBX: ${playerCOBXAccount.toBase58()}`);
    console.log(`  User OBX: ${userOBXAccount.toBase58()}`);
    console.log(`  Vault OBX: ${vaultOBXAccount.toBase58()}`);

    const obxMintInfo = await getMint(connection, OBX_MINT, 'confirmed', TOKEN_PROGRAM_ID as any);
    const obxDecimals = Number((obxMintInfo as any).decimals ?? 6); // OBX has 6 decimals, not 9
    const obxBaseUnits = Math.round(amount * Math.pow(10, obxDecimals));
    const depositAmount = new BN(obxBaseUnits);

    console.log(`OBX decimals: ${obxDecimals} → deposit amount (base units):`, obxBaseUnits);

    // Use the program's depositObx instruction for atomic deposit (transfer + mint in one transaction)
    // The program will convert OBX base units (6 decimals) to cOBX base units (9 decimals) internally
    const depositInstruction = await program.methods
      .depositObx(depositAmount)
      .accounts({
        config: configPDA,
        playerAccount: playerPDA,
        cobxMint: COBX_MINT,
        playerCobxAccount: playerCOBXAccount,
        vaultAccount: vaultOBXAccount,
        playerObxAccount: userOBXAccount,
        player: userWallet,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const timestamp = Date.now();
    const memoText = `OBX Deposit ${amount} at ${timestamp}`;
    console.log(`Adding memo: ${memoText}`);

    const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    const memoInstruction = new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memoText, 'utf-8'),
    });

    const transaction = new Transaction()
      .add(memoInstruction)
      .add(depositInstruction);
    transaction.feePayer = userWallet;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;

    console.log(`Fresh blockhash: ${blockhash.slice(0, 8)}...`);
    console.log(`Last valid block height: ${lastValidBlockHeight}`);
    console.log('🔐 Atomic deposit transaction prepared for client signing (transfer + mint in one transaction)');

    return res.json({
      success: true,
      needsClientSigning: true,
      transactionData: Array.from(transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      })),
      message: `Please sign to deposit ${amount} OBX. cOBX will be minted atomically in the same transaction.`,
      amounts: {
        obxDeposited: amount,
        cobxMinted: amount
      }
    });

  } catch (error: any) {
    console.error('❌ Deposit failed:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      error: 'Deposit failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/cobx/withdraw - Generate withdrawal transaction
router.post('/withdraw', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { amount, isWeb3Player } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    console.log(`Withdraw request: ${amount} cOBX -> OBX, Web3: ${isWeb3Player}`);

    if (!profile.player_pda) {
      return res.status(400).json({
        error: 'Player account not found. Please initialize your account first.'
      });
    }

    if (!profile.wallet_address) {
      return res.status(400).json({
        error: 'Wallet address not found. Cannot withdraw to external wallet.'
      });
    }

    const OBX_MINT = getObxMint();
    const COBX_MINT = getCobxMint();
    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const playerPDA = new PublicKey(profile.player_pda);
    const userWallet = new PublicKey(profile.wallet_address);

    let playerCOBXAccount: PublicKey;
    if (profile.cobx_token_account) {
      playerCOBXAccount = new PublicKey(profile.cobx_token_account);
      console.log('🔍 WITHDRAWAL: Using stored cOBX account:', playerCOBXAccount.toBase58());
    } else {
      console.log('⚠️ WITHDRAWAL: No stored cOBX account, falling back to derivation');
      const web2IdHash = createWeb2IdHash(userId);
      [playerCOBXAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('player_cobx'), web2IdHash],
        PROGRAM_ID
      );
      console.log('🔍 WITHDRAWAL: Derived cOBX account:', playerCOBXAccount.toBase58());
    }

    const userOBXAccount = getAssociatedTokenAddressSync(
      OBX_MINT,
      userWallet,
      false,
      TOKEN_PROGRAM_ID
    );

    const [vaultOBXAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault')],
      PROGRAM_ID
    );

    const userOBXAccountInfo = await connection.getAccountInfo(userOBXAccount);
    if (!userOBXAccountInfo) {
      console.log(`🔧 User OBX ATA not found: ${userOBXAccount.toBase58()}`);
      return res.status(400).json({
        needsATA: true,
        message: 'OBX token account needs to be created first',
        ataAddress: userOBXAccount.toBase58(),
        mint: OBX_MINT.toBase58(),
        owner: userWallet.toBase58(),
        instructions: {
          createATA: {
            programId: TOKEN_PROGRAM_ID.toBase58(),
            accounts: {
              mint: OBX_MINT.toBase58(),
              associatedAccount: userOBXAccount.toBase58(),
              owner: userWallet.toBase58(),
              payer: userWallet.toBase58()
            }
          }
        }
      });
    }

    console.log(`✅ User OBX ATA already exists: ${userOBXAccount.toBase58()}`);

    // Get decimals for both tokens
    const obxMintInfo = await getMint(connection, OBX_MINT, 'confirmed', TOKEN_PROGRAM_ID as any);
    const obxDecimals = Number((obxMintInfo as any).decimals ?? 6);
    const cobxMintInfo = await getMint(connection, COBX_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID as any);
    const cobxDecimals = Number((cobxMintInfo as any).decimals ?? 9);
    
    // Calculate amounts in both base units
    const obxBaseUnits = Math.round(amount * Math.pow(10, obxDecimals));
    const cobxBaseUnits = Math.round(amount * Math.pow(10, cobxDecimals));
    
    // The withdrawObx instruction expects the amount in OBX base units (6 decimals)
    // The program will internally convert this to cOBX base units (9 decimals) for burning
    // by multiplying by 1000 (since cOBX has 3 more decimals than OBX)
    // This ensures both the burn and transfer work correctly
    const withdrawAmount = new BN(obxBaseUnits);

    console.log(`💰 Withdrawal amount: ${amount} cOBX = ${cobxBaseUnits} cOBX base units = ${obxBaseUnits} OBX base units`);
    console.log(`📊 Passing ${obxBaseUnits} OBX base units to withdrawObx instruction (program will convert to ${cobxBaseUnits} cOBX base units for burn)`);

    let web2IdHashToPass: number[] | null = null;
    const profileIsWeb3 = !!profile.wallet_address;
    if (!profileIsWeb3) {
      const web2IdHash = createWeb2IdHash(userId);
      web2IdHashToPass = Array.from(web2IdHash);
    }

    // @ts-ignore - Anchor type inference issue
    const withdrawInstruction = await program.methods
      .withdrawObx(withdrawAmount, web2IdHashToPass)
      .accounts({
        config: configPDA,
        playerAccount: playerPDA,
        cobxMint: COBX_MINT,
        playerCobxAccount: playerCOBXAccount,
        vaultAccount: vaultOBXAccount,
        playerObxAccount: userOBXAccount,
        authority: serverKeypair.publicKey,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    // Add memo instruction to clarify withdrawal amount (similar to deposit)
    const timestamp = Date.now();
    const memoText = `cOBX Withdrawal ${amount} at ${timestamp}`;
    console.log(`Adding memo: ${memoText}`);

    const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    const memoInstruction = new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memoText, 'utf-8'),
    });

    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new Transaction()
      .add(memoInstruction)
      .add(withdrawInstruction);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userWallet;

    transaction.partialSign(serverKeypair);

    console.log(`🔐 Transaction prepared: Server signed as authority, user will pay fees`);

    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });

    console.log(`✅ Withdrawal transaction prepared for client-side signing`);

    return res.json({
      needsClientSigning: true,
      message: `Withdrawal transaction ready - you'll pay the network fees`,
      transactionData: Array.from(serializedTransaction),
      amount: amount,
      estimatedFee: '~0.0001 SOL'
    });

  } catch (error: any) {
    console.error('❌ Withdraw failed:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      error: 'Withdraw failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/cobx/mines-bet - Burn cOBX for mines bet
router.post('/mines-bet', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid bet amount is required' });
    }

    console.log(`Mines bet request: ${amount} cOBX`);

    if (!profile.player_pda) {
      return res.status(404).json({
        error: 'Player PDA not found. Please initialize your player account first.'
      });
    }

    const COBX_MINT = getCobxMint();
    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const playerPDA = new PublicKey(profile.player_pda);
    let playerCOBXAccount: PublicKey;

    if (profile.cobx_token_account) {
      playerCOBXAccount = new PublicKey(profile.cobx_token_account);
      console.log('🎰 MINES BET: Using stored cOBX account:', playerCOBXAccount.toBase58());
    } else {
      return res.status(404).json({
        error: 'cOBX token account not found. Please create a token account first.'
      });
    }

    try {
      const tokenAcc = await getAccount(
        connection,
        playerCOBXAccount,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      );

      if (!tokenAcc) {
        return res.status(404).json({
          error: 'cOBX account not found on blockchain'
        });
      }

      const mintInfo = await getMint(connection, COBX_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID as any);
      const decimals = Number((mintInfo as any).decimals ?? 9);
      const currentBalance = Number(tokenAcc.amount) / Math.pow(10, decimals);

      if (currentBalance < amount) {
        return res.status(400).json({
          error: `Insufficient balance. Available: ${currentBalance.toFixed(2)} cOBX, Required: ${amount} cOBX`
        });
      }

      console.log(`✅ Balance check passed: ${currentBalance} cOBX available, betting ${amount} cOBX`);

      if (!tokenAcc.owner.equals(serverKeypair.publicKey)) {
        return res.status(400).json({
          error: 'Your cOBX balance is wallet-owned. Move funds to game balance first via Character Slots → Deposit.'
        });
      }
    } catch (error) {
      console.error('Failed to check balance:', error);
      return res.status(500).json({
        error: 'Failed to verify account balance'
      });
    }

    const mintInfo = await getMint(connection, COBX_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID as any);
    const decimals = Number((mintInfo as any).decimals ?? 9);
    const burnAmount = Math.floor(Number(amount) * Math.pow(10, decimals));

    console.log(`🔥 Burning ${amount} cOBX (${burnAmount} lamports) for mines bet...`);

    const burnInstruction = createBurnInstruction(
      playerCOBXAccount,
      COBX_MINT,
      serverKeypair.publicKey,
      burnAmount,
      [],
      TOKEN_2022_PROGRAM_ID
    );

    const transaction = new Transaction().add(burnInstruction);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = serverKeypair.publicKey;

    transaction.sign(serverKeypair);
    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    console.log(`✅ Mines bet successful: ${signature}`);

    console.log(`🎰 MINES BET PLACED:`, {
      userId,
      amount,
      signature,
      timestamp: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: `Successfully placed bet of ${amount} cOBX`,
      signature,
      betAmount: amount
    });

  } catch (error: any) {
    console.error('❌ Mines bet failed:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      error: 'Bet failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/cobx/mines-cashout - Mint cOBX rewards for mines win
router.post('/mines-cashout', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { winAmount, multiplier, revealedTiles } = req.body;

    if (!winAmount || winAmount <= 0) {
      return res.status(400).json({ error: 'Valid win amount is required' });
    }

    console.log(`Mines cashout request: ${winAmount} cOBX (${multiplier}x multiplier, ${revealedTiles} tiles revealed)`);

    if (!profile.player_pda) {
      return res.status(404).json({
        error: 'Player PDA not found. Please initialize your player account first.'
      });
    }

    const COBX_MINT = getCobxMint();
    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const playerPDA = new PublicKey(profile.player_pda);
    let playerCOBXAccount: PublicKey;

    if (profile.cobx_token_account) {
      playerCOBXAccount = new PublicKey(profile.cobx_token_account);
      console.log('🎰 MINES CASHOUT: Using stored cOBX account:', playerCOBXAccount.toBase58());
    } else {
      return res.status(404).json({
        error: 'cOBX token account not found. Please create a token account first.'
      });
    }

    const mintInfo = await getMint(connection, COBX_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID as any);
    const decimals = Number((mintInfo as any).decimals ?? 9);
    const mintAmount = Math.floor(Number(winAmount) * Math.pow(10, decimals));
    const mintBN = new BN(mintAmount);

    console.log(`💰 Minting ${winAmount} cOBX (${mintAmount} lamports) for mines win...`);

    // @ts-ignore - Type instantiation is excessively deep (Anchor type inference limitation)
    const tx = await (program.methods as any)
      .mintCobxReward(mintBN)
      .accounts({
        config: configPDA,
        playerAccount: playerPDA,
        cobxMint: COBX_MINT,
        playerCobxAccount: playerCOBXAccount,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log(`✅ Mines cashout successful: ${tx}`);

    console.log(`🎰 MINES CASHOUT COMPLETED:`, {
      userId,
      winAmount,
      multiplier,
      revealedTiles,
      signature: tx,
      timestamp: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: `Successfully cashed out ${winAmount.toFixed(2)} cOBX`,
      signature: tx,
      winAmount,
      multiplier,
      revealedTiles
    });

  } catch (error: any) {
    console.error('❌ Mines cashout failed:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      error: 'Cashout failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/cobx/create-account - Create cOBX token account
router.post('/create-account', async (req: any, res: any) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    console.log(`🔧 COBX: Creating cOBX token account for wallet: ${walletAddress}`);

    const client = getPgClient();
    let profile: any = null;
    try {
      await client.connect();
      const result = await client.query(
        'SELECT * FROM profiles WHERE wallet_address = $1',
        [walletAddress]
      );
      profile = result.rows[0] || null;
    } catch (error) {
      console.error('❌ COBX: Error fetching profile:', error);
      return res.status(404).json({ error: 'Profile not found' });
    } finally {
      await client.end();
    }

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (profile.cobx_token_account) {
      console.log(`✅ COBX: cOBX account already exists: ${profile.cobx_token_account}`);
      return res.json({
        success: true,
        cobxTokenAccount: profile.cobx_token_account,
        message: 'cOBX account already exists'
      });
    }

    const COBX_MINT = getCobxMint();
    const walletPubkey = new PublicKey(walletAddress);

    const cobxTokenAccount = getAssociatedTokenAddressSync(
      COBX_MINT,
      walletPubkey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    console.log(`🔧 COBX: Creating associated token account: ${cobxTokenAccount.toBase58()}`);

    const createAccountInstruction = createAssociatedTokenAccountInstruction(
      walletPubkey,
      cobxTokenAccount,
      walletPubkey,
      COBX_MINT
    );

    const accountInfo = await connection.getAccountInfo(cobxTokenAccount);

    if (accountInfo) {
      console.log(`✅ COBX: Account already exists on-chain: ${cobxTokenAccount.toBase58()}`);

      const updateClient = getPgClient();
      try {
        await updateClient.connect();
        await updateClient.query(
          'UPDATE profiles SET cobx_token_account = $1 WHERE wallet_address = $2',
          [cobxTokenAccount.toBase58(), walletAddress]
        );
      } catch (updateError) {
        console.error('❌ COBX: Error updating profile with cOBX account:', updateError);
        return res.status(500).json({ error: 'Failed to update profile' });
      } finally {
        await updateClient.end();
      }

      return res.json({
        success: true,
        cobxTokenAccount: cobxTokenAccount.toBase58(),
        message: 'cOBX account already exists'
      });
    }

    const transaction = new Transaction().add(createAccountInstruction);
    transaction.feePayer = walletPubkey;

    const updateClient = getPgClient();
    try {
      await updateClient.connect();
      await updateClient.query(
        'UPDATE profiles SET cobx_token_account = $1 WHERE wallet_address = $2',
        [cobxTokenAccount.toBase58(), walletAddress]
      );
    } catch (updateError) {
      console.error('❌ COBX: Error updating profile with cOBX account:', updateError);
      return res.status(500).json({ error: 'Failed to update profile' });
    } finally {
      await updateClient.end();
    }

    console.log(`✅ COBX: Successfully created cOBX account: ${cobxTokenAccount.toBase58()}`);

    return res.json({
      success: true,
      cobxTokenAccount: cobxTokenAccount.toBase58(),
      transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
      message: 'cOBX account created successfully'
    });

  } catch (error: any) {
    console.error('❌ COBX: Error creating cOBX account:', error);
    return res.status(500).json({
      error: 'Failed to create cOBX account',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/cobx/pda-balance - Query balance for specific PDA
router.post('/pda-balance', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { userId: requestedUserId } = req.body;
    
    if (!requestedUserId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Verify the user is requesting their own data
    if (userId !== requestedUserId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    console.log('🔍 PDA Balance API: Fetching cOBX for user:', userId);

    const COBX_MINT = getCobxMint();

    if (!profile || !profile.player_pda) {
      console.error('❌ PDA Balance API: Player PDA not found for user:', userId);
      return res.status(404).json({
        error: 'Player PDA not found. Please initialize your player account first.'
      });
    }

    const playerPDA = new PublicKey(profile.player_pda);

    // Use stored cOBX token account if available, otherwise derive
    let cobxAccount: PublicKey;
    
    if (profile.cobx_token_account) {
      cobxAccount = new PublicKey(profile.cobx_token_account);
      console.log(`🔍 PDA Balance API: Using stored cOBX account: ${cobxAccount.toBase58()}`);
    } else {
      console.log('⚠️ PDA Balance API: No stored cOBX account, falling back to derivation');
      const web2IdHash = createWeb2IdHash(userId);
      
      [cobxAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('player_cobx'), web2IdHash],
        PROGRAM_ID
      );
      console.log(`🔍 PDA Balance API: Derived cOBX account: ${cobxAccount.toBase58()}`);
    }

    console.log(`🔍 PDA Balance API: Player PDA: ${playerPDA.toBase58()}`);
    console.log(`🔍 PDA Balance API: Using cOBX Account: ${cobxAccount.toBase58()}`);

    let pdaBalance = 0;

    try {
      const accountInfo = await connection.getAccountInfo(cobxAccount);
      
      if (accountInfo && accountInfo.data) {
        // Parse token account data manually
        if (accountInfo.data.length < 72) {
          throw new Error('Invalid token account data length');
        }
        
        const amount = accountInfo.data.readBigUInt64LE(64);
        const decimals = 9; // cOBX has 9 decimals
        pdaBalance = parseFloat(amount.toString()) / Math.pow(10, decimals);
        console.log(`✅ PDA Balance API: Found cOBX balance: ${pdaBalance}`);
      } else {
        console.log('ℹ️ PDA Balance API: cOBX token account not found (balance: 0)');
      }
    } catch (error) {
      console.error('❌ PDA Balance API: Error fetching token account:', error);
      // Don't fail the request, just return 0 balance
    }

    return res.json({
      success: true,
      pdaBalance,
      playerPDA: playerPDA.toBase58(),
      cobxTokenAccount: cobxAccount.toBase58()
    });

  } catch (error: any) {
    console.error('❌ PDA Balance API Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch PDA balance',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
