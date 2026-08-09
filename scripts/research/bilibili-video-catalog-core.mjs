const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/u
const VIDEO_FIELDS = [
  'bvid',
  'title',
  'authorName',
  'authorMid',
  'publishedAt',
  'durationSeconds',
  'coverUrl',
  'sourceUrl',
]

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertNonEmptyString(value, label) {
  invariant(typeof value === 'string' && value.trim().length > 0, `${label} 必须是非空字符串`)
}

function assertPositiveSafeInteger(value, label) {
  invariant(Number.isSafeInteger(value) && value > 0, `${label} 必须是正安全整数`)
}

function assertIsoDate(value, label) {
  assertNonEmptyString(value, label)
  invariant(Number.isFinite(Date.parse(value)), `${label} 不是有效时间`)
}

function assertHttpsUrl(value, label) {
  assertNonEmptyString(value, label)
  const url = new URL(value)
  invariant(url.protocol === 'https:', `${label} 必须使用 HTTPS`)
}

export function assertVideoMetadata(video, label = 'video') {
  invariant(isRecord(video), `${label} 必须是对象`)
  invariant(!Object.hasOwn(video, 'embedUrl'), `${label} 不应持久化 embedUrl`)
  for (const field of VIDEO_FIELDS) {
    invariant(Object.hasOwn(video, field), `${label} 缺少 ${field}`)
  }

  invariant(BVID_PATTERN.test(video.bvid), `${label}.bvid 格式无效`)
  assertNonEmptyString(video.title, `${label}.title`)
  assertNonEmptyString(video.authorName, `${label}.authorName`)
  assertPositiveSafeInteger(video.authorMid, `${label}.authorMid`)
  assertIsoDate(video.publishedAt, `${label}.publishedAt`)
  assertPositiveSafeInteger(video.durationSeconds, `${label}.durationSeconds`)
  assertHttpsUrl(video.coverUrl, `${label}.coverUrl`)
  invariant(
    video.sourceUrl === `https://www.bilibili.com/video/${video.bvid}/`,
    `${label}.sourceUrl 与 bvid 不一致`,
  )
  return video
}

export function assertFavoriteVideo(video, label = 'video') {
  assertVideoMetadata(video, label)
  assertPositiveSafeInteger(video.favoriteId, `${label}.favoriteId`)
  assertPositiveSafeInteger(video.favoriteOrder, `${label}.favoriteOrder`)
  return video
}

function videoMetadataMatches(left, right) {
  return VIDEO_FIELDS.every((field) => left[field] === right[field])
}

function assertUnique(items, getKey, label) {
  const keys = items.map(getKey)
  invariant(new Set(keys).size === keys.length, `${label} 存在重复值`)
}

function assertFolder(folder, label) {
  invariant(isRecord(folder), `${label} 必须是对象`)
  assertPositiveSafeInteger(folder.favoriteId, `${label}.favoriteId`)
  assertNonEmptyString(folder.title, `${label}.title`)
  assertHttpsUrl(folder.sourceUrl, `${label}.sourceUrl`)
  assertHttpsUrl(folder.apiUrl, `${label}.apiUrl`)
  invariant(
    Number.isSafeInteger(folder.reportedItemCount) && folder.reportedItemCount >= 0,
    `${label}.reportedItemCount 无效`,
  )
  invariant(
    Number.isSafeInteger(folder.visibleItemCount) && folder.visibleItemCount >= 0,
    `${label}.visibleItemCount 无效`,
  )
  invariant(isRecord(folder.latestPage), `${label}.latestPage 必须是对象`)
  invariant(folder.latestPage.pageNumber === 1, `${label}.latestPage.pageNumber 必须为 1`)
  assertPositiveSafeInteger(folder.latestPage.pageSize, `${label}.latestPage.pageSize`)
  invariant(Array.isArray(folder.latestPage.items), `${label}.latestPage.items 必须是数组`)
  invariant(
    folder.latestPage.items.length <= folder.latestPage.pageSize,
    `${label}.latestPage.items 超过 pageSize`,
  )
  folder.latestPage.items.forEach((video, index) => {
    assertFavoriteVideo(video, `${label}.latestPage.items[${index}]`)
    invariant(video.favoriteId === folder.favoriteId, `${label} 的 favoriteId 不一致`)
    invariant(video.favoriteOrder === index + 1, `${label} 最新页顺序必须从 1 连续递增`)
  })
  assertUnique(folder.latestPage.items, (video) => video.bvid, `${label}.latestPage.bvid`)
}

function assertMapping(mapping, label, catalog, expectedFavoriteId) {
  invariant(isRecord(mapping), `${label} 必须是对象`)
  assertNonEmptyString(mapping.posterId, `${label}.posterId`)
  invariant(BVID_PATTERN.test(mapping.bvid), `${label}.bvid 格式无效`)
  invariant(mapping.favoriteId === expectedFavoriteId, `${label}.favoriteId 不一致`)
  assertPositiveSafeInteger(mapping.favoriteOrder, `${label}.favoriteOrder`)
  invariant(
    catalog.videos.some((video) => video.bvid === mapping.bvid),
    `${label}.bvid 不在 videos 中`,
  )
}

export function assertVideoCatalog(catalog) {
  invariant(isRecord(catalog), '视频目录必须是对象')
  invariant(catalog.schemaVersion === 1, '视频目录 schemaVersion 必须为 1')
  invariant(
    catalog.catalogId === 'travelling-bingo-bilibili-video-catalog',
    '视频目录 catalogId 无效',
  )
  assertIsoDate(catalog.retrievedAt, 'retrievedAt')
  assertPositiveSafeInteger(catalog.ownerMid, 'ownerMid')
  invariant(isRecord(catalog.folders), 'folders 必须是对象')
  assertFolder(catalog.folders.millionShots, 'folders.millionShots')
  assertFolder(catalog.folders.siteFirsts, 'folders.siteFirsts')

  invariant(Array.isArray(catalog.videos), 'videos 必须是数组')
  catalog.videos.forEach((video, index) => assertVideoMetadata(video, `videos[${index}]`))
  assertUnique(catalog.videos, (video) => video.bvid, 'videos.bvid')

  invariant(isRecord(catalog.posterMappings), 'posterMappings 必须是对象')
  const millionMappings = catalog.posterMappings.millionShots
  const siteMappings = catalog.posterMappings.siteFirsts
  invariant(
    Array.isArray(millionMappings) && millionMappings.length === 30,
    '百万直拍映射必须有 30 项',
  )
  invariant(Array.isArray(siteMappings) && siteMappings.length === 8, '全站第一映射必须有 8 项')
  millionMappings.forEach((mapping, index) => {
    assertMapping(
      mapping,
      `posterMappings.millionShots[${index}]`,
      catalog,
      catalog.folders.millionShots.favoriteId,
    )
    assertPositiveSafeInteger(mapping.sequence, `posterMappings.millionShots[${index}].sequence`)
  })
  siteMappings.forEach((mapping, index) => {
    assertMapping(
      mapping,
      `posterMappings.siteFirsts[${index}]`,
      catalog,
      catalog.folders.siteFirsts.favoriteId,
    )
    invariant(mapping.chronology === index + 1, '全站第一 chronology 必须从 1 连续递增')
    invariant(mapping.historyRank === 1, '全站第一映射必须保存 historyRank=1 的核验结果')
  })
  assertUnique(millionMappings, (mapping) => mapping.posterId, '百万直拍 posterId')
  assertUnique(millionMappings, (mapping) => mapping.sequence, '百万直拍 sequence')
  assertUnique(millionMappings, (mapping) => mapping.bvid, '百万直拍 bvid')
  assertUnique(siteMappings, (mapping) => mapping.posterId, '全站第一 posterId')
  assertUnique(siteMappings, (mapping) => mapping.chronology, '全站第一 chronology')
  invariant(siteMappings[0].posterId === 'site-first-dynamite', '全站第一必须从 Dynamite 开始')
  invariant(siteMappings.at(-1)?.posterId === 'site-first-power', '全站第一必须以 POWER 结束')

  invariant(isRecord(catalog.recordPlayer), 'recordPlayer 必须是对象')
  invariant(
    catalog.recordPlayer.sourceFavoriteId === catalog.folders.siteFirsts.favoriteId,
    '唱片机收藏夹来源不一致',
  )
  assertNonEmptyString(catalog.recordPlayer.selectionRule, 'recordPlayer.selectionRule')
  invariant(
    Array.isArray(catalog.recordPlayer.items) && catalog.recordPlayer.items.length === 8,
    '唱片机精选必须有 8 项',
  )
  catalog.recordPlayer.items.forEach((video, index) => {
    assertFavoriteVideo(video, `recordPlayer.items[${index}]`)
    const mapping = siteMappings[index]
    invariant(mapping?.chronology === index + 1, '唱片机精选 chronology 必须为第 1–8 项')
    invariant(mapping?.bvid === video.bvid, '唱片机精选与全站第一 chronology 不一致')
    invariant(mapping.favoriteId === video.favoriteId, '唱片机精选 favoriteId 与映射不一致')
    invariant(
      mapping.favoriteOrder === video.favoriteOrder,
      '唱片机精选 favoriteOrder 与映射不一致',
    )
    invariant(
      videoMetadataMatches(video, getVideoByBvid(catalog, mapping.bvid)),
      '唱片机精选元数据与视频索引不一致',
    )
  })

  invariant(!JSON.stringify(catalog).includes('"embedUrl"'), '视频目录不得持久化 embedUrl')
  return catalog
}

export function getVideoByBvid(catalog, bvid) {
  const video = catalog.videos.find((candidate) => candidate.bvid === bvid)
  invariant(video, `视频目录中找不到 ${bvid}`)
  return video
}

export function videoForMapping(catalog, mapping) {
  const video = getVideoByBvid(catalog, mapping.bvid)
  return {
    ...video,
    favoriteId: mapping.favoriteId,
    favoriteOrder: mapping.favoriteOrder,
  }
}

function favoriteVideoForBvid(catalog, bvid) {
  const millionLatest = catalog.folders.millionShots.latestPage.items.find(
    (video) => video.bvid === bvid,
  )
  if (millionLatest) return millionLatest

  const millionMapping = catalog.posterMappings.millionShots.find(
    (mapping) => mapping.bvid === bvid,
  )
  if (millionMapping) return videoForMapping(catalog, millionMapping)

  const siteFirstLatest = catalog.folders.siteFirsts.latestPage.items.find(
    (video) => video.bvid === bvid,
  )
  if (siteFirstLatest) return siteFirstLatest

  const siteFirstMapping = catalog.posterMappings.siteFirsts.find(
    (mapping) => mapping.bvid === bvid,
  )
  if (siteFirstMapping) return videoForMapping(catalog, siteFirstMapping)

  throw new Error(`视频 ${bvid} 缺少收藏夹快照位置`)
}

export function buildPublicVideoCatalog(catalog) {
  assertVideoCatalog(catalog)
  return {
    schemaVersion: 1,
    generatedFrom: catalog.catalogId,
    retrievedAt: catalog.retrievedAt,
    ownerMid: catalog.ownerMid,
    folders: {
      millionShots: {
        favoriteId: catalog.folders.millionShots.favoriteId,
        title: catalog.folders.millionShots.title,
        sourceUrl: catalog.folders.millionShots.sourceUrl,
        reportedItemCount: catalog.folders.millionShots.reportedItemCount,
        visibleItemCount: catalog.folders.millionShots.visibleItemCount,
        latestPage: catalog.folders.millionShots.latestPage,
      },
      siteFirsts: {
        favoriteId: catalog.folders.siteFirsts.favoriteId,
        title: catalog.folders.siteFirsts.title,
        sourceUrl: catalog.folders.siteFirsts.sourceUrl,
        reportedItemCount: catalog.folders.siteFirsts.reportedItemCount,
        visibleItemCount: catalog.folders.siteFirsts.visibleItemCount,
        latestPage: catalog.folders.siteFirsts.latestPage,
      },
    },
    videos: Object.fromEntries(
      catalog.videos.map((video) => [video.bvid, favoriteVideoForBvid(catalog, video.bvid)]),
    ),
    posterMappings: catalog.posterMappings,
    recordPlayer: catalog.recordPlayer,
  }
}
