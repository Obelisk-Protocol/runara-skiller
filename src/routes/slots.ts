import { Router } from 'express'
import { supabase } from '../config/database'

const router = Router()

// GET /api/slots/:playerIdOrPDA - fetch slots and active slot
router.get('/:player', async (req: any, res: any) => {
  try {
    const player = req.params.player
    if (!player) return res.status(400).json({ success: false, error: 'Missing player' })
    // try by id then by player_pda
    let { data: profile, error } = await supabase
      .from('profiles')
      .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot')
      .eq('id', player)
      .single()
    if (error || !profile) {
      const alt = await supabase
        .from('profiles')
        .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot')
        .eq('player_pda', player)
        .single()
      profile = alt.data as any
    }
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' })
    const slots = [1,2,3,4,5].map(i => ({
      slot: i,
      assetId: (profile as any)[`character_cnft_${i}`] || null
    }))
    return res.json({ success: true, slots, activeSlot: profile.active_character_slot })
  } catch (err) {
    console.error('❌ slots get error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// POST /api/slots - { action: 'add'|'remove'|'setActive', player, slot?, assetId? }
router.post('/', async (req: any, res: any) => {
  try {
    const { action, player, slot, assetId } = req.body || {}
    if (!action || !player) return res.status(400).json({ success: false, error: 'Missing action or player' })
    const idFilter = { col: 'id', val: player }
    let { data: profile } = await supabase
      .from('profiles')
      .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot')
      .eq(idFilter.col, idFilter.val)
      .single()
    if (!profile) {
      const alt = await supabase
        .from('profiles')
        .select('character_cnft_1, character_cnft_2, character_cnft_3, character_cnft_4, character_cnft_5, active_character_slot')
        .eq('player_pda', player)
        .single()
      profile = alt.data as any
    }
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' })

    if (action === 'add') {
      if (!assetId) return res.status(400).json({ success: false, error: 'assetId required' })
      const updateData: any = {}
      if (!profile.character_cnft_1) updateData.character_cnft_1 = assetId
      else if (!profile.character_cnft_2) updateData.character_cnft_2 = assetId
      else if (!profile.character_cnft_3) updateData.character_cnft_3 = assetId
      else if (!profile.character_cnft_4) updateData.character_cnft_4 = assetId
      else if (!profile.character_cnft_5) updateData.character_cnft_5 = assetId
      if (Object.keys(updateData).length === 0) return res.status(400).json({ success: false, error: 'All character slots are full' })
      if (!profile.active_character_slot) updateData.active_character_slot = Number(Object.keys(updateData)[0].split('_').pop())
      await supabase.from('profiles').update(updateData).or(`id.eq.${player},player_pda.eq.${player}`)
      return res.json({ success: true, message: 'Character added to slot' })
    }

    if (action === 'remove') {
      if (!slot || slot < 1 || slot > 5) return res.status(400).json({ success: false, error: 'Invalid slot' })
      const updateData: any = {}
      updateData[`character_cnft_${slot}`] = null
      if (profile.active_character_slot === slot) updateData.active_character_slot = null
      await supabase.from('profiles').update(updateData).or(`id.eq.${player},player_pda.eq.${player}`)
      return res.json({ success: true, message: `Character removed from slot ${slot}` })
    }

    if (action === 'setActive') {
      if (!slot || slot < 1 || slot > 5) return res.status(400).json({ success: false, error: 'Invalid slot' })
      if (!(profile as any)[`character_cnft_${slot}`]) return res.status(400).json({ success: false, error: 'No character in that slot' })
      await supabase.from('profiles').update({ active_character_slot: slot }).or(`id.eq.${player},player_pda.eq.${player}`)
      return res.json({ success: true, activeSlot: slot })
    }

    return res.status(400).json({ success: false, error: 'Invalid action' })
  } catch (err) {
    console.error('❌ slots post error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

export default router


