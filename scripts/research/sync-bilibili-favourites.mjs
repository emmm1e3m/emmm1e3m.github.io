import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const favouritesDirectory = resolve(workspaceRoot, 'AllForSUXINHAO/TravellingBingo/favourites')
const favoriteApiUrl = 'https://api.bilibili.com/x/v3/fav/resource/list'
const pageSize = 20
const pageLimit = 100
const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/u

export const FAVOURITE_SOURCES = Object.freeze([
  Object.freeze({
    id: 3682220021,
    label: '刷播收藏夹',
    path: resolve(favouritesDirectory, '3682220021.txt'),
  }),
  Object.freeze({
    id: 3986840044,
    label: '测试收藏夹',
    path: resolve(favouritesDirectory, '3986840044.txt'),
  }),
])

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

export function parseFavouriteText(text, source) {
  invariant(text.endsWith('\n'), `${source.id}.txt 末尾必须有换行`)
  invariant(!text.includes('\r'), `${source.id}.txt 必须使用 LF 换行`)

  const bvids = text.slice(0, -1).split('\n')
  invariant(bvids.length > 0 && bvids[0] !== '', `${source.id}.txt 不能为空`)
  bvids.forEach((bvid, index) => {
    invariant(BVID_PATTERN.test(bvid), `${source.id}.txt 第 ${index + 1} 行不是有效 BV 号`)
  })
  invariant(new Set(bvids).size === bvids.length, `${source.id}.txt 存在重复 BV 号`)
  return bvids
}

function serializeFavouriteBvids(bvids, source) {
  const text = `${bvids.join('\n')}\n`
  parseFavouriteText(text, source)
  return text
}

async function fetchBilibiliJson(url) {
  const response = await fetch(url, {
    headers: {
      Referer: 'https://space.bilibili.com/1210409821/favlist',
      'User-Agent': 'TravellingBingoFavouritesSync/1.0',
    },
  })
  if (!response.ok) throw new Error(`Bilibili 请求失败：HTTP ${response.status} ${url}`)
  const payload = await response.json()
  if (payload.code !== 0 || !payload.data) {
    throw new Error(`Bilibili 接口失败：${payload.code} ${payload.message ?? ''} ${url}`)
  }
  return payload.data
}

export async function fetchFavouriteBvids(source) {
  const bvids = []
  let reportedCount = null
  let title = null

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const url = new URL(favoriteApiUrl)
    url.search = new URLSearchParams({
      media_id: String(source.id),
      pn: String(pageNumber),
      ps: String(pageSize),
      order: 'mtime',
      type: '0',
      platform: 'web',
    })
    const data = await fetchBilibiliJson(url)
    if (pageNumber === 1) {
      invariant(data.info?.id === source.id, `${source.id} 返回了错误的收藏夹 ID`)
      title = data.info.title
      reportedCount = data.info.media_count
    }
    for (const media of data.medias ?? []) bvids.push(media.bvid)
    if (!data.has_more) break
    if (pageNumber === pageLimit) throw new Error(`${source.id} 分页超过安全上限`)
  }

  parseFavouriteText(serializeFavouriteBvids(bvids, source), source)
  return { bvids, reportedCount, title }
}

export async function validateFavouriteFiles() {
  const results = []
  for (const source of FAVOURITE_SOURCES) {
    const bvids = parseFavouriteText(await readFile(source.path, 'utf8'), source)
    results.push({ source, bvids })
  }
  return results
}

export async function refreshFavouriteFiles() {
  await mkdir(favouritesDirectory, { recursive: true })
  const results = await Promise.all(
    FAVOURITE_SOURCES.map(async (source) => {
      const remote = await fetchFavouriteBvids(source)
      await writeFile(source.path, serializeFavouriteBvids(remote.bvids, source), 'utf8')
      return { source, ...remote }
    }),
  )
  await validateFavouriteFiles()
  return results
}

export function parseArguments(arguments_) {
  const unknown = arguments_.filter((argument) => argument !== '--refresh')
  if (unknown.length > 0) throw new Error(`未知参数：${unknown.join(', ')}`)
  return { refresh: arguments_.includes('--refresh') }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.refresh) {
    const results = await refreshFavouriteFiles()
    for (const { source, bvids, reportedCount, title } of results) {
      console.log(
        `完成：联网刷新 ${source.id}（${title}）${bvids.length} 条可见 BV；接口报告 ${reportedCount} 项`,
      )
    }
    return
  }

  const results = await validateFavouriteFiles()
  for (const { source, bvids } of results) {
    console.log(`完成：离线校验 ${source.id}.txt，共 ${bvids.length} 条 BV`)
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
