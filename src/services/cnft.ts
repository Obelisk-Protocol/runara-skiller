import {
  getAssetWithProof,
  mintToCollectionV1,
  updateMetadata,
  transfer,
  burn,
  delegate,
  mplBubblegum,
  findLeafAssetIdPda,
  parseLeafFromMintToCollectionV1Transaction
} from '@metaplex-foundation/mpl-bubblegum';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { 
  publicKey, 
  some, 
  none,
  generateSigner,
  signerIdentity,
  createSignerFromKeypair
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Connection, PublicKey } from '@solana/web3.js';
import { umi, serverSigner, COLLECTION_MINT, MERKLE_TREE, getDasUrl, getRpcUrl } from '../config/solana';
import { CharacterStats, Character } from '../types/character';
// Removed Arweave - using Supabase Storage and database instead
import { NftColumns } from './database';
import { generateCharacterImage, cropImageToPfpStyle } from './character-image-generator';
import { getDefaultCustomization } from '../types/character-customization';
import { saveCharacterImage } from './image-storage';
// Supabase removed - using PostgreSQL directly
import { pgQuery, pgQuerySingle } from '../utils/pg-helper';

// Resolve default character image URL
function resolveDefaultCharacterImageUrl(seedName?: string): string {
  try {
    console.log('[IMG] Env snapshot', {
      has_CHARACTER_DEFAULT_IMAGE_URL: Boolean(process.env.CHARACTER_DEFAULT_IMAGE_URL),
      FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL || undefined,
      NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || undefined,
    })
  } catch {}
  const explicit = process.env.CHARACTER_DEFAULT_IMAGE_URL || process.env.NEXT_PUBLIC_CHARACTER_DEFAULT_IMAGE_URL
  if (explicit && explicit.startsWith('http')) {
    console.log('[IMG] Using CHARACTER_DEFAULT_IMAGE_URL', explicit)
    return explicit
  }
  const front = (process.env.FRONTEND_BASE_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || '').replace(/\/$/, '')
  if (front) {
    const url = `${front}/images/characternft/charsillo.png`
    console.log('[IMG] Using FRONTEND_BASE_URL derived url', { front, url })
    return url
  }
  // Fallback to deterministic avatar
  const name = seedName || 'Adventurer'
  const fallback = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}&backgroundColor=b6e3f4`
  console.log('[IMG] Using Dicebear fallback', fallback)
  return fallback
}

// Generate default character stats with 18 skills (no equipment, achievements, stats, or character class)
export function generateDefaultCharacterStats(name: string): CharacterStats {
  return {
    name,
    combatLevel: 1, // Default combat level (average of Attack, Strength, Defense, Magic, Projectiles, Vitality = (1+1+1+1+1+1)/6 = 1)
    totalLevel: 18, // Default total level (all 18 skills at 1)
    version: '2.0.0',
    experience: 0,
    skills: {
      // Combat Skills
      attack: { level: 1, experience: 0 },
      strength: { level: 1, experience: 0 },
      defense: { level: 1, experience: 0 },
      magic: { level: 1, experience: 0 },
      projectiles: { level: 1, experience: 0 },
      vitality: { level: 1, experience: 0 },
      // Gathering Skills
      mining: { level: 1, experience: 0 },
      woodcutting: { level: 1, experience: 0 },
      fishing: { level: 1, experience: 0 },
      hunting: { level: 1, experience: 0 },
      // Crafting Skills
      smithing: { level: 1, experience: 0 },
      crafting: { level: 1, experience: 0 },
      cooking: { level: 1, experience: 0 },
      alchemy: { level: 1, experience: 0 },
      construction: { level: 1, experience: 0 },
      // Unique Skills
      luck: { level: 1, experience: 0 }
    },
    skillExperience: {
      // Combat Skills
      attack: 0,
      strength: 0,
      defense: 0,
      magic: 0,
      projectiles: 0,
      vitality: 0,
      // Gathering Skills
      mining: 0,
      woodcutting: 0,
      fishing: 0,
      hunting: 0,
      // Crafting Skills
      smithing: 0,
      crafting: 0,
      cooking: 0,
      alchemy: 0,
      construction: 0,
      // Unique Skills
      luck: 0
    }
  };
}

async function resolveAssetIdViaHelius(signature: string): Promise<string | null> {
  try {
    const heliusUrl = process.env.HELIUS_API_URL
    if (!heliusUrl) return null
    const txRes = await fetch(heliusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [signature] })
    })
    const json: any = await txRes.json().catch(() => null)
    const entry = Array.isArray(json) ? json[0] : null
    const compressed = entry?.events?.compressed
    const assetId = compressed?.assetId || compressed?.assetIds?.[0] || null
    return assetId || null
  } catch (e) {
    console.warn('⚠️ Helius resolve failed:', e)
    return null
  }
}

export async function findLatestAssetIdForOwner(ownerAddress: string): Promise<string | null> {
  try {
    const rpcUrl = getDasUrl() || getRpcUrl();
    const collection = process.env.CNFT_COLLECTION_ADDRESS || '';
    if (!rpcUrl || !collection) {
      console.warn('⚠️ Missing SOLANA_RPC_URL or CNFT_COLLECTION_ADDRESS for DAS lookup');
      return null;
    }
    const body = {
      jsonrpc: '2.0',
      id: 'findAsset',
      method: 'searchAssets',
      params: {
        ownerAddress: ownerAddress,
        grouping: ['collection', collection],
        page: 1,
        limit: 1,
        sortBy: { sortBy: 'recent_action', sortOrder: 'desc' }
      }
    } as any;
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      console.warn('⚠️ DAS searchAssets failed:', res.status, await res.text());
      return null;
    }
    const json: any = await res.json();
    const items = json?.result?.items || [];
    const assetId = items[0]?.id as string | undefined;
    return assetId || null;
  } catch (err) {
    console.warn('⚠️ DAS lookup error:', err);
    return null;
  }
}

export async function pollForAssetIdViaDAS(
  ownerAddress: string,
  timeoutMs: number = Number(process.env.DAS_RESOLVE_TIMEOUT_MS || 60000),
  intervalMs: number = Number(process.env.DAS_RESOLVE_INTERVAL_MS || 3000)
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const id = await findLatestAssetIdForOwner(ownerAddress);
    if (id) return id;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return null;
}

// Create character cNFT (exactly matching your frontend logic)
export async function createCharacterCNFT(
  playerPDA: string,
  characterName: string,
  playerId?: string, // Optional player UUID for off-chain tracking
  characterImageBase64?: string // Optional: character preview image from frontend (base64, no data URL prefix)
): Promise<{ success: boolean; assetId?: string; signature?: string; error?: string }> {
  try {
    // Generate character stats
    const characterStats = generateDefaultCharacterStats(characterName);
    
    // Use provided character image or generate one
    let imageBuffer: Buffer;
    if (characterImageBase64 && typeof characterImageBase64 === 'string' && characterImageBase64.length > 0) {
      console.log(`🎨 Using provided character image from frontend (${characterImageBase64.length} chars)...`);
      try {
        // Handle both data URL format (data:image/png;base64,...) and raw base64
        let base64Data = characterImageBase64.trim();
        if (base64Data.includes(',')) {
          // Remove data URL prefix if present
          base64Data = base64Data.split(',')[1];
        }
        
        // Validate base64 string (basic check)
        if (!base64Data || base64Data.length < 100) {
          throw new Error('Base64 string too short or empty');
        }
        
        // Convert base64 string to Buffer
        let rawBuffer = Buffer.from(base64Data, 'base64');
        console.log(`✅ Loaded character image from frontend: ${rawBuffer.length} bytes`);

        // Validate it's actually an image (PNG header: 89 50 4E 47)
        if (rawBuffer.length < 8) {
          throw new Error('Image buffer too small');
        }
        if (rawBuffer[0] !== 0x89 || rawBuffer[1] !== 0x50 || rawBuffer[2] !== 0x4E || rawBuffer[3] !== 0x47) {
          console.warn('⚠️ Image data does not have PNG header, but continuing anyway');
        }

        // Apply zoomed PFP crop (head + upper torso, 800×800) so NFT uses same style as backend-generated image
        imageBuffer = await cropImageToPfpStyle(rawBuffer);
        console.log(`✅ Cropped frontend image to PFP style: ${imageBuffer.length} bytes`);
      } catch (err) {
        console.warn('⚠️ Failed to parse provided image, generating new one:', err instanceof Error ? err.message : String(err));
        // Fallback to generating image
        const defaultCustomization = getDefaultCustomization();
        imageBuffer = await generateCharacterImage({
          customization: defaultCustomization,
          includeBackground: false
        });
        console.log(`✅ Generated character image (fallback): ${imageBuffer.length} bytes`);
      }
    } else {
      // Generate character image from sprites
      console.log('🎨 Generating character image from sprites...');
      const defaultCustomization = getDefaultCustomization();
      imageBuffer = await generateCharacterImage({
        customization: defaultCustomization,
        includeBackground: false
      });
      console.log(`✅ Generated character image: ${imageBuffer.length} bytes`);
    }
    
    // Upload image to Supabase Storage (faster and more reliable than Arweave)
    console.log('📤 Uploading character image to Supabase Storage...');
    let imageUrl: string;
    try {
      // Use a temporary ID for now, we'll update it after we get the assetId
      const tempId = `temp-${Date.now()}`;
      imageUrl = await saveCharacterImage(tempId, imageBuffer, true);
      console.log(`✅ Uploaded character image to Supabase Storage: ${imageUrl}`);
    } catch (uploadError) {
      console.error('❌ Failed to upload image to Supabase Storage:', uploadError);
      throw new Error(`Image upload failed: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
    }
    
    // Build metadata JSON with image URL
    const jsonPayload = {
      name: characterName,
      symbol: 'PLAYER',
      description: `Character with ${characterStats.totalLevel} total skill levels`,
      image: imageUrl,
      external_url: 'https://runara.fun',
      attributes: [
        { trait_type: 'Version', value: characterStats.version || '2.0.0' },
        { trait_type: 'Level', value: characterStats.combatLevel.toString() },
        { trait_type: 'Total Level', value: characterStats.totalLevel.toString() },
        { trait_type: 'Attack', value: characterStats.skills.attack.level.toString() },
        { trait_type: 'Strength', value: characterStats.skills.strength.level.toString() },
        { trait_type: 'Defense', value: characterStats.skills.defense.level.toString() },
        { trait_type: 'Magic', value: characterStats.skills.magic.level.toString() },
        { trait_type: 'Projectiles', value: characterStats.skills.projectiles.level.toString() },
        { trait_type: 'Vitality', value: characterStats.skills.vitality.level.toString() },
        { trait_type: 'Crafting', value: characterStats.skills.crafting.level.toString() },
        { trait_type: 'Luck', value: characterStats.skills.luck.level.toString() },
        { trait_type: 'Mining', value: characterStats.skills.mining.level.toString() },
        { trait_type: 'Woodcutting', value: characterStats.skills.woodcutting.level.toString() },
        { trait_type: 'Fishing', value: characterStats.skills.fishing.level.toString() },
        { trait_type: 'Hunting', value: characterStats.skills.hunting.level.toString() },
        { trait_type: 'Smithing', value: characterStats.skills.smithing.level.toString() },
        { trait_type: 'Cooking', value: characterStats.skills.cooking.level.toString() },
        { trait_type: 'Alchemy', value: characterStats.skills.alchemy.level.toString() },
        { trait_type: 'Construction', value: characterStats.skills.construction.level.toString() }
      ],
      properties: {
        files: [ { uri: imageUrl, type: 'image/png' } ]
      }
    };
    
    // Store metadata in database (no Arweave - faster and more reliable)
    // We'll use a metadata URL that points directly to the backend API endpoint
    const backendBase = process.env.BACKEND_BASE || process.env.BACKEND_BASE_URL || 'https://runara-skiller.up.railway.app';
    // Create URL-safe name: lowercase, spaces -> hyphens, remove special chars
    const urlSafeName = characterName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const metadataUri = `${backendBase}/api/characters/metadata/${urlSafeName}`;
    console.log(`✅ Using metadata URL: ${metadataUri}`);
    
    // Store metadata in database for API endpoint to serve
    try {
      const { error } = await pgQuery(
        `INSERT INTO nft_metadata (asset_id, metadata_json, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (asset_id) DO UPDATE SET
           metadata_json = EXCLUDED.metadata_json,
           created_at = EXCLUDED.created_at`,
        ['pending', jsonPayload, new Date().toISOString()]
      );
      if (error) {
        console.warn('⚠️ Failed to store metadata in database (non-fatal):', error);
      } else {
        console.log('✅ Stored metadata in database');
      }
    } catch (metaErr) {
      console.warn('⚠️ Failed to store metadata in database (non-fatal):', metaErr);
    }
    
    // Build Metaplex standard metadata
    // Note: metadataUri will be updated after minting with the correct assetId
    const displayName = characterName;
    
    const metadata = {
      name: displayName,
      symbol: 'PLAYER',
      uri: metadataUri, // Temporary URI, will be updated after mint
      sellerFeeBasisPoints: 500,
      collection: { key: publicKey(COLLECTION_MINT), verified: false },
      creators: [
        {
          address: serverSigner.publicKey,
          verified: true,
          share: 100
        }
      ]
    };

    // Mint the cNFT - Skip preflight to avoid simulation errors
    // Note: Simulation may fail due to collection metadata checks, but actual transaction can succeed
    let mintTx;
    let mintSignature = '';
    let rawUmiSignature: Uint8Array | null = null;
    
    try {
      mintTx = await mintToCollectionV1(umi, {
        leafOwner: publicKey(playerPDA),
        leafDelegate: serverSigner.publicKey,
        merkleTree: publicKey(MERKLE_TREE),
        collectionMint: publicKey(COLLECTION_MINT),
        metadata
      }).sendAndConfirm(umi, {
        send: { skipPreflight: true }, // Skip simulation - transaction may succeed even if simulation fails
        confirm: { commitment: 'processed' }
      });

      // Extract signature - keep raw Uint8Array for UMI parser
      const rawSig: any = (mintTx as any)?.signature;
      if (rawSig) {
        rawUmiSignature = new Uint8Array(rawSig);
        const bs58 = require('bs58');
        mintSignature = bs58.encode(rawUmiSignature);
      } else if (typeof rawSig === 'string') {
        mintSignature = rawSig;
      }
    } catch (mintError: any) {
      // Check if error is a simulation error but transaction might have succeeded
      const errorMsg = mintError?.message || String(mintError);
      const isSimulationError = 
        errorMsg.includes('Simulation failed') ||
        errorMsg.includes('0xbc4') ||
        errorMsg.includes('AccountNotInitialized') ||
        errorMsg.includes('collection_metadata');
      
      // Try to extract signature from error (some RPCs include it even on simulation failure)
      if (mintError?.signature) {
        const errSig = mintError.signature;
        if (typeof errSig === 'string') {
          mintSignature = errSig;
        } else if (errSig) {
          rawUmiSignature = new Uint8Array(errSig);
          const bs58 = require('bs58');
          mintSignature = bs58.encode(rawUmiSignature);
        }
      }
      
      // If we have a signature, the transaction might have succeeded despite simulation error
      if (mintSignature && isSimulationError) {
        console.warn('⚠️ Simulation failed but transaction may have succeeded. Signature:', mintSignature);
        console.warn('⚠️ Will attempt to verify transaction and extract asset ID...');
      } else {
        // Re-throw if it's not a simulation error or we don't have a signature
        throw mintError;
      }
    }
    
    if (!mintSignature) {
      throw new Error('Failed to extract transaction signature');
    }
    
    console.log('📝 Mint signature:', mintSignature);
    
    // ── Step 1: Explicitly confirm the transaction to 'confirmed' level ──
    // The mint used 'processed' commitment for speed, but the Metaplex parser
    // (and getTransaction) need 'confirmed'. We must wait for it.
    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl!);
    
    try {
      console.log('⏳ Waiting for transaction to reach confirmed status...');
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      const confirmation = await connection.confirmTransaction({
        signature: mintSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
      }
      console.log('✅ Transaction confirmed!');
    } catch (confirmErr: any) {
      // Don't throw yet - the transaction might still be findable, we'll try parsing
      console.warn('⚠️ confirmTransaction warning:', confirmErr?.message);
    }
    
    // ── Step 2: Extract asset ID ──
    let resolvedAssetId: string | null = null;
    
    // Ensure we have raw UMI signature bytes for the parser
    if (!rawUmiSignature && mintSignature) {
      try {
        const bs58 = require('bs58');
        rawUmiSignature = bs58.decode(mintSignature);
      } catch {
        // will fall through to manual method
      }
    }
    
    // Method 1: Use Metaplex parseLeafFromMintToCollectionV1Transaction (preferred)
    // Transaction should already be confirmed at this point
    if (rawUmiSignature) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const leaf = await parseLeafFromMintToCollectionV1Transaction(umi, rawUmiSignature);
          if (leaf && leaf.nonce !== undefined) {
            const assetIdPda = findLeafAssetIdPda(umi, {
              merkleTree: publicKey(MERKLE_TREE),
              leafIndex: leaf.nonce,
            });
            resolvedAssetId = assetIdPda.toString();
            console.log(`✅ Asset ID extracted via Metaplex parser (attempt ${attempt + 1}):`, resolvedAssetId);
            break;
          }
        } catch (parseErr: any) {
          console.warn(`⚠️ parseLeaf attempt ${attempt + 1}/3 failed:`, parseErr?.message || parseErr);
        }
        // Short delay between retries (transaction is already confirmed)
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Method 2: Fallback — fetch transaction via RPC and extract leaf index from inner instructions
    if (!resolvedAssetId) {
      console.warn('⚠️ Metaplex parser failed, falling back to manual transaction parsing...');
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const txResponse = await connection.getTransaction(mintSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          });
          
          if (txResponse) {
            const logs: string[] = txResponse.meta?.logMessages || [];
            console.log(`📋 Transaction has ${logs.length} log messages`);
            
            // Method 2a: Look for "Leaf asset ID: <base58>" directly in logs
            // This is the most direct way — Bubblegum logs the asset ID itself
            for (const log of logs) {
              const assetMatch = String(log).match(/Leaf asset ID:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/);
              if (assetMatch) {
                resolvedAssetId = assetMatch[1];
                console.log(`✅ Asset ID extracted directly from logs:`, resolvedAssetId);
                break;
              }
            }
            
            // Method 2b: Look for nonce/leaf_index to derive the asset ID
            if (!resolvedAssetId) {
              for (const log of logs) {
                const match = String(log).match(/(?:nonce|leaf_index|leafIndex)[:\s=]+(\d+)/i);
                if (match) {
                  const leafIndex = parseInt(match[1]);
                  if (!isNaN(leafIndex)) {
                    const assetIdPda = findLeafAssetIdPda(umi, {
                      merkleTree: publicKey(MERKLE_TREE),
                      leafIndex: BigInt(leafIndex),
                    });
                    resolvedAssetId = assetIdPda.toString();
                    console.log(`✅ Asset ID from log nonce (leafIndex=${leafIndex}):`, resolvedAssetId);
                    break;
                  }
                }
              }
            }
            
            if (resolvedAssetId) break;
            
            // If we got the transaction but couldn't extract, log all messages for debugging
            if (!resolvedAssetId) {
              console.warn('⚠️ Got transaction but could not extract asset ID. All log messages:');
              logs.forEach((log, i) => console.warn(`  [${i}] ${log}`));
            }
          } else {
            console.warn(`⚠️ getTransaction returned null (attempt ${attempt + 1}/3)`);
          }
        } catch (fetchErr: any) {
          console.warn(`⚠️ Manual tx fetch attempt ${attempt + 1}/3 failed:`, fetchErr?.message);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (!resolvedAssetId) {
      // Last resort: log the full signature so it can be manually investigated
      console.error('❌ All asset ID extraction methods failed for signature:', mintSignature);
      throw new Error('Could not extract asset ID from transaction logs');
    }
    
    // Re-upload image with correct assetId filename, then save to database
    try {
      // Re-upload image with assetId as filename (for better organization)
      const correctImageUrl = await saveCharacterImage(resolvedAssetId, imageBuffer, true);
      console.log(`✅ Re-uploaded image with assetId filename: ${correctImageUrl}`);
      
      // Update metadata in database with correct assetId and final metadata URI
      // Use character name in URI (like Arweave) - much shorter than assetId
      const backendBase = process.env.BACKEND_BASE || process.env.BACKEND_BASE_URL || 'https://runara-skiller.up.railway.app';
      // Create URL-safe name: lowercase, spaces -> hyphens, remove special chars
      const urlSafeName = characterName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const finalMetadataUri = `${backendBase}/api/characters/metadata/${urlSafeName}`;
      
      // Update the metadata JSON with the correct image URL
      const finalJsonPayload = {
        ...jsonPayload,
        image: correctImageUrl
      };
      
      // Create/update metadata record with the actual assetId
      // Keep the pending record too (don't delete it) so the on-chain URI still works
      await pgQuery(
        `INSERT INTO nft_metadata (asset_id, metadata_json, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (asset_id) DO UPDATE SET
           metadata_json = EXCLUDED.metadata_json,
           created_at = EXCLUDED.created_at`,
        [resolvedAssetId, finalJsonPayload, new Date().toISOString()]
      );
      
      // Also update the pending record with the final metadata (so pending URI still works)
      await pgQuery(
        `INSERT INTO nft_metadata (asset_id, metadata_json, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (asset_id) DO UPDATE SET
           metadata_json = EXCLUDED.metadata_json,
           created_at = EXCLUDED.created_at`,
        ['pending', finalJsonPayload, new Date().toISOString()]
      );
      
      console.log(`✅ Updated metadata URI: ${finalMetadataUri}`);
      
      // Save everything to database
      // NOTE: Skills are stored in nft_skill_experience table, not in nfts table
      const seedStats = generateDefaultCharacterStats(characterName);
      const { error: upsertError } = await pgQuery(
        `INSERT INTO nfts (
          asset_id, player_pda, character_image_url, name, combat_level, 
          total_level, version, level
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (asset_id) DO UPDATE SET
          player_pda = EXCLUDED.player_pda,
          character_image_url = EXCLUDED.character_image_url,
          name = EXCLUDED.name,
          combat_level = EXCLUDED.combat_level,
          total_level = EXCLUDED.total_level,
          version = EXCLUDED.version,
          level = EXCLUDED.level`,
        [
          resolvedAssetId,
          playerPDA,
          correctImageUrl,
          characterName,
          seedStats.combatLevel,
          seedStats.totalLevel,
          seedStats.version || '2.0.0',
          1 // Default level
        ]
      );
      
      if (upsertError) {
        console.error('❌ Failed to upsert nfts row:', upsertError);
        throw new Error(`Database save failed: ${upsertError instanceof Error ? upsertError.message : String(upsertError)}`);
      }
      
      console.log(`✅ Saved image URL and metadata to database: ${correctImageUrl}`);
      console.log(`✅ Asset ID: ${resolvedAssetId}`);
    } catch (dbErr) {
      console.error('⚠️ Failed to save to database:', dbErr);
      throw new Error(`Database save failed: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
    }
    
    return {
      success: true,
      assetId: resolvedAssetId,
      signature: mintSignature
    };
    
  } catch (error) {
    console.error('❌ Failed to create character cNFT:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Update ONLY the name field of a cNFT (separate transaction to avoid size limits)
// This is called when name changes, separate from URI updates
export async function updateCNFTNameOnly(
  assetId: string,
  name: string,
  playerPDA?: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    // CRITICAL: Fetch current combat level to format name as "Name (Level #)"
    // This matches the format used in updateCharacterCNFT() for consistency
    let combatLevel = 1;
    try {
      const row = await NftColumns.get(assetId);
      if (row) {
        const stats = await NftColumns.columnsToStatsWithSkills(row);
        combatLevel = stats.combatLevel || 1;
        console.log(`📊 Fetched combat level ${combatLevel} for name formatting`);
      }
    } catch (dbErr) {
      console.warn(`⚠️ Failed to fetch combat level, using default: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
    }
    
    // Format name as "Name (Level #)" to match URI update format
    // CRITICAL: Name must be <= 32 bytes for Solana on-chain storage
    const nftDisplayName = `${name} (Level ${combatLevel})`;
    if (nftDisplayName.length > 32) {
      console.warn(`⚠️ Name "${nftDisplayName}" exceeds 32 bytes (${nftDisplayName.length}), truncating...`);
      // Truncate to fit 32 bytes (Solana limit)
      const truncatedName = nftDisplayName.substring(0, 32);
      console.log(`📝 Truncated name: "${truncatedName}"`);
    }
    console.log(`📝 Updating cNFT name only: "${nftDisplayName}" (${nftDisplayName.length} bytes) for assetId ${assetId} (base name: "${name}")`);
    
    // Setup UMI with Bubblegum
    const rpcUrl = getRpcUrl(); // Use regular RPC, not DAS URL
    const umiWithBubblegum = createUmi(rpcUrl)
      .use(mplBubblegum())
      .use(mplTokenMetadata())
      .use(signerIdentity(serverSigner));
    
    console.log(`🔍 Using RPC: ${rpcUrl}`);
    
    // Helper to fetch fresh proof with stability check
    const fetchFreshProof = async (): Promise<any> => {
      let attempts = 0;
      const maxAttempts = 5;
      
      while (attempts < maxAttempts) {
        attempts++;
        console.log(`🔄 Fetching fresh proof (attempt ${attempts}/${maxAttempts})...`);
        
        // Fetch proof twice to check stability
        const proof1 = await getAssetWithProof(umiWithBubblegum, publicKey(assetId), {
          truncateCanopy: true
        });
        
        // Small delay to see if root changes
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const proof2 = await getAssetWithProof(umiWithBubblegum, publicKey(assetId), {
          truncateCanopy: true
        });
        
        // Compare roots for stability
        const root1 = (proof1 as any)?.tree?.root?.toString();
        const root2 = (proof2 as any)?.tree?.root?.toString();
        
        if (root1 === root2) {
          console.log('✅ Proof is stable, using it');
          return proof1;
        }
        
        console.log(`⚠️ Proof roots differ (attempt ${attempts}), waiting and retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // If we get here, use the last proof anyway
      console.log('⚠️ Using proof after max attempts (may be unstable)');
      return await getAssetWithProof(umiWithBubblegum, publicKey(assetId), {
        truncateCanopy: true
      });
    };
    
    // Determine leaf owner (will be set after fetching proof)
    let leafOwner: any;
    let leafDelegate: any;
    
    // Build update transaction with retry logic
    const sendTransactionWithRetry = async (retries = 3): Promise<string> => {
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`🔄 Transaction attempt ${i + 1}/${retries}...`);
          
          // Fetch fresh proof before each attempt
          const assetWithProof = await fetchFreshProof();
          
          if (!assetWithProof) {
            throw new Error('Failed to fetch asset with proof');
          }
          
          // Set leaf owner and delegate
          leafOwner = playerPDA ? publicKey(playerPDA) : assetWithProof.leafOwner;
          leafDelegate = (assetWithProof as any)?.leafDelegate || serverSigner.publicKey;
          
          // Build update transaction - NAME ONLY
          const finalName = nftDisplayName.length > 32 ? nftDisplayName.substring(0, 32) : nftDisplayName;
          const updatedMetadata = {
            ...assetWithProof.metadata,
            name: finalName
          };
          const updateArgs = {
            name: some(finalName)
          };
          
          // Build transaction with fresh proof
          const updateTx = updateMetadata(umiWithBubblegum, {
            ...assetWithProof,
            leafOwner: leafOwner,
            leafDelegate: publicKey(leafDelegate.toString()),
            currentMetadata: updatedMetadata,
            updateArgs,
            collectionMint: publicKey(COLLECTION_MINT)
          });
          
          // Send transaction
          const result = await updateTx.sendAndConfirm(umiWithBubblegum, {
            send: { skipPreflight: false }
          });
          
          const rawSig: any = (result as any)?.signature;
          const signature = typeof rawSig === 'string' 
            ? rawSig 
            : (rawSig && typeof Buffer !== 'undefined' && typeof require !== 'undefined')
              ? require('bs58').encode(Uint8Array.from(rawSig))
              : String(rawSig || '');
          
          return signature;
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          console.error(`❌ Transaction attempt ${i + 1} failed:`, errorMsg);
          
          // Check for stale proof error
          const isStaleProof = errorMsg?.includes('Invalid root recomputed from proof') || 
                               errorMsg?.includes('leaf value does not match') ||
                               errorMsg?.includes('current leaf value does not match');
          
          if (isStaleProof && i < retries - 1) {
            console.log('🔄 Detected stale merkle tree proof, will fetch fresh proof on next attempt...');
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          if (i === retries - 1) throw error;
        }
      }
      throw new Error('Update failed after retries');
    };
    
    const signature = await sendTransactionWithRetry();
    
    return {
      success: true,
      signature
    };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error(`❌ Failed to update cNFT name:`, errorMsg);
    return {
      success: false,
      error: errorMsg
    };
  }
}

// Update character cNFT metadata
// FIXED: Reverted to SDK-based approach (like working commit be1962f)
// The manual DAS API approach was buggy and overcomplicated
export async function updateCharacterCNFT(
  assetId: string,
  characterStats: CharacterStats,
  playerPDA?: string,
  imageUrl?: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    console.log('🔄 Updating cNFT metadata for:', assetId);
    
    // Use EXACT same pattern as working route.ts
    // Use regular RPC URL (not DAS-specific) - like working route does
    const rpcUrl = getRpcUrl(); // Use regular RPC, not DAS URL
    const umiWithBubblegum = createUmi(rpcUrl)
      .use(mplBubblegum())
      .use(signerIdentity(serverSigner));
    
    console.log(`🔍 Using RPC: ${rpcUrl}`);
    
    // Get asset with proof using EXACT same pattern as working route
    console.log('📋 Fetching asset with proof...');
    let assetWithProof;
    
    const fetchAssetWithRetry = async (retries = 3): Promise<any> => {
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`🔄 Attempt ${i + 1}/${retries} to fetch asset proof...`);
          const asset = await getAssetWithProof(umiWithBubblegum, publicKey(assetId), {
            truncateCanopy: true
          });
          console.log('✅ Asset proof fetched successfully');
          return asset;
        } catch (error) {
          console.error(`❌ Attempt ${i + 1} failed:`, error);
          if (i === retries - 1) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    };
    
    try {
      assetWithProof = await fetchAssetWithRetry();
    } catch (proofError) {
      console.error('❌ Failed to get asset proof after retries:', proofError);
      return {
        success: false,
        error: `Failed to get asset proof: ${proofError instanceof Error ? proofError.message : 'Unknown error'}`
      };
    }
    
    // CRITICAL: Use proof IMMEDIATELY - don't delay or tree state may change
    // Build JSON payload and upload to Arweave FIRST (before using proof)
    console.log('🔄 Updating cNFT metadata for:', assetId);
    
    // Determine image URL: use provided imageUrl, or check database, or fall back to default
    let finalImageUrl = imageUrl;
    if (!finalImageUrl) {
      // Try to get image URL from database (character_image_url column)
      try {
        const row = await NftColumns.get(assetId);
        if (row?.character_image_url) {
          finalImageUrl = row.character_image_url;
          console.log(`✅ Using image URL from database: ${finalImageUrl}`);
        }
      } catch (dbErr) {
        console.warn(`⚠️ Failed to fetch image URL from database: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }
    
    // Fall back to default if still no image URL
    if (!finalImageUrl) {
      finalImageUrl = resolveDefaultCharacterImageUrl(characterStats.name);
      console.log(`⚠️ No image URL found, using default: ${finalImageUrl}`);
    } else {
      console.log(`✅ Using image URL: ${finalImageUrl}`);
    }
    
    // Format name as "Name (Level #)" for NFT display
    const nftDisplayName = `${characterStats.name} (Level ${characterStats.combatLevel})`;
    
    const jsonPayload = {
      name: nftDisplayName, // Format: "Name (Level #)"
      symbol: 'PLAYER',
      description: `Character with ${characterStats.totalLevel} total skill levels`,
      image: finalImageUrl,
      external_url: 'https://runara.fun',
      attributes: [
        { trait_type: 'Version', value: characterStats.version || '2.0.0' },
        ...(characterStats.combatLevel != null ? [{ trait_type: 'Level', value: characterStats.combatLevel.toString() }] : []), // Changed from "Combat Level" to "Level"
        { trait_type: 'Total Level', value: characterStats.totalLevel.toString() },
        { trait_type: 'Attack', value: (characterStats.skills.attack?.level ?? 1).toString() },
        { trait_type: 'Strength', value: (characterStats.skills.strength?.level ?? 1).toString() },
        { trait_type: 'Defense', value: (characterStats.skills.defense?.level ?? 1).toString() },
        { trait_type: 'Magic', value: (characterStats.skills.magic?.level ?? 1).toString() },
        { trait_type: 'Projectiles', value: (characterStats.skills.projectiles?.level ?? 1).toString() },
        { trait_type: 'Vitality', value: (characterStats.skills.vitality?.level ?? 1).toString() },
        { trait_type: 'Crafting', value: (characterStats.skills.crafting?.level ?? 1).toString() },
        { trait_type: 'Luck', value: (characterStats.skills.luck?.level ?? 1).toString() },
        { trait_type: 'Mining', value: (characterStats.skills.mining?.level ?? 1).toString() },
        { trait_type: 'Woodcutting', value: (characterStats.skills.woodcutting?.level ?? 1).toString() },
        { trait_type: 'Fishing', value: (characterStats.skills.fishing?.level ?? 1).toString() },
        { trait_type: 'Hunting', value: (characterStats.skills.hunting?.level ?? 1).toString() },
        { trait_type: 'Smithing', value: (characterStats.skills.smithing?.level ?? 1).toString() },
        { trait_type: 'Cooking', value: (characterStats.skills.cooking?.level ?? 1).toString() },
        { trait_type: 'Alchemy', value: (characterStats.skills.alchemy?.level ?? 1).toString() },
        { trait_type: 'Construction', value: (characterStats.skills.construction?.level ?? 1).toString() }
      ],
      properties: { files: [{ uri: finalImageUrl, type: 'image/png' }] },
      characterStats
    };
    
    // Store metadata in database instead of Arweave
    // Point directly to backend API endpoint
    const backendBase = process.env.BACKEND_BASE || process.env.BACKEND_BASE_URL || 'https://runara-skiller.up.railway.app';
    // Get character name from stats
    const characterName = characterStats.name || 'character';
    const urlSafeName = characterName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const newUri = `${backendBase}/api/characters/metadata/${urlSafeName}`;
    console.log('✅ Storing metadata in database:', newUri);
    
    try {
      const { error } = await pgQuery(
        `INSERT INTO nft_metadata (asset_id, metadata_json, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (asset_id) DO UPDATE SET
           metadata_json = EXCLUDED.metadata_json,
           created_at = EXCLUDED.created_at`,
        [assetId, jsonPayload, new Date().toISOString()]
      );
      if (error) {
        console.warn('⚠️ Failed to store metadata in database:', error);
      } else {
        console.log('✅ Metadata stored in database');
      }
    } catch (metaErr) {
      console.error('❌ Failed to store metadata in database:', metaErr);
      throw new Error(`Metadata storage failed: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`);
    }
    
    // Update URI only - name is already in the database JSON metadata
    // Updating both URI and name exceeds transaction size limit (1648 > 1644 bytes)
    // The name is accessible via the metadata URI, so updating URI is sufficient
    let updateArgs: any = {
      uri: some(newUri)
      // Skip name update - it's in the database JSON and updating both exceeds transaction size
    };
    
    console.log(`📝 Updating URI only (name "${nftDisplayName}" is in database JSON): "${newUri}"`);
    
    // Determine leaf owner
    // For new off-chain cNFTs: leafOwner is treasury wallet (from assetWithProof.leafOwner)
    // For old PDA-based cNFTs: can use playerPDA if provided, otherwise use assetWithProof.leafOwner
    // This allows the function to work with both old and new cNFTs
    const leafOwner = playerPDA ? publicKey(playerPDA) : assetWithProof.leafOwner;
    console.log(`🎯 Using leaf owner: ${leafOwner}${playerPDA ? ' (from playerPDA)' : ' (from asset)'}`);
    
    // Build update transaction using EXACT same pattern as working route
    let updateTx = updateMetadata(umiWithBubblegum, {
      ...assetWithProof,
      leafOwner: leafOwner,
      currentMetadata: assetWithProof.metadata,
      updateArgs,
      collectionMint: publicKey(COLLECTION_MINT)
    });

    // Send with retry using EXACT same pattern as working route
    console.log('🚀 Sending metadata update transaction...');
    
    const sendTransactionWithRetry = async (retries = 2): Promise<string> => {
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`🔄 Transaction attempt ${i + 1}/${retries}...`);
          const result = await updateTx.sendAndConfirm(umiWithBubblegum, {
            send: { skipPreflight: false }
          });
          const rawSig: any = (result as any)?.signature;
          if (typeof rawSig === 'string') return rawSig;
          if (rawSig && typeof Buffer !== 'undefined' && typeof require !== 'undefined') {
            const bs58 = require('bs58');
            return bs58.encode(Uint8Array.from(rawSig));
          }
          return String(rawSig || '');
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          console.error(`❌ Transaction attempt ${i + 1} failed:`, errorMsg);

          // If the Bubblegum collection_metadata account was never initialized, skip on-chain update.
          // This matches the new off-chain-first architecture: metadata is already stored in our DB,
          // so a missing collection_metadata account should not be treated as a fatal error.
          const isUninitializedCollectionMetadata =
            errorMsg?.includes('AccountNotInitialized') ||
            errorMsg?.includes('account: collection_metadata');

          if (isUninitializedCollectionMetadata) {
            console.warn(
              '⚠️ Bubblegum collection_metadata account not initialized; skipping on-chain metadata update for this asset.'
            );
            // Return empty signature to indicate "no on-chain update performed" but no failure.
            return '';
          }
          
          // Check if transaction is too large (trying to update both URI and name)
          const isTransactionTooLarge = errorMsg?.includes('too large') || 
                                       errorMsg?.includes('exceeds') ||
                                       errorMsg?.includes('1644') ||
                                       errorMsg?.includes('1232');
          
          // If transaction too large and we're trying to update both URI and name, fall back to URI-only
          if (isTransactionTooLarge && updateArgs.name && i === 0) {
            console.warn(`⚠️ Transaction too large with name update, falling back to URI-only update`);
            updateArgs = { uri: some(newUri) }; // Remove name update
            
            // Rebuild transaction with URI-only
            assetWithProof = await fetchAssetWithRetry();
            updateTx = updateMetadata(umiWithBubblegum, {
              ...assetWithProof,
              leafOwner: leafOwner,
              currentMetadata: assetWithProof.metadata,
              updateArgs,
              collectionMint: publicKey(COLLECTION_MINT)
            });
            continue; // Retry with URI-only
          }
          
          // Check for various recoverable errors that require refetching proof/blockhash
          const isStaleProof = errorMsg?.includes('Invalid root recomputed from proof') || 
                               errorMsg?.includes('leaf value does not match') ||
                               errorMsg?.includes('current leaf value does not match');
          const isBlockhashExpired = errorMsg?.includes('Blockhash not found') ||
                                     errorMsg?.includes('blockhash not found');
          
          if ((isStaleProof || isBlockhashExpired) && i < retries - 1) {
            if (isStaleProof) {
              console.log('🔄 Detected stale merkle tree proof, refetching asset and retrying...');
            } else {
              console.log('🔄 Detected expired blockhash, refetching asset and rebuilding transaction...');
            }
            
            // Refetch the asset with fresh proof and blockhash
            assetWithProof = await fetchAssetWithRetry();
            
            // Rebuild the transaction with fresh proof and blockhash
            updateTx = updateMetadata(umiWithBubblegum, {
              ...assetWithProof,
              leafOwner: leafOwner,
              currentMetadata: assetWithProof.metadata,
              updateArgs,
              collectionMint: publicKey(COLLECTION_MINT)
            });
            
            // Wait before retry (longer for blockhash issues)
            const waitTime = isBlockhashExpired ? 3000 : 2000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          
          if (i === retries - 1) throw error;
        }
      }
      throw new Error('Update failed after retries');
    };
    
    const signature = await sendTransactionWithRetry();
    
    console.log('✅ cNFT metadata updated on-chain! Signature:', signature);
    return { success: true, signature };
    
  } catch (error) {
    console.error('❌ cNFT metadata update error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Repair NFT metadata URI - updates from "pending" to actual assetId
export async function repairNFTMetadataURI(
  assetId: string,
  playerPDA?: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    console.log(`🔧 Repairing metadata URI for assetId: ${assetId}`);
    
    // Setup UMI with Bubblegum
    const rpcUrl = getRpcUrl();
    const umiWithBubblegum = createUmi(rpcUrl)
      .use(mplBubblegum())
      .use(mplTokenMetadata())
      .use(signerIdentity(createSignerFromKeypair(umi, serverSigner)));
    
    // Fetch asset with proof
    const assetWithProof = await getAssetWithProof(umiWithBubblegum, publicKey(assetId), {
      truncateCanopy: true
    });
    
    if (!assetWithProof) {
      throw new Error('Failed to fetch asset with proof');
    }
    
    // Check current URI
    const currentUri = assetWithProof.metadata.uri as string;
    // Backend base for metadata URIs
    const backendBase = process.env.BACKEND_BASE || process.env.BACKEND_BASE_URL || 'https://runara-skiller.up.railway.app';
    // Get character name from database
    let characterName = 'character';
    try {
      const row = await NftColumns.get(assetId);
      if (row?.name) {
        characterName = row.name;
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch character name, using default');
    }
    
    // Create URL-safe name: lowercase, spaces -> hyphens, remove special chars
    const urlSafeName = characterName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const correctUri = `${backendBase}/api/characters/metadata/${urlSafeName}`;
    
    if (currentUri === correctUri) {
      console.log('✅ Metadata URI is already correct');
      return { success: true };
    }
    
    console.log(`📋 Current URI: ${currentUri}`);
    console.log(`📋 Correct URI: ${correctUri}`);
    
    // Fetch or create metadata in database
    let metadataJson: any;
    const { data: existingMetadata, error: existingError } = await pgQuerySingle(
      'SELECT metadata_json FROM nft_metadata WHERE asset_id = $1',
      [assetId]
    );
    
    if (existingMetadata?.metadata_json && !existingError) {
      metadataJson = existingMetadata.metadata_json;
      console.log('✅ Found existing metadata in database');
    } else {
      // Try to get from pending
      const { data: pendingMetadata, error: pendingError } = await pgQuerySingle(
        'SELECT metadata_json FROM nft_metadata WHERE asset_id = $1',
        ['pending']
      );
      
      if (pendingMetadata?.metadata_json && !pendingError) {
        metadataJson = pendingMetadata.metadata_json;
        // Update to use correct assetId
        await pgQuery(
          `INSERT INTO nft_metadata (asset_id, metadata_json, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (asset_id) DO UPDATE SET
             metadata_json = EXCLUDED.metadata_json,
             created_at = EXCLUDED.created_at`,
          [assetId, metadataJson, new Date().toISOString()]
        );
        console.log('✅ Migrated metadata from pending to assetId');
      } else {
        // Fetch from current URI and store it
        try {
          const response = await fetch(currentUri);
          if (response.ok) {
            metadataJson = await response.json();
            await pgQuery(
              `INSERT INTO nft_metadata (asset_id, metadata_json, created_at)
               VALUES ($1, $2, $3)
               ON CONFLICT (asset_id) DO UPDATE SET
                 metadata_json = EXCLUDED.metadata_json,
                 created_at = EXCLUDED.created_at`,
              [assetId, metadataJson, new Date().toISOString()]
            );
            console.log('✅ Fetched and stored metadata from current URI');
          } else {
            throw new Error('Could not fetch metadata from current URI');
          }
        } catch (fetchErr) {
          // Create default metadata from database
          const row = await NftColumns.get(assetId);
          if (row) {
            const stats = await NftColumns.columnsToStatsWithSkills(row);
            metadataJson = {
              name: stats.name,
              symbol: 'PLAYER',
              description: `Character with ${stats.totalLevel} total skill levels`,
              image: row.character_image_url || '',
              external_url: 'https://runara.fun',
              attributes: [
                { trait_type: 'Version', value: stats.version || '2.0.0' },
                { trait_type: 'Level', value: stats.combatLevel.toString() },
                { trait_type: 'Total Level', value: stats.totalLevel.toString() },
                { trait_type: 'Attack', value: stats.skills.attack.level.toString() },
                { trait_type: 'Strength', value: stats.skills.strength.level.toString() },
                { trait_type: 'Defense', value: stats.skills.defense.level.toString() },
                { trait_type: 'Magic', value: stats.skills.magic.level.toString() },
                { trait_type: 'Projectiles', value: stats.skills.projectiles.level.toString() },
                { trait_type: 'Vitality', value: stats.skills.vitality.level.toString() },
                { trait_type: 'Crafting', value: stats.skills.crafting.level.toString() },
                { trait_type: 'Luck', value: stats.skills.luck.level.toString() },
                { trait_type: 'Mining', value: stats.skills.mining.level.toString() },
                { trait_type: 'Woodcutting', value: stats.skills.woodcutting.level.toString() },
                { trait_type: 'Fishing', value: stats.skills.fishing.level.toString() },
                { trait_type: 'Hunting', value: stats.skills.hunting.level.toString() },
                { trait_type: 'Smithing', value: stats.skills.smithing.level.toString() },
                { trait_type: 'Cooking', value: stats.skills.cooking.level.toString() },
                { trait_type: 'Alchemy', value: stats.skills.alchemy.level.toString() },
                { trait_type: 'Construction', value: stats.skills.construction.level.toString() }
              ],
              properties: {
                files: row.character_image_url ? [{ uri: row.character_image_url, type: 'image/png' }] : []
              }
            };
            await pgQuery(
              `INSERT INTO nft_metadata (asset_id, metadata_json, created_at)
               VALUES ($1, $2, $3)
               ON CONFLICT (asset_id) DO UPDATE SET
                 metadata_json = EXCLUDED.metadata_json,
                 created_at = EXCLUDED.created_at`,
              [assetId, metadataJson, new Date().toISOString()]
            );
            console.log('✅ Created metadata from database stats');
          } else {
            throw new Error('Could not find character data to create metadata');
          }
        }
      }
    }
    
    // Update on-chain URI only (name is already in database JSON)
    // CRITICAL: Only update URI to avoid transaction size limit (1644 bytes max)
    const leafOwner = playerPDA ? publicKey(playerPDA) : assetWithProof.leafOwner;
    const leafDelegate = (assetWithProof as any)?.leafDelegate || serverSigner.publicKey;
    
    // Retry logic with fresh proof (similar to updateCharacterCNFT)
    const sendTransactionWithRetry = async (retries = 3): Promise<string> => {
      for (let i = 0; i < retries; i++) {
        try {
          // Fetch fresh proof with truncated canopy to reduce transaction size
          console.log(`🔄 Attempt ${i + 1}/${retries}: Fetching fresh proof with truncated canopy...`);
          const freshAssetWithProof = await getAssetWithProof(umiWithBubblegum, publicKey(assetId), {
            truncateCanopy: true
          });
          
          const updateTx = updateMetadata(umiWithBubblegum, {
            ...freshAssetWithProof,
            leafOwner: leafOwner,
            leafDelegate: publicKey(leafDelegate.toString()),
            currentMetadata: freshAssetWithProof.metadata,
            updateArgs: {
              uri: some(correctUri)
              // Only update URI - name is in database JSON, updating both exceeds size limit
            },
            collectionMint: publicKey(COLLECTION_MINT)
          });
          
          // Use processed commitment for faster confirmation
          const result = await updateTx.sendAndConfirm(umiWithBubblegum, {
            confirm: { commitment: 'processed' },
            send: { skipPreflight: false }
          });
          
          const rawSig: any = (result as any)?.signature;
          const signature = typeof rawSig === 'string' 
            ? rawSig 
            : (rawSig && typeof Buffer !== 'undefined' && typeof require !== 'undefined')
              ? require('bs58').encode(Uint8Array.from(rawSig))
              : String(rawSig || '');
          
          return signature;
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          const isStaleProof = errorMsg?.includes('Invalid root') || 
                               errorMsg?.includes('stale') ||
                               errorMsg?.includes('merkle tree');
          const isTooLarge = errorMsg?.includes('too large') || 
                            errorMsg?.includes('1644');
          
          if (isTooLarge) {
            // Transaction size is a hard limit - cannot be worked around with retries
            throw new Error(`Transaction too large (${errorMsg}). The URI may be too long for Solana's transaction size limit (1644 bytes max). The NFT metadata is stored correctly in the database and will work via the API endpoint even with the "pending" URI.`);
          }
          
          if (isStaleProof && i < retries - 1) {
            console.log(`🔄 Stale proof detected, refetching and retrying...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          if (i === retries - 1) throw error;
        }
      }
      throw new Error('Update failed after retries');
    };
    
    const signature = await sendTransactionWithRetry();
    
    console.log(`✅ Metadata URI repaired! New URI: ${correctUri}`);
    console.log(`✅ Transaction signature: ${signature}`);
    
    return {
      success: true,
      signature
    };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error(`❌ Failed to repair metadata URI:`, errorMsg);
    return {
      success: false,
      error: errorMsg
    };
  }
}

// Fetch character from cNFT (exactly matching your frontend parsing logic)
export async function fetchCharacterFromCNFT(assetId: string): Promise<Character | null> {
  try {
    console.log('🔍 Fetching character data for:', assetId);

    let parsedStats: CharacterStats | null = null;

    // First try full proof (needed for updates, nice-to-have for reads)
    try {
      const assetWithProof = await getAssetWithProof(umi, publicKey(assetId), {
        truncateCanopy: true
      });
      console.log('✅ Successfully fetched cNFT with proof');
      parsedStats = await parseCharacterFromMetadata(assetWithProof);
    } catch (proofErr) {
      console.warn('⚠️ Proof fetch failed; falling back to DAS getAsset for read-only metadata:', proofErr);
      // Fallback to read-only DAS getAsset so UI can still render
      try {
        const rpcUrl = getDasUrl() || getRpcUrl();
        if (!rpcUrl) throw new Error('DAS/RPC URL not configured');
        const body = {
          jsonrpc: '2.0',
          id: 'getAsset',
          method: 'getAsset',
          params: [ { id: assetId } ]
        } as any;
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`DAS getAsset failed: ${res.status}`);
        const json: any = await res.json();
        const asset = json?.result;
        if (!asset) throw new Error('DAS getAsset returned no result');

        // Map DAS shape to the minimal structure parseCharacterFromMetadata expects
        const name = asset?.content?.metadata?.name || '';
        const uri = asset?.content?.json_uri || asset?.content?.links?.external_url || '';
        const attributes = asset?.content?.metadata?.attributes || [];
        const shim = { metadata: { name, uri, attributes } };
        parsedStats = await parseCharacterFromMetadata(shim);
        console.log('✅ Fetched metadata via DAS getAsset');
      } catch (dasErr) {
        console.error('❌ DAS getAsset fallback failed:', dasErr);
        return null;
      }
    }

    return parsedStats
      ? { id: assetId, characterStats: parsedStats, lastSynced: new Date() }
      : null;
  } catch (error) {
    console.error('❌ Error fetching character from cNFT (outer):', error);
    return null;
  }
}

// Transfer compressed NFT from player PDA to a connected wallet
export async function transferCNFTToWallet(
  assetId: string,
  playerPDA: string,
  walletAddress: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const shorten = (s: any, start = 8, end = 4) => {
      const x = String(s || '')
      return x.length > start + end ? `${x.slice(0, start)}...${x.slice(-end)}` : x
    }
    console.log('[WD] Begin withdraw', {
      assetId: shorten(assetId),
      playerPDA: shorten(playerPDA),
      wallet: shorten(walletAddress)
    })
    // Use a proof RPC that matches the one used by the client (prefer DAS/Helius)
    const proofRpc = getDasUrl() || getRpcUrl()
    const proofUmi = proofRpc ? createUmi(proofRpc).use(mplBubblegum()) : umi
    // Reuse server signer identity for sending if we fall back to umi
    if (proofRpc) {
      try { (proofUmi as any).use(signerIdentity(serverSigner)) } catch {}
    }
    console.log('[WD] RPCs', { proofRpc: proofRpc || '(umi default)' })
    // Helper to build and send with robust retry on stale proof
    const sendWithRetry = async (retries = 2): Promise<string> => {
      let lastErr: any = null
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          // Fetch two consecutive canopy-truncated proofs and prefer a stable root
          const pk = publicKey(assetId)
          const first = await getAssetWithProof(proofUmi, pk, { truncateCanopy: true })
          await new Promise(r => setTimeout(r, 200))
          const second = await getAssetWithProof(proofUmi, pk, { truncateCanopy: true })
          const r1 = String((first as any).root || '')
          const r2 = String((second as any).root || '')
          const assetWithProof = r1 === r2 ? second : first
          console.log('[WD] Attempt proof roots', { attempt: attempt + 1, r1: shorten(r1, 6, 6), r2: shorten(r2, 6, 6), stable: r1 === r2, proofLen: (assetWithProof as any)?.proof?.length })
          // Determine transfer path based on current owner
          const currentOwner = String(assetWithProof.leafOwner)
          const currentDelegate = String((assetWithProof as any)?.leafDelegate || '')
          const pdaStr = String(publicKey(playerPDA))
          const serverStr = String(serverSigner.publicKey)
          console.log('[WD] Leaf state', { owner: shorten(currentOwner), delegate: shorten(currentDelegate) || '(none)' })

          let tx
          if (currentOwner === pdaStr) {
            console.log('[WD] Path: PDA → wallet')
            tx = transfer(proofUmi, {
              ...assetWithProof,
              leafOwner: publicKey(playerPDA),
              leafDelegate: serverSigner.publicKey,
              newLeafOwner: publicKey(walletAddress),
            })
          } else if (currentOwner === serverStr) {
            console.log('[WD] Path: ESCROW(server) → wallet')
            tx = transfer(proofUmi, {
              ...assetWithProof,
              leafOwner: serverSigner.publicKey,
              leafDelegate: serverSigner.publicKey,
              newLeafOwner: publicKey(walletAddress),
            })
          } else {
            console.error('[WD] Owner mismatch', { currentOwner: shorten(currentOwner), expectedPDA: shorten(pdaStr), expectedServer: shorten(serverStr) })
            throw new Error('Asset is not owned by player PDA or server escrow')
          }
          // Send quickly; prefer finalized confirmation to reduce reorg/drift issues
          console.log('[WD] Sending tx...')
          const sendStart = Date.now()
          const result = await tx.sendAndConfirm(proofUmi, { send: { skipPreflight: true }, confirm: { commitment: 'finalized' as any } })
          console.log('[WD] Tx confirmed', { ms: Date.now() - sendStart })
          const rawSig: any = (result as any)?.signature
          if (typeof rawSig === 'string') return rawSig
          if (rawSig && typeof Buffer !== 'undefined' && typeof require !== 'undefined') {
            const bs58 = require('bs58')
            return bs58.encode(Uint8Array.from(rawSig))
          }
          return String(rawSig || '')
        } catch (err: any) {
          lastErr = err
          const msg = String(err?.message || err)
          // Handle stale proof/root recompute – refetch and retry
          if (msg.includes('Invalid root recomputed') || msg.includes('ConcurrentMerkleTree') || msg.includes('ProgramFailedToComplete') || msg.includes('failed to complete')) {
            const logs = (err as any)?.transactionLogs
            if (logs) console.warn('[WD] Program logs', logs)
            await new Promise(r => setTimeout(r, 1200))
            continue
          }
          // Leaf authority errors bubble up immediately
          throw err
        }
      }
      throw lastErr || new Error('Transfer failed after retries')
    }

    const signature = await sendWithRetry(8)
    return { success: true, signature }
  } catch (error) {
    console.error('❌ cNFT transfer error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Server-signed deposit: wallet first sets delegate = serverSigner, then server moves to playerPDA
export async function depositCNFTFromWalletToPDA(
  assetId: string,
  walletAddress: string,
  playerPDA: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const short = (s: any) => String(s || '').slice(0,8) + '...' + String(s || '').slice(-4)
    console.log('[DEP] Begin deposit', { assetId: short(assetId), wallet: short(walletAddress), playerPDA: short(playerPDA) })
    const proofRpc = getDasUrl() || getRpcUrl()
    const proofUmi = proofRpc ? createUmi(proofRpc).use(mplBubblegum()) : umi
    if (proofRpc) {
      try { (proofUmi as any).use(signerIdentity(serverSigner)) } catch {}
    }
    console.log('[DEP] RPC', { proofRpc: proofRpc || '(umi default)' })

    const pk = publicKey(assetId)

    const fetchStable = async () => {
      const a = await getAssetWithProof(proofUmi, pk, { truncateCanopy: true })
      await new Promise(r => setTimeout(r, 200))
      const b = await getAssetWithProof(proofUmi, pk, { truncateCanopy: true })
      const r1 = String((a as any).root || '')
      const r2 = String((b as any).root || '')
      console.log('[DEP] Proof roots', { r1: short(r1), r2: short(r2), stable: r1 === r2, proofLen: (r1 === r2 ? (b as any)?.proof?.length : (a as any)?.proof?.length) })
      return r1 === r2 ? b : a
    }

    const sendWithRetry = async (retries = 8): Promise<string> => {
      let lastErr: any = null
      for (let i = 0; i < retries; i++) {
        try {
          const proof = await fetchStable()
          const ownerNow = String(proof.leafOwner)
          const delegateNow = String((proof as any)?.leafDelegate || '')
          const idx = (proof as any)?.index ?? (proof as any)?.leafIndex ?? null
          const nonce = (proof as any)?.nonce ?? null
          const root = String((proof as any)?.root || '')
          const pArr: any[] = (proof as any)?.proof || []
          const head = (pArr[0] || '').toString()
          const tail = (pArr[pArr.length - 1] || '').toString()
          console.log('[DEP] Leaf state', {
            owner: short(ownerNow),
            delegate: short(delegateNow),
            index: idx,
            nonce,
            root: short(root),
            proofLen: pArr.length,
            proofHead: short(head),
            proofTail: short(tail)
          })
          if (ownerNow !== String(publicKey(walletAddress))) throw new Error('Deposit: current owner is not the wallet')
          if (delegateNow !== String(serverSigner.publicKey)) throw new Error('Deposit: server is not delegate; run delegate step first')
          const tx = transfer(proofUmi, {
            ...proof,
            leafOwner: publicKey(walletAddress),
            leafDelegate: serverSigner.publicKey,
            newLeafOwner: publicKey(playerPDA),
          })
          console.log('[DEP] Sending tx...', { attempt: i + 1 })
          const res = await tx.sendAndConfirm(proofUmi, { send: { skipPreflight: true }, confirm: { commitment: 'finalized' as any } })
          console.log('[DEP] Tx confirmed')
          const rawSig: any = (res as any)?.signature
          if (typeof rawSig === 'string') return rawSig
          if (rawSig && typeof Buffer !== 'undefined' && typeof require !== 'undefined') {
            const bs58 = require('bs58')
            return bs58.encode(Uint8Array.from(rawSig))
          }
          return String(rawSig || '')
        } catch (err: any) {
          lastErr = err
          const msg = String(err?.message || err)
          if ((err as any)?.transactionLogs) console.warn('[DEP] Program logs', (err as any).transactionLogs)
          if (msg.includes('Invalid root recomputed') || msg.includes('ProgramFailedToComplete') || msg.includes('ConcurrentMerkleTree') || msg.includes('failed to complete')) {
            await new Promise(r => setTimeout(r, 1200))
            continue
          }
          throw err
        }
      }
      throw lastErr || new Error('Deposit transfer failed after retries')
    }

    const sig = await sendWithRetry(8)
    return { success: true, signature: sig }
  } catch (e: any) {
    console.error('❌ depositCNFTFromWalletToPDA error:', e)
    return { success: false, error: e?.message || 'Unknown error' }
  }
}

// Server-signed escrow hop: wallet -> server (requires delegate = serverSigner already set)
export async function depositCNFTFromWalletToServer(
  assetId: string,
  walletAddress: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const proofRpc = getDasUrl() || getRpcUrl()
    const proofUmi = proofRpc ? createUmi(proofRpc).use(mplBubblegum()).use(signerIdentity(serverSigner)) : umi
    const pk = publicKey(assetId)
    const fetchStable = async () => {
      const a = await getAssetWithProof(proofUmi, pk, { truncateCanopy: true })
      await new Promise(r => setTimeout(r, 200))
      const b = await getAssetWithProof(proofUmi, pk, { truncateCanopy: true })
      const r1 = String((a as any).root || '')
      const r2 = String((b as any).root || '')
      return r1 === r2 ? b : a
    }
    const sendWithRetry = async (retries = 8): Promise<string> => {
      let last: any = null
      for (let i = 0; i < retries; i++) {
        try {
          const proof = await fetchStable()
          const ownerNow = String(proof.leafOwner)
          const delegateNow = String((proof as any)?.leafDelegate || '')
          if (ownerNow !== String(publicKey(walletAddress))) throw new Error('Escrow hop: current owner is not wallet')
          if (delegateNow !== String(serverSigner.publicKey)) throw new Error('Escrow hop: server is not delegate')
          const tx = transfer(proofUmi, {
            ...proof,
            leafOwner: publicKey(walletAddress),
            leafDelegate: serverSigner.publicKey,
            newLeafOwner: serverSigner.publicKey,
          })
          const res = await tx.sendAndConfirm(proofUmi, { send: { skipPreflight: true }, confirm: { commitment: 'finalized' as any } })
          const raw: any = (res as any)?.signature
          if (typeof raw === 'string') return raw
          if (raw && typeof Buffer !== 'undefined' && typeof require !== 'undefined') {
            const bs58 = require('bs58')
            return bs58.encode(Uint8Array.from(raw))
          }
          return String(raw || '')
        } catch (e: any) {
          last = e
          const msg = String(e?.message || e)
          if ((e as any)?.transactionLogs) console.warn('[ESCROW] logs', (e as any).transactionLogs)
          if (msg.includes('Invalid root recomputed') || msg.includes('ProgramFailedToComplete') || msg.includes('ConcurrentMerkleTree') || msg.includes('failed to complete')) {
            await new Promise(r => setTimeout(r, 1200))
            continue
          }
          throw e
        }
      }
      throw last || new Error('Escrow hop failed after retries')
    }
    const sig = await sendWithRetry(8)
    return { success: true, signature: sig }
  } catch (e: any) {
    console.error('❌ depositCNFTFromWalletToServer error:', e)
    return { success: false, error: e?.message || 'Unknown error' }
  }
}
// Server-signed final hop: asset must be owned by server wallet; move to playerPDA and attempt to preserve delegate
export async function depositCNFTFromServerToPDA(
  assetId: string,
  playerPDA: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const pk = publicKey(assetId)
    const rpc = getDasUrl() || getRpcUrl()
    const u = rpc ? createUmi(rpc).use(mplBubblegum()).use(signerIdentity(serverSigner)) : umi
    const short = (s: any) => String(s || '').slice(0,8) + '...' + String(s || '').slice(-4)
    console.log('[DEP2] Begin final hop', { assetId: short(assetId), playerPDA: short(playerPDA) })

    const fetchStable = async () => {
      const a = await getAssetWithProof(u, pk, { truncateCanopy: true })
      await new Promise(r => setTimeout(r, 200))
      const b = await getAssetWithProof(u, pk, { truncateCanopy: true })
      const r1 = String((a as any).root || '')
      const r2 = String((b as any).root || '')
      console.log('[DEP2] roots', { r1: short(r1), r2: short(r2), stable: r1 === r2 })
      return r1 === r2 ? b : a
    }

    const sendWithRetry = async (retries = 8): Promise<string> => {
      let last: any = null
      for (let i = 0; i < retries; i++) {
        try {
          const proof = await fetchStable()
          const ownerNow = String(proof.leafOwner)
          console.log('[DEP2] owner', short(ownerNow))
          if (ownerNow !== String(serverSigner.publicKey)) throw new Error('Final hop: owner is not server')

          // Optionally ensure delegate is server (as owner, we can set it)
          try {
            const prevDel = (proof as any)?.leafDelegate || serverSigner.publicKey
            const del = delegate(u as any, {
              ...proof,
              leafOwner: serverSigner as any,
              previousLeafDelegate: publicKey(prevDel),
              newLeafDelegate: serverSigner.publicKey
            })
            await del.sendAndConfirm(u as any, { send: { skipPreflight: true } })
          } catch {}

          const tx = transfer(u, {
            ...proof,
            leafOwner: serverSigner.publicKey,
            leafDelegate: serverSigner.publicKey,
            // Try to preserve delegate across transfer if supported by builder
            // @ts-ignore
            newLeafDelegate: serverSigner.publicKey,
            newLeafOwner: publicKey(playerPDA)
          })
          console.log('[DEP2] sending', { attempt: i + 1 })
          const res = await tx.sendAndConfirm(u, { send: { skipPreflight: true }, confirm: { commitment: 'finalized' as any } })
          const raw: any = (res as any)?.signature
          if (typeof raw === 'string') return raw
          if (raw && typeof Buffer !== 'undefined' && typeof require !== 'undefined') {
            const bs58 = require('bs58')
            return bs58.encode(Uint8Array.from(raw))
          }
          return String(raw || '')
        } catch (e: any) {
          last = e
          const msg = String(e?.message || e)
          if ((e as any)?.transactionLogs) console.warn('[DEP2] logs', (e as any).transactionLogs)
          if (msg.includes('Invalid root recomputed') || msg.includes('ProgramFailedToComplete') || msg.includes('ConcurrentMerkleTree') || msg.includes('failed to complete')) {
            await new Promise(r => setTimeout(r, 1200))
            continue
          }
          throw e
        }
      }
      throw last || new Error('Final hop failed after retries')
    }

    const sig = await sendWithRetry(8)
    return { success: true, signature: sig }
  } catch (e: any) {
    console.error('❌ depositCNFTFromServerToPDA error:', e)
    return { success: false, error: e?.message || 'Unknown error' }
  }
}
// Debug helper: returns current on-chain uri and parsed attributes from the JSON
export async function getAssetMetadataDebug(assetId: string): Promise<{ uri?: string; name?: string; attributes?: any[] }> {
  try {
    const assetWithProof = await getAssetWithProof(umi, publicKey(assetId), { truncateCanopy: true });
    const uri = assetWithProof?.metadata?.uri as string | undefined;
    const name = assetWithProof?.metadata?.name as string | undefined;
    let attributes: any[] | undefined = undefined;
    if (uri) {
      try {
        const res = await fetch(uri)
        if (res.ok) {
          const json: any = await res.json().catch(() => null)
          if (json && Array.isArray((json as any).attributes)) attributes = (json as any).attributes as any[]
        }
      } catch {}
    }
    return { uri, name, attributes };
  } catch {
    return {};
  }
}

// Parse character from metadata (exactly matching frontend logic)
async function parseCharacterFromMetadata(assetWithProof: any): Promise<CharacterStats> {
  const metadata = assetWithProof.metadata;
  
  // Initialize default values (exactly like frontend)
  let characterName = metadata.name || 'Unknown';
  let characterLevel = 1;
  let combatLevel = 1; // Default: all 6 combat skills at level 1 = (1+1+1+1+1+1)/6 = 1
  let totalLevel = 9;
  let characterClass = 'Adventurer';
  let characterVersion = '1.0.0';
  let experience = 0;
  let isV2Format = false;
  
  // Parse name for level info (exactly like frontend)
  // Parse old format: "Name (Level #)" or "Name (Combat #)" - extract just the name
  const nameMatch = characterName.match(/^(.+?)\s*\(Level\s+(\d+)(?:,\s*Combat\s+(\d+))?\)$/) || 
                    characterName.match(/^(.+?)\s*\(Combat\s+(\d+)\)$/);
  if (nameMatch) {
    characterName = nameMatch[1]; // Extract just the name, remove level suffix
    if (nameMatch[2]) characterLevel = parseInt(nameMatch[2]);
    if (nameMatch[3]) {
      combatLevel = parseInt(nameMatch[3]);
      isV2Format = true;
    } else if (nameMatch[2] && !nameMatch[3]) {
      // Handle "Name (Combat #)" format
      combatLevel = parseInt(nameMatch[2]);
      isV2Format = true;
    }
  }
  
  // Initialize skill data (exactly like frontend)
  let skillData: Record<string, { level: number; experience: number }> = {};
  
  // Parse attributes (exactly like frontend skill mapping)
  if (metadata.attributes) {
    const skillMap = {
      // Full names (legacy)
      'Attack': 'attack', 'Strength': 'strength', 'Defense': 'defense',
      'Magic': 'magic', 'Projectiles': 'projectiles', 'Vitality': 'vitality',
      'Crafting': 'crafting', 'Luck': 'luck', 'Mining': 'mining', 'Woodcutting': 'woodcutting', 'Fishing': 'fishing', 'Hunting': 'hunting', 'Smithing': 'smithing', 'Cooking': 'cooking', 'Alchemy': 'alchemy', 'Construction': 'construction',
      // Shortened names (current)
      'Att': 'attack', 'Str': 'strength', 'Def': 'defense', 
      'Mag': 'magic', 'Pro': 'projectiles', 'Vit': 'vitality',
      'Cra': 'crafting', 'Luc': 'luck', 'Min': 'mining', 'Woo': 'woodcutting', 'Fish': 'fishing', 'Hunt': 'hunting', 'Smith': 'smithing', 'Cook': 'cooking', 'Alch': 'alchemy', 'Const': 'construction'
    };
    
    metadata.attributes.forEach((attr: any) => {
      if (skillMap[attr.trait_type as keyof typeof skillMap]) {
        const skillName = skillMap[attr.trait_type as keyof typeof skillMap];
        const level = parseInt(attr.value);
        skillData[skillName] = { level, experience: level * 100 };
      } else if (attr.trait_type === 'Version') {
        characterVersion = attr.value || characterVersion;
        if (characterVersion === '2.0.0' || characterVersion === '2.1.0') {
          isV2Format = true;
        }
      } else if (attr.trait_type === 'Combat Level' || attr.trait_type === 'Level') { // Support both old and new format
        combatLevel = parseInt(attr.value);
      } else if (attr.trait_type === 'Total Level') {
        totalLevel = parseInt(attr.value);
      }
    });
  }
  
  // Try loading from metadata URI if no skills in attributes (exactly like frontend)
  if (Object.keys(skillData).length === 0 && metadata.uri) {
    try {
      console.log('🔍 No skills in attributes, trying metadata URI:', metadata.uri);
      
      // Normalize any metadata URI to this backend (Railway) when possible.
      // If BACKEND_URL is not set, fall back to this server's localhost + PORT so
      // the fetch happens inside the container and never hits external hosts.
      const originalUri = metadata.uri as string;
      let metadataUrl = originalUri;
      const configuredBase = (process.env.BACKEND_URL || '').replace(/\/$/, '');
      const localBase = `http://localhost:${process.env.PORT || 8080}`;
      const backendBase = configuredBase || localBase;
      // Extract metadata id from either legacy 'player-metadata' or newer 'api/metadata' patterns
      const idMatch = (() => {
        const re = /(player-metadata|api\/metadata)\/([^/?#]+)/;
        const m = metadataUrl.match(re);
        return m ? m[2] : '';
      })();
      if (idMatch) {
        const metadataId = idMatch.split(/[?#]/)[0];
        const explicitBase = (process.env.METADATA_URI_BASE || '').replace(/\/$/, '');
        const destBase = explicitBase || `${backendBase}/api/player-metadata`;
        metadataUrl = `${destBase}/${metadataId}`;
        console.log(`🔄 Rewritten metadata URI -> ${metadataUrl}`);
      }
      
      let fetchedJson: any | null = null;
      let response = await fetch(metadataUrl);
      if (!response.ok && originalUri !== metadataUrl) {
        console.log(`⚠️ Rewritten fetch returned ${response.status}. Trying original URI as fallback...`);
        try {
          response = await fetch(originalUri);
        } catch (fallbackErr) {
          console.log('⚠️ Fallback fetch to original URI failed:', fallbackErr);
        }
      }

      if (response && response.ok) {
        const metadataJson = await response.json().catch(() => null);
        fetchedJson = metadataJson;

      // Caching disabled per request
      }

      // Placeholder caching disabled

      if (fetchedJson) {
        const metadataJson = fetchedJson as any;
        
        // Check for characterStats format first (exactly like frontend)
        if (metadataJson.characterStats && metadataJson.characterStats.skills) {
          console.log('✅ Loaded skills from metadata URI (characterStats format)');
          skillData = metadataJson.characterStats.skills;
          if (metadataJson.characterStats.combatLevel) combatLevel = metadataJson.characterStats.combatLevel;
          if (metadataJson.characterStats.totalLevel) totalLevel = metadataJson.characterStats.totalLevel;
          if (metadataJson.characterStats.experience) experience = metadataJson.characterStats.experience;
        }
        // Parse from attributes format (exactly like frontend)
        else if (metadataJson.attributes) {
          console.log('✅ Loaded skills from metadata URI (attributes format)');
          const skillMap = {
            'Att': 'attack', 'Str': 'strength', 'Def': 'defense', 
            'Mag': 'magic', 'Pro': 'projectiles', 'Vit': 'vitality',
            'Cra': 'crafting', 'Luc': 'luck', 'Min': 'mining', 'Woo': 'woodcutting', 'Fish': 'fishing', 'Hunt': 'hunting', 'Smith': 'smithing', 'Cook': 'cooking', 'Alch': 'alchemy', 'Const': 'construction'
          };
          
          metadataJson.attributes.forEach((attr: any) => {
            if (skillMap[attr.trait_type as keyof typeof skillMap]) {
              const skillName = skillMap[attr.trait_type as keyof typeof skillMap];
              const level = parseInt(attr.value);
              skillData[skillName] = { level, experience: level * 100 };
            }
            else if (attr.trait_type === 'Combat Level' || attr.trait_type === 'Level') { // Support both old and new format
              combatLevel = parseInt(attr.value);
            }
            else if (attr.trait_type === 'Total Level') {
              totalLevel = parseInt(attr.value);
            }
          });
        }
      }
    } catch (uriError) {
      console.log('⚠️ Could not load from metadata URI:', uriError);
    }
  }
  
  // Fill in missing skills with defaults (exactly like frontend)
  const defaultSkills = ['attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality', 'crafting', 'luck', 'mining', 'woodcutting', 'fishing', 'hunting', 'smithing', 'cooking', 'alchemy', 'construction'];
  defaultSkills.forEach(skill => {
    if (!skillData[skill]) {
      skillData[skill] = { level: 1, experience: 0 };
    }
  });
  
  // Calculate experience level based on character level (exactly like frontend)
  experience = characterLevel * 100;
  
  // Build character stats object (exactly matching frontend structure)
  return {
    name: characterName,
    combatLevel,
    totalLevel,
    version: characterVersion,
    experience,
    skills: {
      attack: skillData.attack || { level: 1, experience: 0 },
      strength: skillData.strength || { level: 1, experience: 0 },
      defense: skillData.defense || { level: 1, experience: 0 },
      magic: skillData.magic || { level: 1, experience: 0 },
      projectiles: skillData.projectiles || { level: 1, experience: 0 },
      vitality: skillData.vitality || { level: 1, experience: 0 },
      crafting: skillData.crafting || { level: 1, experience: 0 },
      luck: skillData.luck || { level: 1, experience: 0 },
      mining: skillData.mining || { level: 1, experience: 0 },
      woodcutting: skillData.woodcutting || { level: 1, experience: 0 },
      fishing: skillData.fishing || { level: 1, experience: 0 },
      hunting: skillData.hunting || { level: 1, experience: 0 },
      smithing: skillData.smithing || { level: 1, experience: 0 },
      cooking: skillData.cooking || { level: 1, experience: 0 },
      alchemy: skillData.alchemy || { level: 1, experience: 0 },
      construction: skillData.construction || { level: 1, experience: 0 }
    },
    skillExperience: {
      attack: 0,
      strength: 0,
      defense: 0,
      magic: 0,
      projectiles: 0,
      vitality: 0,
      crafting: 0,
      luck: 0,
      mining: 0,
      woodcutting: 0,
      fishing: 0,
      hunting: 0,
      smithing: 0,
      cooking: 0,
      alchemy: 0,
      construction: 0
    }
  };
}

// Store character metadata off-chain (exactly like frontend)
async function storeCharacterMetadata(metadataId: string, characterStats: CharacterStats): Promise<void> {
  try {
    const metadataPayload = {
      name: characterStats.name,
      description: `Character with ${characterStats.totalLevel} total skill levels`,
      image: resolveDefaultCharacterImageUrl(characterStats.name),
      attributes: [
        { trait_type: 'Version', value: characterStats.version || '2.0.0' },
        { trait_type: 'Level', value: characterStats.combatLevel.toString() }, // Changed from "Combat Level" to "Level"
        { trait_type: 'Total Level', value: characterStats.totalLevel.toString() },
        { trait_type: 'Attack', value: characterStats.skills.attack.level.toString() },
        { trait_type: 'Strength', value: characterStats.skills.strength.level.toString() },
        { trait_type: 'Defense', value: characterStats.skills.defense.level.toString() },
        { trait_type: 'Magic', value: characterStats.skills.magic.level.toString() },
        { trait_type: 'Projectiles', value: characterStats.skills.projectiles.level.toString() },
        { trait_type: 'Vitality', value: characterStats.skills.vitality.level.toString() },
        { trait_type: 'Crafting', value: characterStats.skills.crafting.level.toString() },
        { trait_type: 'Luck', value: characterStats.skills.luck.level.toString() },
        { trait_type: 'Mining', value: characterStats.skills.mining.level.toString() },
        { trait_type: 'Woodcutting', value: characterStats.skills.woodcutting.level.toString() },
        { trait_type: 'Fishing', value: characterStats.skills.fishing.level.toString() },
        { trait_type: 'Hunting', value: characterStats.skills.hunting.level.toString() },
        { trait_type: 'Smithing', value: characterStats.skills.smithing.level.toString() },
        { trait_type: 'Cooking', value: characterStats.skills.cooking.level.toString() },
        { trait_type: 'Alchemy', value: characterStats.skills.alchemy.level.toString() },
        { trait_type: 'Construction', value: characterStats.skills.construction.level.toString() }
      ],
      characterStats // Store full character data for fallback
    };
    
    // Store using our metadata service directly (no need for HTTP call)
    const { MetadataStore } = await import('../services/database');
    MetadataStore.set(metadataId, metadataPayload);
    
    console.log('✅ Character metadata stored successfully');
    
  } catch (error) {
    console.error('⚠️ Error storing character metadata:', error);
    throw error;
  }
}