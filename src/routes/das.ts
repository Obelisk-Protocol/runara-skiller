import { Router } from 'express'
import { supabase } from '../config/database'

const router = Router()

// POST /api/das/get-assets-by-owner
router.post('/get-assets-by-owner', async (req: any, res: any) => {
  try {
    const { ownerAddress, merkleTree, page = 1, limit = 50 } = req.body || {}
    if (!ownerAddress) {
      return res.status(400).json({ success: false, error: 'Missing ownerAddress' })
    }

    const rpcUrl = process.env.DAS_RPC_URL || process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || ''
    if (!rpcUrl) {
      return res.status(500).json({ success: false, error: 'SOLANA_RPC_URL not configured' })
    }

    const body = {
      jsonrpc: '2.0',
      id: 'getAssetsByOwner',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress,
        page,
        limit
      }
    } as any

    const rpcRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const json: any = await rpcRes.json()
    if (json?.error) {
      return res.json({ success: true, assets: [], message: 'DAS error', details: json.error })
    }

    let items = json?.result?.items || []
    if (merkleTree) {
      items = items.filter((a: any) => a?.compression?.tree === merkleTree)
    }
    return res.json({ success: true, assets: items, total: items.length, ownerAddress, merkleTree: merkleTree || null })
  } catch (err) {
    console.error('❌ get-assets-by-owner error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// POST /api/das/extract-asset-id
// Params: signature (string), playerId or playerPDA, merkleTree (optional)
router.post('/extract-asset-id', async (req: any, res: any) => {
  try {
    const { signature, playerId, playerPDA, merkleTree } = req.body || {}
    if (!signature) {
      return res.status(400).json({ success: false, error: 'Missing signature' })
    }

    const rpcUrl = process.env.DAS_RPC_URL || process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || ''
    if (!rpcUrl) {
      return res.status(500).json({ success: false, error: 'SOLANA_RPC_URL not configured' })
    }

    const txBody = {
      jsonrpc: '2.0',
      id: 'getTransaction',
      method: 'getTransaction',
      params: [
        signature,
        {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        }
      ]
    }

    const txRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txBody)
    })
    const txJson: any = await txRes.json()
    const tx = txJson?.result
    if (!tx) {
      return res.status(404).json({ success: false, error: 'Transaction not found' })
    }

    // Heuristic parsing similar to old API
    const logs: string[] = tx?.meta?.logMessages || []
    let leafIndex: number | null = null
    for (const log of logs) {
      const m = String(log).match(/leaf.*?index.*?(\d+)|index.*?(\d+)/i)
      if (m) {
        leafIndex = parseInt(m[1] || m[2])
        break
      }
    }

    // Try to pick an asset account from accountKeys
    const accountKeys: string[] = (tx?.transaction?.message?.staticAccountKeys || tx?.transaction?.message?.accountKeys || []).map((k: any) => (typeof k === 'string' ? k : k?.toString?.()))
    let assetId: string | null = null
    for (let i = 0; i < accountKeys.length; i++) {
      const key = accountKeys[i]
      if (!key) continue
      if (key === merkleTree) continue
      if (key === '11111111111111111111111111111111') continue
      if (key === 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV') continue
      if (key.length >= 32 && i > 5) { assetId = key; break }
    }
    if (!assetId) {
      // Deterministic fallback (not ideal, matches old behavior)
      assetId = `${String(signature).slice(0, 32)}${leafIndex ?? '0'}`
    }

    // Save into first empty character slot for this profile
    const idFilter = playerId ? { col: 'id', val: playerId } : playerPDA ? { col: 'player_pda', val: playerPDA } : null
    if (idFilter) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5')
        .eq(idFilter.col, idFilter.val)
        .single()
      if (profile) {
        const updateData: any = {}
        if (!profile.character_cnft_1) updateData.character_cnft_1 = assetId
        else if (!profile.character_cnft_2) updateData.character_cnft_2 = assetId
        else if (!profile.character_cnft_3) updateData.character_cnft_3 = assetId
        else if (!profile.character_cnft_4) updateData.character_cnft_4 = assetId
        else if (!profile.character_cnft_5) updateData.character_cnft_5 = assetId
        if (Object.keys(updateData).length > 0) {
          await supabase.from('profiles').update(updateData).eq(idFilter.col, idFilter.val)
        }
      }
    }

    return res.json({ success: true, assetId, leafIndex, merkleTree: merkleTree || null, transactionSignature: signature })
  } catch (err) {
    console.error('❌ extract-asset-id error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// POST /api/das/resolve-from-signature { signature, playerPDA?, playerId? }
router.post('/resolve-from-signature', async (req: any, res: any) => {
  try {
    const { signature, playerPDA, playerId } = req.body || {}
    if (!signature) return res.status(400).json({ success: false, error: 'Missing signature' })
    const heliusUrl = process.env.HELIUS_API_URL
    if (!heliusUrl) return res.status(500).json({ success: false, error: 'HELIUS_API_URL not configured' })

    // Helius enhanced transactions API
    const txRes = await fetch(heliusUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [signature] })
    })
    const txJson: any = await txRes.json()
    const entry = Array.isArray(txJson) ? txJson[0] : null
    const compressed = entry?.events?.compressed
    const assetId = compressed?.assetId || compressed?.assetIds?.[0] || null
    if (!assetId) return res.status(404).json({ success: false, error: 'Compressed assetId not found in enhanced tx' })

    // Save to first empty slot if player provided
    const filter = playerPDA ? { col: 'player_pda', val: playerPDA } : playerId ? { col: 'id', val: playerId } : null
    if (filter) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5')
        .eq(filter.col, filter.val)
        .single()
      if (profile) {
        const updateData: any = {}
        if (!profile.character_cnft_1) updateData.character_cnft_1 = assetId
        else if (!profile.character_cnft_2) updateData.character_cnft_2 = assetId
        else if (!profile.character_cnft_3) updateData.character_cnft_3 = assetId
        else if (!profile.character_cnft_4) updateData.character_cnft_4 = assetId
        else if (!profile.character_cnft_5) updateData.character_cnft_5 = assetId
        if (Object.keys(updateData).length > 0) {
          await supabase.from('profiles').update(updateData).eq(filter.col, filter.val)
        }
      }
    }
    return res.json({ success: true, assetId })
  } catch (err) {
    console.error('❌ resolve-from-signature error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

export default router



