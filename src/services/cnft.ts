import {
  getAssetWithProof,
  mintToCollectionV1,
  updateMetadata,
  transfer,
  burn,
  delegate,
  mplBubblegum
} from '@metaplex-foundation/mpl-bubblegum';
import { 
  publicKey, 
  some, 
  none,
  generateSigner,
  signerIdentity
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { umi, serverSigner, COLLECTION_MINT, MERKLE_TREE, getDasUrl, getRpcUrl } from '../config/solana';
import { CharacterStats, Character } from '../types/character';
import { uploadJsonToArweave } from './storage';

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
    combatLevel: 3, // Default combat level (Attack + Strength + Defense)
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
      farming: { level: 1, experience: 0 },
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
      farming: 0,
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

async function pollForAssetIdViaDAS(
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
  characterName: string
): Promise<{ success: boolean; assetId?: string; signature?: string; error?: string }> {
  try {
    console.log('🎯 Creating character cNFT for:', playerPDA);
    
    // Generate character stats
    const characterStats = generateDefaultCharacterStats(characterName);
    
    // Build Metaplex JSON and upload to Arweave
    const imageUrl = resolveDefaultCharacterImageUrl(characterName)
    console.log('[IMG] createCharacterCNFT imageUrl', imageUrl)
    const jsonPayload = {
      name: `${characterName} (Combat ${characterStats.combatLevel})`,
      symbol: 'PLAYER',
      description: `Character with ${characterStats.totalLevel} total skill levels`,
      image: imageUrl,
      external_url: 'https://obeliskparadox.com',
      attributes: [
        { trait_type: 'Version', value: characterStats.version || '2.0.0' },
        { trait_type: 'Combat Level', value: characterStats.combatLevel.toString() },
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
        { trait_type: 'Farming', value: characterStats.skills.farming.level.toString() },
        { trait_type: 'Hunting', value: characterStats.skills.hunting.level.toString() },
        { trait_type: 'Smithing', value: characterStats.skills.smithing.level.toString() },
        { trait_type: 'Cooking', value: characterStats.skills.cooking.level.toString() },
        { trait_type: 'Alchemy', value: characterStats.skills.alchemy.level.toString() },
        { trait_type: 'Construction', value: characterStats.skills.construction.level.toString() }
      ],
      properties: {
        files: [ { uri: imageUrl, type: imageUrl.endsWith('.png') ? 'image/png' : 'image/svg+xml' } ]
      }
    }
    const { uri: metadataUri } = await uploadJsonToArweave(jsonPayload)
    console.log('[IMG] createCharacterCNFT metadataUri', metadataUri)
    
    // Build Metaplex standard metadata (exactly like frontend)
    const displayName = `${characterName} (Combat ${characterStats.combatLevel})`;
    
    const metadata = {
      name: displayName,
      symbol: 'PLAYER',
      uri: metadataUri,
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

    // Mint the cNFT (exactly like frontend)
    console.log('🌱 Minting character cNFT...');
    const mintTx = await mintToCollectionV1(umi, {
      leafOwner: publicKey(playerPDA),
      leafDelegate: serverSigner.publicKey,
      merkleTree: publicKey(MERKLE_TREE),
      collectionMint: publicKey(COLLECTION_MINT),
      metadata
    }).sendAndConfirm(umi);

    console.log('✅ Character cNFT minted successfully');
    // Ensure we have a base58 signature string (Umi may return Uint8Array)
    const rawSig: any = (mintTx as any)?.signature
    let mintSignature = ''
    try {
      if (typeof rawSig === 'string') mintSignature = rawSig
      else if (rawSig && typeof Buffer !== 'undefined' && typeof require !== 'undefined') {
        const bs58 = require('bs58')
        mintSignature = bs58.encode(Uint8Array.from(rawSig))
      }
    } catch {}
    console.log('🔗 Transaction:', mintSignature || rawSig);
    
    // Try fast path: resolve via Helius enhanced transactions
    let resolvedAssetId: string | null = null;
    const heliusFast = await resolveAssetIdViaHelius(mintSignature)
    if (heliusFast) {
      console.log('🆔 Resolved asset ID via Helius:', heliusFast)
      resolvedAssetId = heliusFast
    } else {
      // Fallback: short DAS poll (do not block for long)
      try {
        console.log('⏳ Helius failed or not configured. Short DAS poll...')
        resolvedAssetId = await pollForAssetIdViaDAS(playerPDA, Number(process.env.DAS_RESOLVE_TIMEOUT_MS || 15000), Number(process.env.DAS_RESOLVE_INTERVAL_MS || 3000))
        if (resolvedAssetId) console.log('🆔 Resolved asset ID via DAS:', resolvedAssetId)
        else console.warn('⚠️ Could not resolve asset ID via DAS within timeout')
      } catch (e) {
        console.warn('⚠️ Asset ID resolution failed:', e)
      }
    }
    
    return {
      success: true,
      assetId: resolvedAssetId || undefined,
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

// Update character cNFT metadata (exactly matching your frontend logic)
export async function updateCharacterCNFT(
  assetId: string,
  characterStats: CharacterStats,
  playerPDA?: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    // Guard against mock/placeholder asset IDs
    if (!assetId || assetId.startsWith('cnft-') || assetId.length < 32) {
      return { success: false, error: 'Invalid or mock asset ID; cannot update metadata' };
    }
    console.log('🔄 Starting cNFT metadata update for:', assetId);
    
    // Fetch asset with proof (with retry logic like frontend)
    const fetchAssetWithRetry = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`🔄 Attempt ${i + 1}/${retries} to fetch asset proof...`);
          const asset = await getAssetWithProof(umi, publicKey(assetId), {
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

    const assetWithProof = await fetchAssetWithRetry();
    if (!assetWithProof) {
      throw new Error('Failed to fetch asset proof');
    }
    
    // Merge incoming characterStats with current on-chain to prevent accidental regressions
    // when multiple quick updates happen in sequence.
    try {
      const currentParsed = await parseCharacterFromMetadata(assetWithProof);
      const skillKeys = ['attack','strength','defense','magic','projectiles','vitality','crafting','luck','mining','woodcutting','fishing','farming','hunting','smithing','cooking','alchemy','construction'] as const;
      const mergedSkills: any = { ...characterStats.skills };
      for (const k of skillKeys) {
        const incoming = (characterStats.skills as any)[k]?.level ?? 1;
        const onchain = (currentParsed.skills as any)[k]?.level ?? 1;
        mergedSkills[k] = { level: Math.max(incoming, onchain), experience: ((Math.max(incoming, onchain)) * 100) };
      }
      // Recompute derived fields from merged skills
      const att = mergedSkills.attack.level, str = mergedSkills.strength.level, def = mergedSkills.defense.level;
      const mag = mergedSkills.magic.level, pro = mergedSkills.projectiles.level, vit = mergedSkills.vitality.level;
      const totalLevel = att + str + def + mag + pro + vit + mergedSkills.crafting.level + mergedSkills.luck.level + 
                        mergedSkills.mining.level + mergedSkills.woodcutting.level + mergedSkills.fishing.level + 
                        mergedSkills.farming.level + mergedSkills.hunting.level + mergedSkills.smithing.level + 
                        mergedSkills.cooking.level + mergedSkills.alchemy.level + mergedSkills.construction.level;
      const melee = (att + str + def) / 3;
      const magicStyle = (mag * 1.5 + def) / 2.5;
      const projectileStyle = (pro + def) / 2;
      const combatLevel = Math.floor(Math.max(melee, magicStyle, projectileStyle) + vit * 0.25);
      characterStats = {
        ...characterStats,
        skills: mergedSkills,
        totalLevel,
        combatLevel,
      } as any;
    } catch (_) {
      // If merge fails, continue with provided stats
    }
    
    // Build new JSON and upload to Arweave (production standard)
    const imageUrl = resolveDefaultCharacterImageUrl(characterStats.name)
    console.log('[IMG] updateCharacterCNFT imageUrl', imageUrl)
    const jsonPayload = {
      name: `${characterStats.name} (Combat ${characterStats.combatLevel || 1})`,
      symbol: 'PLAYER',
      description: `Character with ${characterStats.totalLevel} total skill levels`,
      image: imageUrl,
      external_url: 'https://obeliskparadox.com',
      attributes: [
        { trait_type: 'Version', value: characterStats.version || '2.0.0' },
        ...(characterStats.combatLevel != null ? [{ trait_type: 'Combat Level', value: characterStats.combatLevel.toString() }] : []),
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
        { trait_type: 'Farming', value: (characterStats.skills.farming?.level ?? 1).toString() },
        { trait_type: 'Hunting', value: (characterStats.skills.hunting?.level ?? 1).toString() },
        { trait_type: 'Smithing', value: (characterStats.skills.smithing?.level ?? 1).toString() },
        { trait_type: 'Cooking', value: (characterStats.skills.cooking?.level ?? 1).toString() },
        { trait_type: 'Alchemy', value: (characterStats.skills.alchemy?.level ?? 1).toString() },
        { trait_type: 'Construction', value: (characterStats.skills.construction?.level ?? 1).toString() }
      ],
      properties: { files: [ { uri: imageUrl, type: 'image/svg+xml' } ] },
      // Include full stats to guarantee skill visibility even if a reader ignores attributes
      characterStats
    }
    const { uri: newUri } = await uploadJsonToArweave(jsonPayload)
    console.log('[IMG] updateCharacterCNFT metadataUri', newUri)
    
    // Generate display name with combat level (exactly like frontend)
    const combatLevel = characterStats.combatLevel;
    const shouldIncludeCombat = (combatLevel !== null && combatLevel !== undefined);
    const displayName = shouldIncludeCombat ? 
      `${characterStats.name} (Combat ${combatLevel})` : 
      `${characterStats.name}`;
      
    console.log(`🔧 Name generation: shouldIncludeCombat=${shouldIncludeCombat}, displayName="${displayName}"`);
    
    // Store detailed character data off-chain (dev fallback only)
    // await storeCharacterMetadata(metadataId, characterStats);

    // On-chain update: keep the instruction size small to avoid exceeding
    // the Bubblegum transaction size limit. Update only the URI on-chain;
    // the new JSON contains the updated name/levels for indexers.
    const updateArgs: any = {
      name: none<string>(),
      uri: some(newUri)
    };
    
    // Determine leaf owner (exactly like frontend)
    const leafOwner = playerPDA ? publicKey(playerPDA) : assetWithProof.leafOwner;
    console.log(`🎯 Using leaf owner: ${leafOwner}`);
    
    // Build update transaction
    let updateTx = updateMetadata(umi, {
      ...assetWithProof,
      leafOwner: leafOwner,
      currentMetadata: assetWithProof.metadata,
      updateArgs,
      collectionMint: publicKey(COLLECTION_MINT)
    });

    // Send with retry; handle stale proof by refetching and rebuilding
    console.log('🚀 Sending metadata update transaction...');
    const sendWithRetry = async (retries = 2) => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const res = await updateTx.sendAndConfirm(umi, { send: { skipPreflight: false } });
          return res;
        } catch (err: any) {
          const msg = typeof err?.message === 'string' ? err.message : String(err);
          console.warn(`❌ Update attempt ${attempt + 1} failed: ${msg}`);
          if (msg.includes('Invalid root recomputed') && attempt < retries - 1) {
            console.log('🔄 Detected stale proof; refetching assetWithProof and rebuilding tx...');
            const fresh = await getAssetWithProof(umi, publicKey(assetId), { truncateCanopy: true });
            updateTx = updateMetadata(umi, {
              ...fresh,
              leafOwner,
              currentMetadata: fresh.metadata,
              updateArgs,
              collectionMint: publicKey(COLLECTION_MINT)
            });
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          if (attempt === retries - 1) throw err;
        }
      }
    };
    const result = await sendWithRetry();
    const sig = (result as any)?.signature;
    console.log('✅ Metadata update completed! Signature:', sig);
    
    // Post-update confirmation: wait until the on-chain URI reflects the new Arweave URL.
    // This avoids UI reading stale content due to indexer lag or proof staleness.
    try {
      const expectedUri = newUri;
      const confirmStart = Date.now();
      const confirmTimeoutMs = Number(process.env.UPDATE_CONFIRM_TIMEOUT_MS || 20000);
      const confirmIntervalMs = Number(process.env.UPDATE_CONFIRM_INTERVAL_MS || 2000);
      let confirmed = false;
      while (Date.now() - confirmStart < confirmTimeoutMs) {
        try {
          const fresh = await getAssetWithProof(umi, publicKey(assetId), { truncateCanopy: true });
          const onChainUri = fresh?.metadata?.uri as string | undefined;
          if (onChainUri && onChainUri === expectedUri) {
            confirmed = true;
            break;
          }
        } catch (_) {
          // ignore and retry
        }
        await new Promise(r => setTimeout(r, confirmIntervalMs));
      }
      if (!confirmed) {
        console.warn('⚠️ Post-update confirmation timed out; UI may briefly show stale data.');
      } else {
        console.log('✅ Post-update confirmation: on-chain URI matches new Arweave URL');
      }
      // Best-effort: warm Arweave/CDN cache of the new JSON
      try { await fetch(`${newUri}${newUri.includes('?') ? '&' : '?'}t=${Date.now()}`, { method: 'GET' }); } catch {}
    } catch (_) {
      // non-fatal
    }
    
    // Sync the updated character to the database
    try {
      console.log('🔄 Syncing updated character to database...');
      const { CharacterService } = await import('./character');
      await CharacterService.syncCharacterFromCNFT(assetId);
      console.log('✅ Character synced to database successfully');
    } catch (dbError) {
      console.error('❌ Failed to sync character to database:', dbError);
      // Don't fail the entire operation if database sync fails
    }
    
    return { success: true, signature: sig ? String(sig) : undefined };
    
  } catch (error) {
    console.error('❌ cNFT metadata update error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
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
          params: { id: assetId }
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
  let combatLevel = 3;
  let totalLevel = 9;
  let characterClass = 'Adventurer';
  let characterVersion = '1.0.0';
  let experience = 0;
  let isV2Format = false;
  
  // Parse name for level info (exactly like frontend)
  const nameMatch = characterName.match(/^(.+?)\s*\(Level\s+(\d+)(?:,\s*Combat\s+(\d+))?\)$/);
  if (nameMatch) {
    characterName = nameMatch[1];
    characterLevel = parseInt(nameMatch[2]);
    if (nameMatch[3]) {
      combatLevel = parseInt(nameMatch[3]);
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
      'Crafting': 'crafting', 'Luck': 'luck', 'Mining': 'mining', 'Woodcutting': 'woodcutting', 'Fishing': 'fishing', 'Farming': 'farming', 'Hunting': 'hunting', 'Smithing': 'smithing', 'Cooking': 'cooking', 'Alchemy': 'alchemy', 'Construction': 'construction',
      // Shortened names (current)
      'Att': 'attack', 'Str': 'strength', 'Def': 'defense', 
      'Mag': 'magic', 'Pro': 'projectiles', 'Vit': 'vitality',
      'Cra': 'crafting', 'Luc': 'luck', 'Min': 'mining', 'Woo': 'woodcutting', 'Fish': 'fishing', 'Farm': 'farming', 'Hunt': 'hunting', 'Smith': 'smithing', 'Cook': 'cooking', 'Alch': 'alchemy', 'Const': 'construction'
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
      } else if (attr.trait_type === 'Combat Level') {
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
            'Cra': 'crafting', 'Luc': 'luck', 'Min': 'mining', 'Woo': 'woodcutting', 'Fish': 'fishing', 'Farm': 'farming', 'Hunt': 'hunting', 'Smith': 'smithing', 'Cook': 'cooking', 'Alch': 'alchemy', 'Const': 'construction'
          };
          
          metadataJson.attributes.forEach((attr: any) => {
            if (skillMap[attr.trait_type as keyof typeof skillMap]) {
              const skillName = skillMap[attr.trait_type as keyof typeof skillMap];
              const level = parseInt(attr.value);
              skillData[skillName] = { level, experience: level * 100 };
            }
            else if (attr.trait_type === 'Combat Level') {
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
  const defaultSkills = ['attack', 'strength', 'defense', 'magic', 'projectiles', 'vitality', 'crafting', 'luck', 'mining', 'woodcutting', 'fishing', 'farming', 'hunting', 'smithing', 'cooking', 'alchemy', 'construction'];
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
      farming: skillData.farming || { level: 1, experience: 0 },
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
      farming: 0,
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
        { trait_type: 'Combat Level', value: characterStats.combatLevel.toString() },
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
        { trait_type: 'Farming', value: characterStats.skills.farming.level.toString() },
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