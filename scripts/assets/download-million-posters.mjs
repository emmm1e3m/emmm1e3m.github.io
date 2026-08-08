import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const manifestPath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/million-shot-posters.source.json',
)
const lockPath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/million-shot-posters.lock.json',
)
const rawRoot = resolve(workspaceRoot, 'resources/raw/travelling-bingo/million-shots')

function resolveRawTarget(relativePath) {
  const target = resolve(workspaceRoot, relativePath)
  if (target !== rawRoot && !target.startsWith(`${rawRoot}${sep}`)) {
    throw new Error(`拒绝写入原图目录以外的路径：${relativePath}`)
  }
  return target
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Referer: 'https://weibo.com/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TravellingBingoAssetPipeline/1.0',
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.toLowerCase().startsWith('image/')) {
        throw new Error(`响应不是图片：${contentType || 'unknown'}`)
      }
      return { bytes: Buffer.from(await response.arrayBuffer()), contentType }
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((done) => setTimeout(done, attempt * 500))
      }
    }
  }
  throw lastError
}

async function inspect(bytes) {
  const metadata = await sharp(bytes, { failOn: 'error' }).metadata()
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error('无法读取图片尺寸或格式')
  }
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function downloadItem(item) {
  const target = resolveRawTarget(item.originalPath)
  await mkdir(dirname(target), { recursive: true })

  let bytes
  let contentType = 'image/jpeg'
  try {
    await stat(target)
    bytes = await readFile(target)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const downloaded = await fetchWithRetry(item.sourceImageUrl)
    bytes = downloaded.bytes
    contentType = downloaded.contentType
    const temporaryTarget = `${target}.download`
    try {
      await rm(temporaryTarget, { force: true })
      await writeFile(temporaryTarget, bytes, { flag: 'wx' })
      await rename(temporaryTarget, target)
    } finally {
      await rm(temporaryTarget, { force: true })
    }
  }

  const details = await inspect(bytes)
  const reportedDimensionsMatch =
    details.width === item.reportedWidth && details.height === item.reportedHeight
  if (!reportedDimensionsMatch) {
    console.warn(
      `${item.id}：接口标注 ${item.reportedWidth}x${item.reportedHeight}，原图实际 ${details.width}x${details.height}`,
    )
  }

  return {
    id: item.id,
    sequence: item.sequence,
    originalPath: item.originalPath,
    sourceImageUrl: item.sourceImageUrl,
    contentType,
    reportedWidth: item.reportedWidth,
    reportedHeight: item.reportedHeight,
    reportedDimensionsMatch,
    ...details,
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (!Array.isArray(manifest.items) || manifest.items.length !== 30) {
  throw new Error(`素材清单必须恰好包含 30 项，当前为 ${manifest.items?.length ?? 0}`)
}

const results = []
for (let index = 0; index < manifest.items.length; index += 4) {
  const batch = manifest.items.slice(index, index + 4)
  results.push(...(await Promise.all(batch.map(downloadItem))))
  console.log(`已核验 ${Math.min(index + batch.length, manifest.items.length)}/30`)
}

await writeFile(
  lockPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      catalogId: manifest.catalogId,
      verifiedAt: new Date().toISOString(),
      itemCount: results.length,
      items: results,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

const totalBytes = results.reduce((sum, item) => sum + item.byteLength, 0)
console.log(`完成：30 张海报，共 ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`)
