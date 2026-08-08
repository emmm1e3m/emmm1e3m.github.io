import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { assertFavoriteVideo } from '../research/bilibili-video-catalog-core.mjs'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const manifestPath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/million-shot-posters.source.json',
)
const outputRoot = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/assets/collectibles/million-shots',
)
const publicDataPath = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/data/million-shot-posters.json',
)
const expectedOutputRoot = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/assets/collectibles/million-shots',
)

if (outputRoot !== expectedOutputRoot || !outputRoot.startsWith(`${workspaceRoot}${sep}`)) {
  throw new Error('网页素材输出目录校验失败')
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
for (const item of manifest.items) {
  assertFavoriteVideo(item.video, `${item.id}.video`)
}
await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })
await mkdir(resolve(publicDataPath, '..'), { recursive: true })

const catalogItems = []
for (const item of manifest.items) {
  const inputPath = resolve(workspaceRoot, item.originalPath)
  const metadata = await sharp(inputPath, { failOn: 'error' }).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error(`${item.id} 缺少尺寸信息`)
  }

  const widths = [...new Set([480, 960, 1600].map((width) => Math.min(width, metadata.width)))]
  const images = []
  for (const width of widths) {
    const filename = `${item.id}-${width}.webp`
    const target = resolve(outputRoot, filename)
    const result = await sharp(inputPath, { failOn: 'error' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 84, effort: 5, smartSubsample: true })
      .toFile(target)

    images.push({
      width: result.width,
      height: result.height,
      path: `assets/collectibles/million-shots/${filename}`,
      byteLength: result.size,
      mime: 'image/webp',
    })
  }

  catalogItems.push({
    id: item.id,
    category: 'million-shot',
    title: item.title,
    alt: `苏新皓《${item.title}》第 ${item.sequence} 支百万直拍纪念海报`,
    source: {
      platform: 'weibo',
      url: item.sourcePostUrl,
      publishedAt: item.publishedAt,
      accessedAt: manifest.selection.retrievedAt,
    },
    rights: manifest.selection.rights,
    images,
    tags: ['百万直拍', item.title],
    metadata: {
      sequence: item.sequence,
      video: item.video,
    },
  })
}

await writeFile(
  publicDataPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedFrom: manifest.catalogId,
      itemCount: catalogItems.length,
      items: catalogItems,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`完成：生成 ${catalogItems.length} 项百万直拍 Web 素材`)
