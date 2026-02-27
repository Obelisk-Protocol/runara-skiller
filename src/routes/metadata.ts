import { Router } from 'express'

const router = Router()

// GET /api/metadata/:id
router.get('/:id', async (req: any, res: any) => {
  return res.status(410).json({ error: 'Local metadata caching disabled' })
})

// POST /api/metadata/:id
router.post('/:id', async (req: any, res: any) => {
  return res.status(410).json({ success: false, error: 'Local metadata caching disabled' })
})

export default router


