import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assertFavoriteVideo,
  assertVideoCatalog,
  buildPublicVideoCatalog,
  videoForMapping,
} from './bilibili-video-catalog-core.mjs'
import { buildSynchronizedPosterCatalogs, parseArguments } from './sync-bilibili-video-catalog.mjs'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const STREAM_FAVORITE_ID = 3963921644
const STREAM_BVIDS = ['BV1At3j6EE6w', 'BV1mkuN6HEFC', 'BV1UZ3D6REhZ']

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(workspaceRoot, relativePath), 'utf8'))
}

function replaceVideoTitleEverywhere(value, bvid, title) {
  if (Array.isArray(value)) {
    for (const item of value) replaceVideoTitleEverywhere(item, bvid, title)
    return
  }
  if (!value || typeof value !== 'object') return
  if (value.bvid === bvid && typeof value.title === 'string') value.title = title
  for (const child of Object.values(value)) replaceVideoTitleEverywhere(child, bvid, title)
}

test('已提交的视频目录、公开目录与两类海报映射保持一致', async () => {
  const [
    catalog,
    publicCatalog,
    millionManifest,
    siteFirstManifest,
    publicMillionCatalog,
    publicSiteFirstCatalog,
  ] = await Promise.all([
    readJson('research/travelling-bingo/data/bilibili-video-catalog.source.json'),
    readJson('AllForSUXINHAO/TravellingBingo/public/data/video-catalog.json'),
    readJson('research/travelling-bingo/data/million-shot-posters.source.json'),
    readJson('research/travelling-bingo/data/site-firsts.source.json'),
    readJson('AllForSUXINHAO/TravellingBingo/public/data/million-shot-posters.json'),
    readJson('AllForSUXINHAO/TravellingBingo/public/data/site-firsts.json'),
  ])

  assert.doesNotThrow(() => assertVideoCatalog(catalog))
  assert.deepEqual(publicCatalog, buildPublicVideoCatalog(catalog))
  assert.equal(catalog.folders.millionShots.latestPage.items.length, 20)
  assert.equal(catalog.folders.siteFirsts.latestPage.items.length, 18)
  assert.equal(catalog.folders.streaming.favoriteId, STREAM_FAVORITE_ID)
  assert.equal(
    catalog.folders.streaming.latestPage.items.length,
    catalog.folders.streaming.visibleItemCount,
  )
  assert.equal(catalog.streamPlaylist.sourceFavoriteId, STREAM_FAVORITE_ID)
  assert.deepEqual(
    catalog.streamPlaylist.items.map((video) => video.bvid),
    STREAM_BVIDS,
  )
  assert.deepEqual(
    catalog.folders.streaming.latestPage.items,
    catalog.streamPlaylist.items.slice(0, catalog.folders.streaming.latestPage.pageSize),
  )
  assert.equal(catalog.posterMappings.millionShots.length, 30)
  assert.equal(catalog.posterMappings.siteFirsts.length, 8)
  assert.equal(catalog.recordPlayer.items.length, 8)
  assert.equal(JSON.stringify(catalog).includes('"embedUrl"'), false)
  assert.equal(Object.keys(publicCatalog.videos).length, catalog.videos.length)
  for (const [bvid, video] of Object.entries(publicCatalog.videos)) {
    assert.equal(video.bvid, bvid)
    assert.doesNotThrow(() => assertFavoriteVideo(video, `public.videos.${bvid}`))
  }

  const millionById = new Map(millionManifest.items.map((item) => [item.id, item]))
  const publicMillionById = new Map(publicMillionCatalog.items.map((item) => [item.id, item]))
  for (const mapping of catalog.posterMappings.millionShots) {
    const item = millionById.get(mapping.posterId)
    const publicItem = publicMillionById.get(mapping.posterId)
    assert.ok(item, `缺少 ${mapping.posterId}`)
    assert.ok(publicItem, `公开目录缺少 ${mapping.posterId}`)
    assert.equal(item.sequence, mapping.sequence)
    assert.deepEqual(item.video, videoForMapping(catalog, mapping))
    assert.deepEqual(publicItem.metadata.video, item.video)
    assert.doesNotThrow(() => assertFavoriteVideo(publicItem.metadata.video, mapping.posterId))
  }

  const siteById = new Map(siteFirstManifest.items.map((item) => [item.id, item]))
  const publicSiteById = new Map(publicSiteFirstCatalog.items.map((item) => [item.id, item]))
  for (const mapping of catalog.posterMappings.siteFirsts) {
    const item = siteById.get(mapping.posterId)
    const publicItem = publicSiteById.get(mapping.posterId)
    assert.ok(item, `缺少 ${mapping.posterId}`)
    assert.ok(publicItem, `公开目录缺少 ${mapping.posterId}`)
    assert.equal(item.chronology, mapping.chronology)
    assert.equal(item.bvid, mapping.bvid)
    assert.deepEqual(item.video, videoForMapping(catalog, mapping))
    assert.deepEqual(publicItem.metadata.video, item.video)
    assert.doesNotThrow(() => assertFavoriteVideo(publicItem.metadata.video, mapping.posterId))
  }
})

test('重名海报使用显式 ID 映射，不按标题猜测', async () => {
  const catalog = await readJson(
    'research/travelling-bingo/data/bilibili-video-catalog.source.json',
  )
  const mappings = new Map(
    catalog.posterMappings.millionShots.map((mapping) => [mapping.posterId, mapping.bvid]),
  )
  assert.equal(mappings.get('million-shot-151'), 'BV15Q3u6UEfW')
  assert.equal(mappings.get('million-shot-150'), 'BV1Dx3i6nEm8')
  assert.equal(mappings.get('million-shot-131'), 'BV1xqDkBREFJ')
  assert.equal(mappings.get('million-shot-117'), 'BV179v1B2Emc')
  assert.equal(mappings.get('million-shot-116'), 'BV1VuvUB5EST')
  assert.equal(mappings.get('million-shot-108'), 'BV198411R74Z')
})

test('模拟 --refresh 后会同步两类公开海报元数据且不重建图片', async () => {
  const [catalog, millionSource, siteFirstSource, millionPublic, siteFirstPublic] =
    await Promise.all([
      readJson('research/travelling-bingo/data/bilibili-video-catalog.source.json'),
      readJson('research/travelling-bingo/data/million-shot-posters.source.json'),
      readJson('research/travelling-bingo/data/site-firsts.source.json'),
      readJson('AllForSUXINHAO/TravellingBingo/public/data/million-shot-posters.json'),
      readJson('AllForSUXINHAO/TravellingBingo/public/data/site-firsts.json'),
    ])

  const refreshedCatalog = structuredClone(catalog)
  const siteBvids = new Set(catalog.posterMappings.siteFirsts.map((mapping) => mapping.bvid))
  const millionMapping = catalog.posterMappings.millionShots.find(
    (mapping) => !siteBvids.has(mapping.bvid),
  )
  const siteFirstMapping = catalog.posterMappings.siteFirsts[0]
  assert.ok(millionMapping)
  replaceVideoTitleEverywhere(refreshedCatalog, millionMapping.bvid, '刷新后的百万直拍标题')
  replaceVideoTitleEverywhere(refreshedCatalog, siteFirstMapping.bvid, '刷新后的全站第一标题')
  assert.doesNotThrow(() => assertVideoCatalog(refreshedCatalog))

  const millionPublicBefore = JSON.stringify(millionPublic)
  const siteFirstPublicBefore = JSON.stringify(siteFirstPublic)
  const synchronized = buildSynchronizedPosterCatalogs({
    catalog: refreshedCatalog,
    millionSource,
    siteFirstSource,
    millionPublic,
    siteFirstPublic,
  })
  assert.equal(
    JSON.stringify(millionPublic),
    millionPublicBefore,
    '同步函数不应原地改写公开百万目录',
  )
  assert.equal(
    JSON.stringify(siteFirstPublic),
    siteFirstPublicBefore,
    '同步函数不应原地改写公开全站第一目录',
  )

  for (const [mapping, sourceItems, publicItems, expectedTitle, originalPublicItems] of [
    [
      millionMapping,
      synchronized.millionSource.items,
      synchronized.millionPublic.items,
      '刷新后的百万直拍标题',
      millionPublic.items,
    ],
    [
      siteFirstMapping,
      synchronized.siteFirstSource.items,
      synchronized.siteFirstPublic.items,
      '刷新后的全站第一标题',
      siteFirstPublic.items,
    ],
  ]) {
    const sourceItem = sourceItems.find((item) => item.id === mapping.posterId)
    const publicItem = publicItems.find((item) => item.id === mapping.posterId)
    const originalPublicItem = originalPublicItems.find((item) => item.id === mapping.posterId)
    assert.ok(sourceItem)
    assert.ok(publicItem)
    assert.ok(originalPublicItem)
    assert.equal(sourceItem.video.title, expectedTitle)
    assert.deepEqual(publicItem.metadata.video, sourceItem.video)
    assert.deepEqual(publicItem.images, originalPublicItem.images)
    const expectedPublicItem = structuredClone(originalPublicItem)
    expectedPublicItem.metadata.video = sourceItem.video
    assert.deepEqual(publicItem, expectedPublicItem, `${mapping.posterId} 只能更新 metadata.video`)
  }
})

test('唱片机固定使用全站第一 chronology 第 1–8 项及实际时长', async () => {
  const catalog = await readJson(
    'research/travelling-bingo/data/bilibili-video-catalog.source.json',
  )
  assert.deepEqual(
    catalog.recordPlayer.items.map((video) => video.bvid),
    [
      'BV1cfCSYfEo3',
      'BV1rtDRBJE7s',
      'BV1MbZnYoEk1',
      'BV1i7LM6oErE',
      'BV1fjpAzmE1T',
      'BV1Dx3i6nEm8',
      'BV179v1B2Emc',
      'BV1D23262EaD',
    ],
  )
  assert.deepEqual(
    catalog.recordPlayer.items.map((video) => video.durationSeconds),
    [183, 542, 100, 237, 301, 610, 198, 240],
  )
})

test('目录拒绝持久化 embedUrl 和错误 chronology', async () => {
  const catalog = await readJson(
    'research/travelling-bingo/data/bilibili-video-catalog.source.json',
  )
  const withEmbedUrl = structuredClone(catalog)
  withEmbedUrl.videos[0].embedUrl = 'https://player.bilibili.com/player.html'
  assert.throws(() => assertVideoCatalog(withEmbedUrl), /embedUrl/u)

  const withWrongChronology = structuredClone(catalog)
  withWrongChronology.posterMappings.siteFirsts[0].chronology = 2
  assert.throws(() => assertVideoCatalog(withWrongChronology), /chronology/u)
})

test('刷播目录固定收藏夹并拒绝缺项、重复和首页乱序', async () => {
  const catalog = await readJson(
    'research/travelling-bingo/data/bilibili-video-catalog.source.json',
  )

  const wrongFavorite = structuredClone(catalog)
  wrongFavorite.folders.streaming.favoriteId = 1
  wrongFavorite.streamPlaylist.sourceFavoriteId = 1
  for (const video of wrongFavorite.folders.streaming.latestPage.items) video.favoriteId = 1
  for (const video of wrongFavorite.streamPlaylist.items) video.favoriteId = 1
  assert.throws(() => assertVideoCatalog(wrongFavorite), /刷播收藏夹 ID/u)

  const missingItem = structuredClone(catalog)
  missingItem.streamPlaylist.items.pop()
  assert.throws(() => assertVideoCatalog(missingItem), /全部可见视频/u)

  const duplicateItem = structuredClone(catalog)
  duplicateItem.streamPlaylist.items[1] = {
    ...structuredClone(duplicateItem.streamPlaylist.items[0]),
    favoriteOrder: 2,
  }
  assert.throws(() => assertVideoCatalog(duplicateItem), /重复/u)

  const wrongOrder = structuredClone(catalog)
  const first = structuredClone(wrongOrder.streamPlaylist.items[0])
  const second = structuredClone(wrongOrder.streamPlaylist.items[1])
  wrongOrder.streamPlaylist.items[0] = { ...second, favoriteOrder: 1 }
  wrongOrder.streamPlaylist.items[1] = { ...first, favoriteOrder: 2 }
  assert.throws(() => assertVideoCatalog(wrongOrder), /首页顺序/u)

  const incompleteLatestPage = structuredClone(catalog)
  incompleteLatestPage.folders.streaming.latestPage.items.pop()
  assert.throws(() => assertVideoCatalog(incompleteLatestPage), /首页数量/u)
})

test('同步命令只有显式 --refresh 才启用联网刷新', () => {
  assert.deepEqual(parseArguments([]), { refresh: false })
  assert.deepEqual(parseArguments(['--refresh']), { refresh: true })
  assert.throws(() => parseArguments(['--online']), /未知参数/u)
})
