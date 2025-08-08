import Bundlr from '@bundlr-network/client'

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


