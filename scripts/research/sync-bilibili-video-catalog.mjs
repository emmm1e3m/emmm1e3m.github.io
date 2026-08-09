import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'

import { format } from 'prettier'

import {
  assertVideoCatalog,
  buildPublicVideoCatalog,
  videoForMapping,
} from './bilibili-video-catalog-core.mjs'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const catalogSourcePath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/bilibili-video-catalog.source.json',
)
const millionSourcePath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/million-shot-posters.source.json',
)
const siteFirstSourcePath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/site-firsts.source.json',
)
const publicCatalogPath = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/data/video-catalog.json',
)
const publicMillionManifestPath = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/data/million-shot-posters.json',
)
const publicSiteFirstManifestPath = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/data/site-firsts.json',
)
const favoriteApiUrl = 'https://api.bilibili.com/x/v3/fav/resource/list'
const viewApiUrl = 'https://api.bilibili.com/x/web-interface/view'
const pageSize = 20

function shanghaiIsoFromUnix(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new Error(`无效发布时间：${seconds}`)
  return new Date((seconds + 8 * 60 * 60) * 1000).toISOString().replace('Z', '+08:00')
}

function normalizeHttps(url) {
  return String(url).replace(/^http:/u, 'https:')
}

function toFavoriteVideo(media, favoriteId, favoriteOrder) {
  return {
    bvid: media.bvid,
    title: media.title,
    authorName: media.upper?.name,
    authorMid: media.upper?.mid,
    publishedAt: shanghaiIsoFromUnix(media.pubtime),
    durationSeconds: media.duration,
    coverUrl: normalizeHttps(media.cover),
    sourceUrl: `https://www.bilibili.com/video/${media.bvid}/`,
    favoriteId,
    favoriteOrder,
  }
}

function toBaseVideo(video) {
  return {
    bvid: video.bvid,
    title: video.title,
    authorName: video.authorName,
    authorMid: video.authorMid,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    coverUrl: video.coverUrl,
    sourceUrl: video.sourceUrl,
  }
}

async function fetchBilibiliJson(url) {
  const response = await fetch(url, {
    headers: {
      Referer: 'https://space.bilibili.com/1210409821/favlist',
      'User-Agent': 'TravellingBingoCatalogSync/1.0',
    },
  })
  if (!response.ok) throw new Error(`Bilibili 请求失败：HTTP ${response.status} ${url}`)
  const payload = await response.json()
  if (payload.code !== 0 || !payload.data) {
    throw new Error(`Bilibili 接口失败：${payload.code} ${payload.message ?? ''} ${url}`)
  }
  return payload.data
}

async function fetchFavoriteFolder(folder) {
  const allItems = []
  let latestItems = []
  let info = null

  for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
    const url = new URL(favoriteApiUrl)
    url.search = new URLSearchParams({
      media_id: String(folder.favoriteId),
      pn: String(pageNumber),
      ps: String(pageSize),
      order: 'mtime',
      type: '0',
      platform: 'web',
    })
    const data = await fetchBilibiliJson(url)
    info ??= data.info
    const pageItems = (data.medias ?? []).map((media, index) =>
      toFavoriteVideo(media, folder.favoriteId, (pageNumber - 1) * pageSize + index + 1),
    )
    if (pageNumber === 1) latestItems = pageItems
    allItems.push(...pageItems)
    if (!data.has_more) break
    if (pageNumber === 20) throw new Error(`${folder.favoriteId} 分页超过安全上限`)
  }

  if (!info?.title) throw new Error(`${folder.favoriteId} 缺少收藏夹信息`)
  if (new Set(allItems.map((video) => video.bvid)).size !== allItems.length) {
    throw new Error(`${folder.favoriteId} 返回了重复 BV 号`)
  }
  return {
    config: folder,
    title: info.title,
    reportedItemCount: info.media_count,
    visibleItemCount: allItems.length,
    latestItems,
    allItems,
  }
}

function findFavoriteVideo(folder, bvid, label) {
  const video = folder.allItems.find((candidate) => candidate.bvid === bvid)
  if (!video) throw new Error(`${label} 对应的 ${bvid} 已不在收藏夹 ${folder.config.favoriteId} 中`)
  return video
}

function mergeVideo(videoMap, favoriteVideo) {
  const video = toBaseVideo(favoriteVideo)
  const previous = videoMap.get(video.bvid)
  if (previous && !isDeepStrictEqual(previous, video)) {
    throw new Error(`${video.bvid} 在两个收藏夹中的元数据不一致`)
  }
  videoMap.set(video.bvid, video)
}

async function verifySiteFirstRank(mapping) {
  const url = new URL(viewApiUrl)
  url.search = new URLSearchParams({ bvid: mapping.bvid })
  const data = await fetchBilibiliJson(url)
  if (data.stat?.his_rank !== 1) {
    throw new Error(`${mapping.posterId} 的 history_rank 不再为 1`)
  }
  return 1
}

export async function refreshVideoCatalog(seedCatalog) {
  const [millionFolder, siteFirstFolder] = await Promise.all([
    fetchFavoriteFolder(seedCatalog.folders.millionShots),
    fetchFavoriteFolder(seedCatalog.folders.siteFirsts),
  ])
  const videoMap = new Map()
  for (const video of [...millionFolder.latestItems, ...siteFirstFolder.latestItems]) {
    mergeVideo(videoMap, video)
  }

  const millionMappings = seedCatalog.posterMappings.millionShots.map((mapping) => {
    const video = findFavoriteVideo(millionFolder, mapping.bvid, mapping.posterId)
    mergeVideo(videoMap, video)
    return { ...mapping, favoriteOrder: video.favoriteOrder }
  })
  const siteMappings = []
  for (const mapping of seedCatalog.posterMappings.siteFirsts) {
    const video = findFavoriteVideo(siteFirstFolder, mapping.bvid, mapping.posterId)
    mergeVideo(videoMap, video)
    siteMappings.push({
      ...mapping,
      favoriteOrder: video.favoriteOrder,
      historyRank: await verifySiteFirstRank(mapping),
    })
  }

  const recordPlayerItems = millionFolder.latestItems.slice(0, 7)
  const refreshed = {
    schemaVersion: 1,
    catalogId: 'travelling-bingo-bilibili-video-catalog',
    retrievedAt: new Date().toISOString(),
    ownerMid: seedCatalog.ownerMid,
    folders: {
      millionShots: {
        ...seedCatalog.folders.millionShots,
        title: millionFolder.title,
        reportedItemCount: millionFolder.reportedItemCount,
        visibleItemCount: millionFolder.visibleItemCount,
        latestPage: {
          pageNumber: 1,
          pageSize,
          items: millionFolder.latestItems,
        },
      },
      siteFirsts: {
        ...seedCatalog.folders.siteFirsts,
        title: siteFirstFolder.title,
        reportedItemCount: siteFirstFolder.reportedItemCount,
        visibleItemCount: siteFirstFolder.visibleItemCount,
        latestPage: {
          pageNumber: 1,
          pageSize,
          items: siteFirstFolder.latestItems,
        },
      },
    },
    videos: [...videoMap.values()].sort((left, right) => left.bvid.localeCompare(right.bvid)),
    posterMappings: {
      millionShots: millionMappings,
      siteFirsts: siteMappings,
    },
    recordPlayer: {
      sourceFavoriteId: millionFolder.config.favoriteId,
      selectionRule: '固定选取百万直拍收藏夹刷新快照的最新页第 1–7 项；运行时不请求 Bilibili API。',
      items: recordPlayerItems,
    },
  }
  return assertVideoCatalog(refreshed)
}

function applyManifestVideos(manifest, mappings, catalog, kind) {
  const mappingById = new Map(mappings.map((mapping) => [mapping.posterId, mapping]))
  if (manifest.items.length !== mappings.length) {
    throw new Error(`${kind} 来源清单数量与视频映射数量不一致`)
  }
  return {
    ...manifest,
    items: manifest.items.map((item) => {
      const mapping = mappingById.get(item.id)
      if (!mapping) throw new Error(`${kind} 缺少 ${item.id} 的视频映射`)
      if (kind === '百万直拍' && item.sequence !== mapping.sequence) {
        throw new Error(`${item.id} 的 sequence 与视频映射不一致`)
      }
      if (
        kind === '全站第一' &&
        (item.chronology !== mapping.chronology || item.bvid !== mapping.bvid)
      ) {
        throw new Error(`${item.id} 的 chronology/bvid 与视频映射不一致`)
      }
      return { ...item, video: videoForMapping(catalog, mapping) }
    }),
  }
}

function applyPublicManifestVideos(publicManifest, sourceManifest, kind) {
  if (!Array.isArray(publicManifest.items) || !Array.isArray(sourceManifest.items)) {
    throw new Error(`${kind} 的来源或公开目录缺少 items`)
  }
  if (publicManifest.items.length !== sourceManifest.items.length) {
    throw new Error(`${kind} 的来源与公开目录数量不一致`)
  }

  const sourceById = new Map(sourceManifest.items.map((item) => [item.id, item]))
  if (sourceById.size !== sourceManifest.items.length) {
    throw new Error(`${kind} 来源目录存在重复 ID`)
  }
  const seenPublicIds = new Set()
  return {
    ...publicManifest,
    items: publicManifest.items.map((item) => {
      if (seenPublicIds.has(item.id)) throw new Error(`${kind} 公开目录存在重复 ID：${item.id}`)
      seenPublicIds.add(item.id)
      const sourceItem = sourceById.get(item.id)
      if (!sourceItem) throw new Error(`${kind} 公开目录存在来源未定义的 ${item.id}`)
      if (!sourceItem.video) throw new Error(`${kind} 来源目录的 ${item.id} 缺少 video`)
      if (!item.metadata || typeof item.metadata !== 'object' || Array.isArray(item.metadata)) {
        throw new Error(`${kind} 公开目录的 ${item.id} 缺少 metadata`)
      }
      return {
        ...item,
        metadata: {
          ...item.metadata,
          video: sourceItem.video,
        },
      }
    }),
  }
}

export function buildSynchronizedPosterCatalogs({
  catalog,
  millionSource,
  siteFirstSource,
  millionPublic,
  siteFirstPublic,
}) {
  assertVideoCatalog(catalog)
  const nextMillionSource = applyManifestVideos(
    millionSource,
    catalog.posterMappings.millionShots,
    catalog,
    '百万直拍',
  )
  const nextSiteFirstSource = applyManifestVideos(
    siteFirstSource,
    catalog.posterMappings.siteFirsts,
    catalog,
    '全站第一',
  )
  return {
    millionSource: nextMillionSource,
    siteFirstSource: nextSiteFirstSource,
    millionPublic: applyPublicManifestVideos(millionPublic, nextMillionSource, '百万直拍'),
    siteFirstPublic: applyPublicManifestVideos(siteFirstPublic, nextSiteFirstSource, '全站第一'),
  }
}

function assertManifestVideos(manifest, mappings, catalog, kind) {
  const expected = applyManifestVideos(manifest, mappings, catalog, kind)
  for (let index = 0; index < manifest.items.length; index += 1) {
    if (!isDeepStrictEqual(manifest.items[index].video, expected.items[index].video)) {
      throw new Error(
        `${manifest.items[index].id}.video 与静态视频目录不一致；请显式运行 --refresh`,
      )
    }
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
  const output = await format(JSON.stringify(value), {
    parser: 'json',
    printWidth: 100,
    endOfLine: 'lf',
  })
  try {
    if ((await readFile(path, 'utf8')) === output) return
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, output, 'utf8')
}

export async function buildOfflineCatalog() {
  const [
    catalog,
    millionManifest,
    siteFirstManifest,
    publicMillionManifest,
    publicSiteFirstManifest,
  ] = await Promise.all([
    readJson(catalogSourcePath),
    readJson(millionSourcePath),
    readJson(siteFirstSourcePath),
    readJson(publicMillionManifestPath),
    readJson(publicSiteFirstManifestPath),
  ])
  assertVideoCatalog(catalog)
  assertManifestVideos(millionManifest, catalog.posterMappings.millionShots, catalog, '百万直拍')
  assertManifestVideos(siteFirstManifest, catalog.posterMappings.siteFirsts, catalog, '全站第一')
  const nextPublicMillionManifest = applyPublicManifestVideos(
    publicMillionManifest,
    millionManifest,
    '百万直拍',
  )
  const nextPublicSiteFirstManifest = applyPublicManifestVideos(
    publicSiteFirstManifest,
    siteFirstManifest,
    '全站第一',
  )
  await Promise.all([
    writeJson(publicCatalogPath, buildPublicVideoCatalog(catalog)),
    writeJson(publicMillionManifestPath, nextPublicMillionManifest),
    writeJson(publicSiteFirstManifestPath, nextPublicSiteFirstManifest),
  ])
  return catalog
}

async function refreshAndWriteCatalog() {
  const [
    seedCatalog,
    millionManifest,
    siteFirstManifest,
    publicMillionManifest,
    publicSiteFirstManifest,
  ] = await Promise.all([
    readJson(catalogSourcePath),
    readJson(millionSourcePath),
    readJson(siteFirstSourcePath),
    readJson(publicMillionManifestPath),
    readJson(publicSiteFirstManifestPath),
  ])
  const catalog = await refreshVideoCatalog(seedCatalog)
  const synchronized = buildSynchronizedPosterCatalogs({
    catalog,
    millionSource: millionManifest,
    siteFirstSource: siteFirstManifest,
    millionPublic: publicMillionManifest,
    siteFirstPublic: publicSiteFirstManifest,
  })
  await Promise.all([
    writeJson(catalogSourcePath, catalog),
    writeJson(millionSourcePath, synchronized.millionSource),
    writeJson(siteFirstSourcePath, synchronized.siteFirstSource),
    writeJson(publicCatalogPath, buildPublicVideoCatalog(catalog)),
    writeJson(publicMillionManifestPath, synchronized.millionPublic),
    writeJson(publicSiteFirstManifestPath, synchronized.siteFirstPublic),
  ])
  return catalog
}

export function parseArguments(arguments_) {
  const unknown = arguments_.filter((argument) => argument !== '--refresh')
  if (unknown.length > 0) throw new Error(`未知参数：${unknown.join(', ')}`)
  return { refresh: arguments_.includes('--refresh') }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.refresh) {
    const catalog = await refreshAndWriteCatalog()
    console.log(
      `完成：联网刷新 ${catalog.videos.length} 条视频元数据、30 项百万直拍映射、8 项全站第一映射`,
    )
    return
  }
  const catalog = await buildOfflineCatalog()
  console.log(`完成：离线校验并生成 ${catalog.videos.length} 条静态视频目录`)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
