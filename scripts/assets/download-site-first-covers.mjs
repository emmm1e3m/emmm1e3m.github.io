import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const manifestPath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/site-firsts.source.json',
)
const lockPath = resolve(workspaceRoot, 'research/travelling-bingo/data/site-firsts.lock.json')
const originalsRoot = resolve(workspaceRoot, 'resources/raw/travelling-bingo/site-firsts/originals')

function resolveOriginal(relativePath) {
  const target = resolve(workspaceRoot, relativePath)
  if (target !== originalsRoot && !target.startsWith(`${originalsRoot}${sep}`)) {
    throw new Error(`拒绝访问全站第一原图目录以外的路径：${relativePath}`)
  }
  return target
}

async function ensureFallbackCover(item) {
  const target = resolveOriginal(item.originalPath)
  try {
    return await readFile(target)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    if (item.posterKind !== 'video-cover-fallback') {
      throw new Error(`${item.id} 的设计海报原件缺失：${item.originalPath}`, {
        cause: error,
      })
    }
  }

  const response = await fetch(item.sourceCoverUrl, {
    headers: {
      Referer: item.sourceVideoUrl,
      'User-Agent': 'TravellingBingoAssetPipeline/1.0',
    },
  })
  if (!response.ok) throw new Error(`${item.id} 封面下载失败：HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`${item.id} 封面响应不是图片：${contentType || 'unknown'}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  await sharp(bytes, { failOn: 'error' }).metadata()
  await mkdir(dirname(target), { recursive: true })
  const temporaryTarget = `${target}.download`
  try {
    await rm(temporaryTarget, { force: true })
    await writeFile(temporaryTarget, bytes, { flag: 'wx' })
    await rename(temporaryTarget, target)
  } finally {
    await rm(temporaryTarget, { force: true })
  }
  return bytes
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (manifest.items.length !== 8) throw new Error('全站第一清单必须恰好包含 8 项')

const lockedItems = []
for (const item of manifest.items) {
  const bytes = await ensureFallbackCover(item)
  lockedItems.push({
    id: item.id,
    bvid: item.bvid,
    posterKind: item.posterKind,
    originalPath: item.originalPath,
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
}

await writeFile(
  lockPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      catalogId: manifest.catalogId,
      verifiedAt: new Date().toISOString(),
      itemCount: lockedItems.length,
      items: lockedItems,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log('完成：8 项全站第一原件齐全，两个缺失海报已使用 B 站原始封面补齐')
