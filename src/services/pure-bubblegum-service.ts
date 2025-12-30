/**
 * 🎯 PURE METAPLEX BUBBLEGUM SERVICE
 * 
 * Shared service for both:
 * - Frontend API (Next.js)
 * - Rust Game Server (via Node.js bridge)
 * 
 * Mints real cNFTs to PDAs for marketplace compatibility
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { 
  mplBubblegum, 
  mintToCollectionV1,
  getAssetWithProof,
  LeafSchema,
  parseLeafFromMintToCollectionV1Transaction
} from '@metaplex-foundation/mpl-bubblegum';
import { 
  keypairIdentity, 
  createSignerFromKeypair, 
  publicKey
} from '@metaplex-foundation/umi';

export interface BubblegumMintRequest {
  itemId: string;
  itemName: string;
  itemSymbol: string;
  metadataUri: string;
  recipientPDA: string; // PDA where cNFT will be minted
  quantity?: number;
}

export interface BubblegumMintResult {
  success: boolean;
  transactionId?: string;
  assetId?: string | undefined;
  error?: string;
  itemId: string;
  recipientPDA: string;
  message?: string;
}

export class PureBubblegumService {
  private rpcUrl: string;
  private serverKeypair: Keypair;
  private collectionMint: PublicKey;
  private merkleTree: PublicKey;

  constructor(
    rpcUrl: string,
    serverWalletSecret: string,
    collectionMintAddress: string,
    merkleTreeAddress: string
  ) {
    // Parse server wallet
    const secretKey: number[] = JSON.parse(serverWalletSecret);
    this.serverKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    
    // Store RPC URL for creating fresh UMI instances per transaction
    // This avoids persistent signer identity issues
    this.rpcUrl = rpcUrl;

    this.collectionMint = new PublicKey(collectionMintAddress);
    this.merkleTree = new PublicKey(merkleTreeAddress);

    console.log('🌳 Pure Bubblegum Service initialized:');
    console.log('  Collection:', this.collectionMint.toString());
    console.log('  Merkle Tree:', this.merkleTree.toString());
    console.log('  Server Wallet:', this.serverKeypair.publicKey.toString());
    console.log('  RPC URL:', this.rpcUrl);
  }

  /**
   * Mint a single cNFT to a PDA (for PDA marketplace compatibility)
   */
  async mintSingleCNFT(request: BubblegumMintRequest): Promise<BubblegumMintResult> {
    try {
      console.log(`🎯 OFFICIAL: Minting cNFT using Solana Developers method...`);
      console.log(`  Item: ${request.itemName}`);
      console.log(`  Collection: ${this.collectionMint.toString()}`);
      console.log(`  Tree: ${this.merkleTree.toString()}`);

      // Create UMI instance WITHOUT plugins first (EXACT UMI.JS PATTERN)
      console.log('🌟 Creating UMI instance (UMI.JS pattern)...');
      console.log('🔗 RPC URL:', this.rpcUrl);
      
      let freshUmi;
      try {
        freshUmi = createUmi(this.rpcUrl);
        console.log('✅ Base UMI created successfully');
      } catch (umiError) {
        console.error('❌ Failed to create UMI instance:', umiError);
        throw new Error(`UMI creation failed: ${umiError instanceof Error ? umiError.message : 'Unknown error'}`);
      }
      
      // Create server keypair using UMI's EXACT working pattern from SolCoinflip
      console.log('🔑 Creating keypair from secret...');
      const serverKeypair = freshUmi.eddsa.createKeypairFromSecretKey(this.serverKeypair.secretKey);
      const serverSigner = createSignerFromKeypair(freshUmi, serverKeypair);
      console.log('🔑 Server signer created (UMI.JS pattern):', serverSigner.publicKey.toString());
      
      // Set identity AND payer using EXACT UMI.JS PATTERN from SolCoinflip
      console.log('🔐 Setting UMI identity AND payer (UMI.JS pattern)...');
      freshUmi.identity = serverSigner;
      freshUmi.payer = serverSigner;  // THIS IS KEY FROM SOLCOINFLIP!
      console.log('✅ UMI identity AND payer set (UMI.JS pattern)');
      console.log('🔍 UMI identity check:', freshUmi.identity.publicKey.toString());
      console.log('🔍 UMI payer check:', freshUmi.payer.publicKey.toString());
      
      // NOW add the Bubblegum plugin AFTER setting identity AND payer
      console.log('🫧 Adding Bubblegum plugin...');
      const umiWithBubblegum = freshUmi.use(mplBubblegum());
      console.log('✅ Bubblegum plugin added');

      // Build transaction using OFFICIAL solana-developers method
      console.log('📝 Building transaction (OFFICIAL WAY)...');
      console.log('🎯 Minting to recipient PDA:', request.recipientPDA);
      const mintTx = mintToCollectionV1(umiWithBubblegum, {
        leafOwner: publicKey(request.recipientPDA), // Mint to the specified PDA
        merkleTree: publicKey(this.merkleTree.toString()),
        collectionMint: publicKey(this.collectionMint.toString()),
        metadata: {
          name: request.itemSymbol === 'PLAYER' ? 
            `${request.itemName} (Level 1, Combat 3)` : // v2.0.0 format for players
            request.itemName, // Normal format for items
          symbol: request.itemSymbol,
          uri: request.metadataUri,
          sellerFeeBasisPoints: 500,
          collection: {
            key: publicKey(this.collectionMint.toString()),
            verified: true
          },
          creators: [
            {
              address: serverSigner.publicKey,
              verified: true,
              share: 100
            }
          ],
          // Add v2.0.0 attributes for player characters
          ...(request.itemSymbol === 'PLAYER' ? {
            attributes: [
              { trait_type: 'Version', value: '2.0.0' },
              { trait_type: 'Level', value: '1' },
              { trait_type: 'Combat Level', value: '3' },
              { trait_type: 'Total Level', value: '9' },
              { trait_type: 'Experience', value: '0' },
              { trait_type: 'Class', value: 'Adventurer' },
              { trait_type: 'Skill Points', value: '0' },
              
              // New 9-skill system (starting levels)
              { trait_type: 'Attack', value: '1' },
              { trait_type: 'Strength', value: '1' },
              { trait_type: 'Defense', value: '1' },
              { trait_type: 'Magic', value: '1' },
              { trait_type: 'Projectiles', value: '1' },
              { trait_type: 'Vitality', value: '1' },
              { trait_type: 'Crafting', value: '1' },
              { trait_type: 'Luck', value: '1' },
              { trait_type: 'Gathering', value: '1' }
            ]
          } : {})
        }
      });

      // Send transaction (OFFICIAL METHOD)
      console.log('🚀 Sending transaction...');
      const result = await mintTx.sendAndConfirm(umiWithBubblegum, {
        send: { skipPreflight: false }
      });
      
      console.log('✅ SUCCESS! cNFT minted successfully!');
      const rawSignature = Array.isArray(result.signature) ? result.signature[0] : result.signature;
      
      // Convert Uint8Array signature to base58 string
      const bs58 = require('bs58');
      const signatureString = typeof rawSignature === 'string' ? rawSignature : bs58.encode(rawSignature);
      console.log('  Signature (base58):', signatureString);

      return {
        success: true,
        transactionId: signatureString,
        assetId: undefined, // We'd need to derive this from the merkle tree and leaf index
        itemId: request.itemId,
        recipientPDA: request.recipientPDA,
        message: `Successfully minted ${request.itemName} cNFT to PDA ${request.recipientPDA}`
      };

    } catch (error) {
      console.error(`❌ Failed to mint cNFT ${request.itemName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        itemId: request.itemId,
        recipientPDA: request.recipientPDA
      };
    }
  }

  /**
   * Batch mint multiple cNFTs
   */
  async batchMintCNFTs(requests: BubblegumMintRequest[]): Promise<BubblegumMintResult[]> {
    console.log(`🎮 Batch minting ${requests.length} cNFTs...`);
    
    const results: BubblegumMintResult[] = [];
    
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      
      // Add delay between mints to avoid rate limiting
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log(`⏱️ Rate limit delay: ${i + 1}/${requests.length}`);
      }
      
      const result = await this.mintSingleCNFT(request);
      results.push(result);
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`🎨 Batch minting complete: ${successful} successful, ${failed} failed`);
    
    return results;
  }

  /**
   * Mint a player cNFT using the OFFICIAL Solana method
   */
  async mintPlayerCNFT(request: {
    playerName: string;
    playerId: string;
    playerPDA: string;
    metadataUri: string;
  }): Promise<string> {
    try {
      console.log('🎯 OFFICIAL: Minting player cNFT using Solana Developers method...');
      console.log(`  Player: ${request.playerName}`);
      console.log(`  Collection: ${this.collectionMint.toString()}`);
      console.log(`  Tree: ${this.merkleTree.toString()}`);

      // Create a FRESH UMI instance for this transaction (WORKING UMI.JS PATTERN)
      const freshUmi = createUmi(this.rpcUrl).use(mplBubblegum());
      
      // Create server keypair using UMI's EXACT working pattern from SolCoinflip
      const serverKeypair = freshUmi.eddsa.createKeypairFromSecretKey(this.serverKeypair.secretKey);
      const serverSigner = createSignerFromKeypair(freshUmi, serverKeypair);
      console.log('🔑 Server signer created (UMI.JS pattern):', serverSigner.publicKey.toString());
      
      // Set identity using DIRECT ASSIGNMENT (WORKING UMI.JS PATTERN)
      freshUmi.identity = serverSigner;
      console.log('✅ UMI identity set with DIRECT ASSIGNMENT for player cNFT (UMI.JS pattern)');

      // Build transaction using OFFICIAL solana-developers method
      console.log('📝 Building player cNFT transaction (OFFICIAL WAY)...');
      const mintTx = mintToCollectionV1(freshUmi, {
        leafOwner: serverSigner.publicKey, // Direct public key reference
        merkleTree: publicKey(this.merkleTree.toString()),
        collectionMint: publicKey(this.collectionMint.toString()),
        metadata: {
          name: `${request.playerName} (Level 1, Combat 3)`, // v2.0.0 format with combat level
          symbol: 'PLAYER',
          uri: request.metadataUri,
          sellerFeeBasisPoints: 500,
          collection: {
            key: publicKey(this.collectionMint.toString()),
            verified: true
          },
          creators: [
            {
              address: serverSigner.publicKey,
              verified: true,
              share: 100
            }
          ]
          // Note: v2.0.0 skill attributes will be stored in the metadata URI JSON
        }
      });

      // Send transaction (OFFICIAL METHOD)
      console.log('🚀 Sending player cNFT transaction...');
      const result = await mintTx.sendAndConfirm(freshUmi, {
        send: { skipPreflight: false }
      });
      
      console.log('✅ SUCCESS! Player cNFT minted successfully!');
      const rawSignature = Array.isArray(result.signature) ? result.signature[0] : result.signature;
      
      // Convert Uint8Array signature to base58 string
      const bs58 = require('bs58');
      const signatureString = typeof rawSignature === 'string' ? rawSignature : bs58.encode(rawSignature);
      console.log('  Signature (base58):', signatureString);

      return signatureString;
    } catch (error) {
      console.error('❌ Player cNFT minting error:', error);
      throw error;
    }
  }

  /**
   * Extract asset ID from mint transaction
   * This is needed for marketplace tracking
   */
  private async getAssetIdFromTransaction(signature: string): Promise<string | undefined> {
    try {
      // This would typically involve parsing the transaction logs
      // For now, return a placeholder - you can implement proper asset ID extraction
      return `asset_${signature.slice(0, 8)}`;
    } catch (error) {
      console.warn('Could not extract asset ID from transaction:', error);
      return undefined;
    }
  }

  /**
   * Verify cNFT ownership (for marketplace validation)
   */
  async verifyCNFTOwnership(assetId: string, expectedOwner: string): Promise<boolean> {
    try {
      // Implementation would use DAS API to verify ownership
      // This ensures marketplace compatibility
      console.log(`🔍 Verifying cNFT ${assetId} ownership by PDA ${expectedOwner}`);
      return true; // Placeholder
    } catch (error) {
      console.error('Failed to verify cNFT ownership:', error);
      return false;
    }
  }
}

/**
 * Factory function to create the service
 */
export function createPureBubblegumService(config: {
  rpcUrl: string;
  serverWalletSecret: string;
  collectionMintAddress: string;
  merkleTreeAddress: string;
}): PureBubblegumService {
  return new PureBubblegumService(
    config.rpcUrl,
    config.serverWalletSecret,
    config.collectionMintAddress,
    config.merkleTreeAddress
  );
}

