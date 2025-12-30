import { Router } from 'express';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { program, connection, serverKeypair, PROGRAM_ID, getCobxMint, createWeb2IdHash } from '../config/anchor';
import { supabase } from '../config/database';
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

// POST /api/marketplace/list-item - List item on marketplace
router.post('/list-item', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { assetId, treeId, price, category, rarity, itemName } = req.body;

    if (!assetId || !treeId || !price || !category || !rarity || !itemName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    if (price <= 0) {
      return res.status(400).json({ error: 'Price must be greater than 0' });
    }

    if (itemName.length > 50) {
      return res.status(400).json({ error: 'Item name must be 50 characters or less' });
    }

    if (!profile.player_pda) {
      return res.status(404).json({ error: 'Player account not found' });
    }

    const isWeb3User = !!profile.wallet_address;
    const sellerPubkey = isWeb3User 
      ? new PublicKey(profile.wallet_address)
      : serverKeypair.publicKey;

    const playerPDA = new PublicKey(profile.player_pda);

    const categoryMap: { [key: string]: any } = {
      'weapon': { weapon: {} },
      'armor': { armor: {} },
      'consumable': { consumable: {} },
      'material': { material: {} },
      'equipment': { equipment: {} },
      'misc': { misc: {} }
    };

    const rarityMap: { [key: string]: any } = {
      'common': { common: {} },
      'uncommon': { uncommon: {} },
      'rare': { rare: {} },
      'epic': { epic: {} },
      'legendary': { legendary: {} },
      'mythic': { mythic: {} }
    };

    // Create listing PDA - matching frontend derivation
    const [listingPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('listing'),
        new PublicKey(assetId).toBuffer(),
      ],
      PROGRAM_ID
    );

    const [marketplaceStatsPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('marketplace_stats')],
      PROGRAM_ID
    );

    console.log('Listing item on marketplace:', {
      assetId,
      price,
      category,
      rarity,
      itemName,
      seller: sellerPubkey.toBase58(),
      playerPDA: playerPDA.toBase58(),
      listingPDA: listingPDA.toBase58()
    });

    const tx = await program.methods
      .listItem(
        new PublicKey(assetId),
        new PublicKey(treeId),
        price,
        categoryMap[category] || categoryMap['misc'],
        rarityMap[rarity] || rarityMap['common'],
        itemName
      )
      .accounts({
        listing: listingPDA,
        seller: sellerPubkey,
        playerAccount: playerPDA,
        marketplaceStats: marketplaceStatsPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log('Item listed successfully. Transaction:', tx);

    return res.json({
      success: true,
      transactionId: tx,
      listingPDA: listingPDA.toBase58(),
      price,
      category,
      rarity,
      itemName
    });

  } catch (error: any) {
    console.error('Error listing item:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      error: error.message || 'Failed to list item'
    });
  }
});

// POST /api/marketplace/buy-item - Buy item from marketplace
router.post('/buy-item', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { listingPDA } = req.body;

    if (!listingPDA) {
      return res.status(400).json({ error: 'Listing PDA is required' });
    }

    if (!profile.player_pda) {
      return res.status(404).json({ error: 'Player account not found' });
    }

    const COBX_MINT = getCobxMint();
    const isWeb3User = !!profile.wallet_address;
    const buyerPubkey = isWeb3User 
      ? new PublicKey(profile.wallet_address)
      : serverKeypair.publicKey;

    const buyerPlayerPDA = new PublicKey(profile.player_pda);
    const listingPubkey = new PublicKey(listingPDA);

    const listingAccount = await (program.account as any).listing.fetch(listingPubkey);
    
    if (!listingAccount.isActive) {
      return res.status(400).json({ error: 'This item is no longer available' });
    }

    if (listingAccount.seller.equals(buyerPubkey)) {
      return res.status(400).json({ error: 'Cannot buy your own item' });
    }

    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );

    const [marketplaceStatsPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('marketplace_stats')],
      PROGRAM_ID
    );

    const web2IdHash = createWeb2IdHash(userId);
    
    let buyerCobxAccount: PublicKey;
    if (isWeb3User) {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('player_cobx'), buyerPubkey.toBuffer()],
        PROGRAM_ID
      );
      buyerCobxAccount = pda;
    } else {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('player_cobx'), web2IdHash],
        PROGRAM_ID
      );
      buyerCobxAccount = pda;
    }

    // Get seller's cOBX account
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('id, wallet_address, cobx_token_account')
      .eq('player_pda', listingAccount.sellerPda.toBase58())
      .single();

    let sellerCobxAccount: PublicKey;
    if (sellerProfile?.cobx_token_account) {
      sellerCobxAccount = new PublicKey(sellerProfile.cobx_token_account);
    } else if (sellerProfile?.wallet_address) {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('player_cobx'), new PublicKey(sellerProfile.wallet_address).toBuffer()],
        PROGRAM_ID
      );
      sellerCobxAccount = pda;
    } else {
      const sellerWeb2Hash = createWeb2IdHash(sellerProfile?.id || 'unknown');
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('player_cobx'), sellerWeb2Hash],
        PROGRAM_ID
      );
      sellerCobxAccount = pda;
    }

    // Treasury cOBX account (from marketplace stats)
    const marketplaceStats = await (program.account as any).marketplaceStats.fetch(marketplaceStatsPDA);
    const treasuryCobxAccount = marketplaceStats.treasury || serverKeypair.publicKey;

    console.log('Buying item from marketplace:', {
      listingPDA: listingPDA,
      buyer: buyerPubkey.toBase58(),
      seller: listingAccount.seller.toBase58(),
      price: listingAccount.price.toString(),
      buyerCobxAccount: buyerCobxAccount.toBase58(),
      sellerCobxAccount: sellerCobxAccount.toBase58(),
    });

    const tx = await program.methods
      .buyItem()
      .accounts({
        config: configPDA,
        listing: listingPubkey,
        marketplaceStats: marketplaceStatsPDA,
        buyerPlayerAccount: buyerPlayerPDA,
        buyerCobxAccount: buyerCobxAccount,
        sellerCobxAccount: sellerCobxAccount,
        treasuryCobxAccount: treasuryCobxAccount,
        buyer: buyerPubkey,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log('Item purchased successfully. Transaction:', tx);

    return res.json({
      success: true,
      transactionId: tx,
      itemName: listingAccount.itemName,
      price: listingAccount.price.toString(),
      seller: listingAccount.seller.toBase58()
    });

  } catch (error: any) {
    console.error('Error buying item:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      error: error.message || 'Failed to buy item'
    });
  }
});

// GET /api/marketplace/listings - Get marketplace listings
router.get('/listings', async (req: any, res: any) => {
  try {
    const category = req.query.category as string;
    const rarity = req.query.rarity as string;
    const maxPrice = req.query.maxPrice as string;
    const minPrice = req.query.minPrice as string;

    const listings = await (program.account as any).listing.all([
      {
        memcmp: {
          offset: 8 + 32 + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 1 + 50 + 1, // Skip to is_active field (approximate)
          bytes: Buffer.from([1]), // is_active = true
        },
      },
    ]);

    const processedListings = listings
      .map((listing: any) => {
        const account = listing.account as any;
        return {
          pda: listing.publicKey.toBase58(),
          seller: account.seller.toBase58(),
          sellerPda: account.sellerPda.toBase58(),
          assetId: account.assetId.toBase58(),
          treeId: account.treeId.toBase58(),
          price: account.price.toString(),
          paymentType: 'COBX',
          createdAt: account.createdAt.toNumber(),
          category: Object.keys(account.category)[0],
          rarity: Object.keys(account.rarity)[0],
          itemName: account.itemName,
          isActive: account.isActive,
        };
      })
      .filter((listing: any) => {
        if (category && category !== 'all' && listing.category !== category) {
          return false;
        }
        
        if (rarity && rarity !== 'all' && listing.rarity !== rarity) {
          return false;
        }
        
        const price = parseFloat(listing.price);
        if (minPrice && price < parseFloat(minPrice)) {
          return false;
        }
        
        if (maxPrice && price > parseFloat(maxPrice)) {
          return false;
        }
        
        return listing.isActive;
      })
      .sort((a: any, b: any) => b.createdAt - a.createdAt);

    return res.json({
      success: true,
      listings: processedListings,
      total: processedListings.length,
    });

  } catch (error: any) {
    console.error('Error fetching marketplace listings:', error);
    return res.status(500).json({
      error: error.message || 'Failed to fetch listings'
    });
  }
});

// POST /api/marketplace/cancel-listing - Cancel a listing
router.post('/cancel-listing', async (req: any, res: any) => {
  try {
    const { userId, profile } = await authenticateUser(req);
    const { listingPDA } = req.body;

    if (!listingPDA) {
      return res.status(400).json({ error: 'Listing PDA is required' });
    }

    if (!profile.player_pda) {
      return res.status(404).json({ error: 'Player account not found' });
    }

    const isWeb3User = !!profile.wallet_address;
    const sellerPubkey = isWeb3User 
      ? new PublicKey(profile.wallet_address)
      : serverKeypair.publicKey;

    const listingPubkey = new PublicKey(listingPDA);

    const listingAccount = await (program.account as any).listing.fetch(listingPubkey);
    
    if (!listingAccount.seller.equals(sellerPubkey)) {
      return res.status(403).json({ error: 'Unauthorized - you are not the seller' });
    }

    if (!listingAccount.isActive) {
      return res.status(400).json({ error: 'Listing is already inactive' });
    }

    const tx = await program.methods
      .cancelListing()
      .accounts({
        listing: listingPubkey,
        seller: sellerPubkey,
      })
      .rpc();

    console.log('Listing cancelled successfully. Transaction:', tx);

    return res.json({
      success: true,
      transactionId: tx,
      listingPDA: listingPDA
    });

  } catch (error: any) {
    console.error('Error cancelling listing:', error);
    return res.status(error.message?.includes('Unauthorized') ? 401 : 500).json({
      error: error.message || 'Failed to cancel listing'
    });
  }
});

export default router;
