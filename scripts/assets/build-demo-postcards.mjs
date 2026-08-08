import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

import { format } from 'prettier'
import sharp from 'sharp'

const workspaceRoot = resolve(import.meta.dirname, '../..')
const sourceCatalogPath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/postcards.source.json',
)
const duplicateCatalogPath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/postcards.duplicates.json',
)
const rawRoot = resolve(workspaceRoot, 'resources/raw/travelling-bingo/postcards-demo')
const lockPath = resolve(rawRoot, 'postcards.lock.json')
const publicAssetRoot = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/assets/collectibles/postcards',
)
const publicCatalogPath = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/data/postcards.json',
)

const USER_ENTRY_URL = 'https://www.bilibili.com/toy/preview/preview_5SdX8Yet/index.htm'
const EXPECTED_RIGHTS = 'user-confirmed-authorized'
const GENERATED_FROM = 'bilibilitoy-suxinhao-postcards-curated-demo-12'
const OUTPUT_WIDTHS = [480, 960]
const refresh = process.argv.includes('--refresh')

// 候选经过 5 列接触表人工审核，兼顾人物、城市、自然、舞台与旅行构图。
// 固定 sourceId 可以让后续构建始终复现同一套真实明信片。
const CURATED_POSTCARDS = [
  { sourceId: '2025-01-0002', title: '蓝天下的涂鸦墙', tags: ['明信片', '城市', '涂鸦'] },
  { sourceId: '2025-05-0014', title: '水边小城', tags: ['明信片', '风景', '旅行'] },
  { sourceId: '2025-07-0005', title: '收藏一场落日', tags: ['明信片', '落日', '风景'] },
  { sourceId: '2025-09-0019', title: '锦鲤池', tags: ['明信片', '锦鲤', '随拍'] },
  { sourceId: '2025-10-0032', title: '自由的风', tags: ['明信片', '苏新皓', '户外'] },
  { sourceId: '2025-12-0005', title: '苹果小画', tags: ['明信片', '苹果', '画作'] },
  { sourceId: '2025-12-0021', title: '雪林小径', tags: ['明信片', '冬日', '树林'] },
  { sourceId: '2026-02-0020', title: '蓝天下的街角', tags: ['明信片', '街景', '旅行'] },
  { sourceId: '2026-03-0010', title: '梦里片场', tags: ['明信片', '片场', '光影'] },
  { sourceId: '2026-03-0020', title: '旅途小憩', tags: ['明信片', '苏新皓', '旅行'] },
  { sourceId: '2026-04-0015', title: '阳光下的小狗', tags: ['明信片', '小狗', '春日'] },
  { sourceId: '2026-06-0023', title: '山间缆车', tags: ['明信片', '缆车', '旅行'] },
]

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function normalizeCaption(value) {
  const caption = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return caption || '苏新皓网盘随拍'
}

async function writeJson(path, value) {
  const json = await format(JSON.stringify(value), {
    parser: 'json',
    printWidth: 100,
    endOfLine: 'lf',
  })
  await writeFile(path, json, 'utf8')
}

async function fetchBuffer(url, attempts = 3) {
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: USER_ENTRY_URL,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
        },
        redirect: 'follow',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      assert(buffer.byteLength > 0, '下载结果为空')
      return buffer
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 400))
      }
    }
  }

  throw lastError
}

async function removeStaleGeneratedFiles(expectedFileNames) {
  await mkdir(publicAssetRoot, { recursive: true })
  const expected = new Set(expectedFileNames)
  const files = await readdir(publicAssetRoot)

  for (const file of files) {
    if (/^postcard-[a-z0-9-]+-(480|960)\.webp$/.test(file) && !expected.has(file)) {
      await unlink(resolve(publicAssetRoot, file))
    }
  }
}

const sourceCatalog = JSON.parse(await readFile(sourceCatalogPath, 'utf8'))
const duplicateCatalog = JSON.parse(await readFile(duplicateCatalogPath, 'utf8'))

assert(sourceCatalog.schemaVersion === 1, '不支持的明信片源目录版本')
assert(sourceCatalog.rights === EXPECTED_RIGHTS, '源目录未标记用户已授权')
assert(sourceCatalog.items.length === sourceCatalog.itemCount, '源目录 itemCount 不一致')
assert(CURATED_POSTCARDS.length === 12, 'Demo 必须固定选择 12 张明信片')

const selectedIdSet = new Set(CURATED_POSTCARDS.map((item) => item.sourceId))
assert(selectedIdSet.size === CURATED_POSTCARDS.length, '明信片选择列表存在重复 sourceId')

for (const group of duplicateCatalog.groups ?? []) {
  const selectedDuplicates = group.ids.filter((id) => selectedIdSet.has(id))
  assert(
    selectedDuplicates.length < 2,
    `明信片选择包含完全重复图片：${selectedDuplicates.join(', ')}`,
  )
}

const sourceById = new Map(sourceCatalog.items.map((item) => [item.id, item]))
for (const selected of CURATED_POSTCARDS) {
  assert(sourceById.has(selected.sourceId), `源目录缺少 ${selected.sourceId}`)
}

await mkdir(rawRoot, { recursive: true })
await mkdir(publicAssetRoot, { recursive: true })
await mkdir(resolve(publicCatalogPath, '..'), { recursive: true })

const expectedGeneratedNames = CURATED_POSTCARDS.flatMap(({ sourceId }) =>
  OUTPUT_WIDTHS.map((width) => `postcard-${sourceId}-${width}.webp`),
)
await removeStaleGeneratedFiles(expectedGeneratedNames)

const publicItems = []
const lockItems = []

for (const selected of CURATED_POSTCARDS) {
  const sourceItem = sourceById.get(selected.sourceId)
  const rawPath = resolve(rawRoot, `${selected.sourceId}.webp`)
  let originalBuffer

  try {
    if (refresh) throw new Error('强制刷新')
    originalBuffer = await readFile(rawPath)
  } catch {
    originalBuffer = await fetchBuffer(sourceItem.sourceUrl)
    await writeFile(rawPath, originalBuffer)
  }

  const originalMetadata = await sharp(originalBuffer, { failOn: 'warning' }).rotate().metadata()
  assert(originalMetadata.width && originalMetadata.height, `${selected.sourceId} 缺少尺寸信息`)
  assert(
    originalMetadata.width >= 960 || originalMetadata.height >= 960,
    `${selected.sourceId} 分辨率不足以制作明信片`,
  )

  const images = []
  for (const width of OUTPUT_WIDTHS) {
    const fileName = `postcard-${selected.sourceId}-${width}.webp`
    const outputPath = resolve(publicAssetRoot, fileName)
    const buffer = await sharp(originalBuffer, { failOn: 'warning' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: width === 480 ? 80 : 84, effort: 5 })
      .toBuffer()
    const metadata = await sharp(buffer).metadata()
    await writeFile(outputPath, buffer)

    images.push({
      width: metadata.width,
      height: metadata.height,
      path: `assets/collectibles/postcards/${fileName}`,
      byteLength: buffer.byteLength,
      mime: 'image/webp',
      sha256: sha256(buffer),
    })
  }

  const rawFileStats = await stat(rawPath)
  const caption = normalizeCaption(sourceItem.caption)
  const originalSha256 = sha256(originalBuffer)
  const originalFormat =
    originalMetadata.format ?? extname(sourceItem.sourceUrl).slice(1) ?? 'unknown'

  publicItems.push({
    id: `postcard-${selected.sourceId}`,
    category: 'postcard',
    title: selected.title,
    alt: `苏新皓明信片《${selected.title}》`,
    caption,
    date: sourceItem.date,
    source: {
      platform: 'bilibilitoy',
      url: sourceItem.sourceUrl,
      pageUrl: USER_ENTRY_URL,
      accessedAt: sourceCatalog.retrievedAt,
    },
    rights: EXPECTED_RIGHTS,
    images,
    tags: selected.tags,
    metadata: {
      sourceId: sourceItem.id,
      sourceName: sourceItem.name,
      sourceKind: sourceItem.sourceKind,
      monthKey: sourceItem.monthKey,
      original: {
        url: sourceItem.sourceUrl,
        width: originalMetadata.width,
        height: originalMetadata.height,
        format: originalFormat,
        byteLength: originalBuffer.byteLength,
        sha256: originalSha256,
      },
    },
  })

  lockItems.push({
    id: `postcard-${selected.sourceId}`,
    sourceId: sourceItem.id,
    sourceUrl: sourceItem.sourceUrl,
    sourceDate: sourceItem.date,
    sourceCaption: caption,
    accessedAt: sourceCatalog.retrievedAt,
    rights: EXPECTED_RIGHTS,
    originalPath: `resources/raw/travelling-bingo/postcards-demo/${basename(rawPath)}`,
    width: originalMetadata.width,
    height: originalMetadata.height,
    format: originalFormat,
    byteLength: rawFileStats.size,
    sha256: originalSha256,
    derivatives: images,
  })
}

const sourceEnvelope = {
  platform: 'bilibilitoy',
  entryUrl: USER_ENTRY_URL,
  embeddedDataUrl: sourceCatalog.embeddedDataUrl,
  accessedAt: sourceCatalog.retrievedAt,
  rights: EXPECTED_RIGHTS,
}

await writeJson(publicCatalogPath, {
  schemaVersion: 1,
  generatedFrom: GENERATED_FROM,
  itemCount: publicItems.length,
  source: sourceEnvelope,
  selection: {
    method: 'hand-curated-contact-sheet',
    selectedSourceIds: CURATED_POSTCARDS.map((item) => item.sourceId),
  },
  items: publicItems,
})

await writeJson(lockPath, {
  schemaVersion: 1,
  catalogId: GENERATED_FROM,
  source: sourceEnvelope,
  itemCount: lockItems.length,
  items: lockItems,
})

console.log(`已构建 ${publicItems.length} 张真实明信片，每张包含 480/960 两档 WebP。`)
console.log(`公开目录：${publicAssetRoot}`)
console.log(`来源与哈希：${lockPath}`)
