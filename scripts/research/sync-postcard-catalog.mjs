import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const sourceUrl = 'https://www.bilibilitoy.com/toy/preview/preview_5SdX8Yet/index.html'
const entryUrl = 'https://www.bilibili.com/toy/preview/preview_5SdX8Yet/index.html'
const outputPath = resolve(workspaceRoot, 'research/travelling-bingo/data/postcards.source.json')

function extractAssignedJson(source, marker) {
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) throw new Error(`页面中找不到 ${marker}`)
  const start = source.indexOf('{', markerIndex + marker.length)
  if (start < 0) throw new Error('找不到资料对象起始位置')

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) return JSON.parse(source.slice(start, index + 1))
    }
  }
  throw new Error('资料对象没有闭合')
}

const response = await fetch(sourceUrl, {
  headers: { 'User-Agent': 'TravellingBingoResearchSync/1.0' },
})
if (!response.ok) throw new Error(`明信片来源页下载失败：HTTP ${response.status}`)
const sourceBytes = Buffer.from(await response.arrayBuffer())
const sourceHtml = sourceBytes.toString('utf8')
const data = extractAssignedJson(sourceHtml, 'window.SUXINHAO_ARCHIVE_DATA')
const images = data.entries.filter((entry) => entry.type === 'image')

if (images.length !== 473) {
  throw new Error(`预期 473 张图片，实际提取 ${images.length} 张；请人工检查来源是否改版`)
}

const items = images.map((entry) => ({
  id: entry.id,
  name: entry.name,
  caption: entry.caption,
  date: entry.date,
  monthKey: entry.monthKey,
  day: entry.day,
  byteLength: entry.size,
  sourceKind: entry.sourceKind,
  sourceUrl: entry.url,
  bili: entry.bili ?? null,
}))

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      catalogId: 'su-xinhao-postcard-source-images',
      entryUrl,
      embeddedDataUrl: sourceUrl,
      rights: 'user-confirmed-authorized',
      sourcePageSha256: createHash('sha256').update(sourceBytes).digest('hex'),
      sourceExportedAt: data.exportedAt ?? data.generatedAt ?? null,
      retrievedAt: new Date().toISOString(),
      itemCount: items.length,
      biliMonthMap: data.biliMonthMap ?? null,
      items,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`完成：持久化 ${items.length} 条明信片候选图片元数据（未批量下载图片）`)
