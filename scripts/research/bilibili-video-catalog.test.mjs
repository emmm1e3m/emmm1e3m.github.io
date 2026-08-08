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
import { parseArguments } from './sync-bilibili-video-catalog.mjs'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(workspaceRoot, relativePath), 'utf8'))
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
  assert.equal(catalog.posterMappings.millionShots.length, 30)
  assert.equal(catalog.posterMappings.siteFirsts.length, 8)
  assert.equal(catalog.recordPlayer.items.length, 7)
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

test('唱片机固定使用百万收藏夹最新页第 1–7 项', async () => {
  const catalog = await readJson(
    'research/travelling-bingo/data/bilibili-video-catalog.source.json',
  )
  assert.deepEqual(
    catalog.recordPlayer.items.map((video) => video.bvid),
    [
      'BV1D23262EaD',
      'BV15Q3u6UEfW',
      'BV1Dx3i6nEm8',
      'BV1Dp6hBuEWm',
      'BV1mLDRBtE91',
      'BV1dbBiBXEww',
      'BV12G6nBKE8W',
    ],
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

test('同步命令只有显式 --refresh 才启用联网刷新', () => {
  assert.deepEqual(parseArguments([]), { refresh: false })
  assert.deepEqual(parseArguments(['--refresh']), { refresh: true })
  assert.throws(() => parseArguments(['--online']), /未知参数/u)
})
