import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { assertFavoriteVideo } from '../research/bilibili-video-catalog-core.mjs'

const execFileAsync = promisify(execFile)
const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const manifestPath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/site-firsts.source.json',
)
const outputRoot = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/assets/collectibles/site-firsts',
)
const publicDataPath = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/data/site-firsts.json',
)
const expectedOutputRoot = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/assets/collectibles/site-firsts',
)

if (outputRoot !== expectedOutputRoot || !outputRoot.startsWith(`${workspaceRoot}${sep}`)) {
  throw new Error('全站第一网页素材输出目录校验失败')
}

async function decodeTileGrid(inputPath, temporaryDirectory, id) {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-show_stream_groups', '-of', 'json', inputPath],
    { maxBuffer: 16 * 1024 * 1024 },
  )
  const probe = JSON.parse(stdout)
  const group = probe.stream_groups?.find((candidate) => candidate.type === 'Tile Grid')
  const component = group?.components?.[0]
  if (!component?.subcomponents?.length || !component.width || !component.height) {
    throw new Error(`${id} 缺少可用的 HEIC tile-grid 描述`)
  }

  const inputs = component.subcomponents.map((tile) => `[0:v:${tile.stream_index}]`).join('')
  const layout = component.subcomponents
    .map((tile) => `${tile.tile_horizontal_offset}_${tile.tile_vertical_offset}`)
    .join('|')
  const filter = `${inputs}xstack=inputs=${component.subcomponents.length}:layout=${layout}:fill=black,crop=${component.width}:${component.height}:0:0[out]`
  const decodedPath = join(temporaryDirectory, `${id}.png`)

  await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-v',
      'error',
      '-i',
      inputPath,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-frames:v',
      '1',
      '-c:v',
      'png',
      '-y',
      decodedPath,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  )

  return decodedPath
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (new Set(manifest.items.map((item) => item.id)).size !== manifest.items.length) {
  throw new Error('全站第一来源清单存在重复 ID')
}
for (const item of manifest.items) {
  assertFavoriteVideo(item.video, `${item.id}.video`)
  if (item.video.bvid !== item.bvid || item.video.sourceUrl !== item.sourceVideoUrl) {
    throw new Error(`${item.id}.video 与原有 bvid/sourceVideoUrl 不一致`)
  }
}
const chronology = [...manifest.items].sort((left, right) => left.chronology - right.chronology)
if (
  chronology.some(
    (item, index) => !Number.isSafeInteger(item.chronology) || item.chronology !== index + 1,
  ) ||
  chronology[0]?.id !== 'site-first-dynamite'
) {
  throw new Error('全站第一 chronology 必须从 Dynamite 开始并按连续正整数递增')
}
await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })
await mkdir(resolve(publicDataPath, '..'), { recursive: true })

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'travelling-bingo-site-firsts-'))
const catalogItems = []

try {
  for (const item of manifest.items) {
    const originalPath = resolve(workspaceRoot, item.originalPath)
    const inputPath =
      extname(originalPath).toLowerCase() === '.heic'
        ? await decodeTileGrid(originalPath, temporaryDirectory, item.id)
        : originalPath
    const metadata = await sharp(inputPath, { failOn: 'error' }).metadata()
    if (!metadata.width || !metadata.height) throw new Error(`${item.id} 无法读取尺寸`)

    const widths = [...new Set([480, 960, 1600].map((width) => Math.min(width, metadata.width)))]
    const images = []
    for (const width of widths) {
      const filename = `${item.id}-${width}.webp`
      const result = await sharp(inputPath, { failOn: 'error' })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 86, effort: 5, smartSubsample: true })
        .toFile(resolve(outputRoot, filename))
      images.push({
        width: result.width,
        height: result.height,
        path: `assets/collectibles/site-firsts/${filename}`,
        byteLength: result.size,
        mime: 'image/webp',
      })
    }

    catalogItems.push({
      id: item.id,
      category: 'site-first',
      title: item.title,
      alt: `苏新皓《${item.title}》B站全站排行榜最高第 1 纪念${
        item.posterKind === 'video-cover-fallback' ? '视频封面' : '海报'
      }`,
      source: {
        platform: 'bilibili',
        url: item.sourceVideoUrl,
        accessedAt: manifest.retrievedAt,
      },
      rights: manifest.rights,
      images,
      tags: ['全站第一', item.category],
      metadata: {
        bvid: item.bvid,
        chronology: item.chronology,
        programCategory: item.category,
        posterKind: item.posterKind,
        video: item.video,
      },
    })
    console.log(`已生成 ${item.id}`)
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
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

console.log(`完成：生成 ${catalogItems.length} 项全站第一 Web 素材`)
