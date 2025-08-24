// Optional Bundlr import – fall back to Pinata when unavailable
let Bundlr: any
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Bundlr = require('@bundlr-network/client')
} catch (_) {
  Bundlr = null
}

export interface UploadResult {
  uri: string
}

// Caching disabled per request – always read from Arweave directly

function getBundlr() {
  const bundlrNode = process.env.BUNDLR_NODE || 'https://node1.bundlr.network'
  const currency = process.env.BUNDLR_CURRENCY || 'solana'
  const secret = process.env.BUNDLR_SECRET
  if (!secret) throw new Error('BUNDLR_SECRET not configured')
  // Secret is server wallet secret key JSON array
  const key = JSON.parse(secret)
  return new Bundlr(bundlrNode, currency, key)
}

export async function uploadJsonToArweave(jsonPayload: any): Promise<UploadResult> {
  if (!Bundlr) {
    // Lightweight fallback uploader using Pinata public gateway (requires PINATA_JWT)
    const token = process.env.PINATA_JWT
    if (!token) throw new Error('Bundlr not installed and PINATA_JWT missing')
    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(jsonPayload)
    })
    if (!res.ok) throw new Error(`Pinata upload failed: ${res.status}`)
    const j: any = await res.json()
    const cid = j?.IpfsHash
    if (!cid) throw new Error('Pinata missing IpfsHash')
    return { uri: `https://gateway.pinata.cloud/ipfs/${cid}` }
  }
  const bundlr = getBundlr()
  // Ensure client is ready
  // @ts-ignore
  if (typeof (bundlr as any).ready === 'function') {
    await (bundlr as any).ready()
  }
  const data = Buffer.from(JSON.stringify(jsonPayload))
  const tx = (bundlr as any).createTransaction(data, { tags: [{ name: 'Content-Type', value: 'application/json' }] })
  await tx.sign()
  await tx.upload()
  const uri = `https://arweave.net/${tx.id}`
  return { uri }
}

export async function uploadImageToArweave(imageBuffer: Buffer, contentType: string = 'image/png'): Promise<UploadResult> {
  if (!Bundlr) {
    const token = process.env.PINATA_JWT
    if (!token) throw new Error('Bundlr not installed and PINATA_JWT missing')
    const data = new Blob([imageBuffer], { type: contentType }) as any
    const form = new (global as any).FormData()
    ;(form as any).append('file', data, 'image')
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form as any
    })
    if (!res.ok) throw new Error(`Pinata upload failed: ${res.status}`)
    const j: any = await res.json()
    const cid = j?.IpfsHash
    if (!cid) throw new Error('Pinata missing IpfsHash')
    return { uri: `https://gateway.pinata.cloud/ipfs/${cid}` }
  }
  const bundlr = getBundlr()
  // @ts-ignore
  if (typeof (bundlr as any).ready === 'function') {
    await (bundlr as any).ready()
  }
  const tx = (bundlr as any).createTransaction(imageBuffer, { tags: [{ name: 'Content-Type', value: contentType }] })
  await tx.sign()
  await tx.upload()
  const uri = `https://arweave.net/${tx.id}`
  return { uri }
}


