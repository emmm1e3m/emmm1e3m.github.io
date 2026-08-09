import {
  type CollectibleCategory,
  type CollectibleItem,
  type BilibiliVideo,
  type BilibiliVideoMetadata,
  type BilibiliVideoCatalogSource,
  type FriendCatalogSource,
  type FriendItem,
  type MillionShotCatalogSource,
  type PostcardCatalogSource,
  type SiteFirstCatalogSource,
} from './schema'

export interface ContentCatalog {
  readonly items: readonly CollectibleItem[]
  readonly byId: Readonly<Record<string, CollectibleItem>>
  readonly categoryCounts: Readonly<Record<CollectibleCategory, number>>
  readonly siteFirstChronology: readonly string[]
  readonly friends: readonly FriendItem[]
  readonly friendById: Readonly<Record<string, FriendItem>>
  readonly videosByBvid: Readonly<Record<string, BilibiliVideoMetadata>>
  readonly recordPlayerVideos: readonly BilibiliVideo[]
}

export interface CollectionProgressGroup {
  readonly collected: number
  readonly total: number
  readonly remaining: number
  readonly percentage: number
}

export interface CollectionProgress extends CollectionProgressGroup {
  readonly byCategory: Readonly<Record<CollectibleCategory, CollectionProgressGroup>>
  readonly unknownIds: readonly string[]
}

const CATEGORIES = ['postcard', 'million-shot', 'site-first'] as const

function percentage(collected: number, total: number) {
  return total === 0 ? 0 : Math.round((collected / total) * 1000) / 10
}

function progressGroup(collected: number, total: number): CollectionProgressGroup {
  return Object.freeze({
    collected,
    total,
    remaining: Math.max(0, total - collected),
    percentage: percentage(collected, total),
  })
}

function sameVideoMetadata(left: BilibiliVideoMetadata, right: BilibiliVideoMetadata) {
  return (
    left.bvid === right.bvid &&
    left.title === right.title &&
    left.authorName === right.authorName &&
    left.authorMid === right.authorMid &&
    left.publishedAt === right.publishedAt &&
    left.durationSeconds === right.durationSeconds &&
    left.coverUrl === right.coverUrl &&
    left.sourceUrl === right.sourceUrl
  )
}

export function mergeContentCatalogs(
  millionShots: MillionShotCatalogSource,
  siteFirsts: SiteFirstCatalogSource,
  postcards: PostcardCatalogSource,
  friendCatalog: FriendCatalogSource,
  videoCatalog: BilibiliVideoCatalogSource,
): ContentCatalog {
  const items: readonly CollectibleItem[] = Object.freeze([
    ...postcards.items,
    ...millionShots.items,
    ...siteFirsts.items,
  ])
  const mutableIndex: Record<string, CollectibleItem> = Object.create(null) as Record<
    string,
    CollectibleItem
  >
  const mutableCounts: Record<CollectibleCategory, number> = {
    postcard: 0,
    'million-shot': 0,
    'site-first': 0,
  }

  for (const item of items) {
    if (Object.hasOwn(mutableIndex, item.id)) {
      throw new Error(`合并收藏目录时发现重复 ID：${item.id}`)
    }
    mutableIndex[item.id] = item
    mutableCounts[item.category] += 1
  }

  const mutableFriendIndex: Record<string, FriendItem> = Object.create(null) as Record<
    string,
    FriendItem
  >
  for (const friend of friendCatalog.items) {
    if (Object.hasOwn(mutableFriendIndex, friend.id)) {
      throw new Error(`合并好友目录时发现重复 ID：${friend.id}`)
    }
    mutableFriendIndex[friend.id] = friend
  }

  const videoMappingByPosterId = new Map(
    [...videoCatalog.posterMappings.millionShots, ...videoCatalog.posterMappings.siteFirsts].map(
      (mapping) => [mapping.posterId, mapping.bvid] as const,
    ),
  )
  for (const item of [...millionShots.items, ...siteFirsts.items]) {
    const embeddedVideo = item.metadata.video
    const indexedVideo = videoCatalog.videos[embeddedVideo.bvid]
    if (!indexedVideo || !sameVideoMetadata(embeddedVideo, indexedVideo)) {
      throw new Error(`收藏“${item.id}”的视频元数据与视频目录不一致`)
    }
    if (videoMappingByPosterId.get(item.id) !== embeddedVideo.bvid) {
      throw new Error(`收藏“${item.id}”没有唯一且一致的视频映射`)
    }
  }
  if (videoMappingByPosterId.size !== millionShots.items.length + siteFirsts.items.length) {
    throw new Error('视频目录含有未知、重复或缺失的收藏映射')
  }

  return Object.freeze({
    items,
    byId: Object.freeze(mutableIndex),
    categoryCounts: Object.freeze(mutableCounts),
    siteFirstChronology: Object.freeze(
      [...siteFirsts.items]
        .sort((left, right) => left.metadata.chronology - right.metadata.chronology)
        .map((item) => item.id),
    ),
    friends: Object.freeze([...friendCatalog.items]),
    friendById: Object.freeze(mutableFriendIndex),
    videosByBvid: Object.freeze({ ...videoCatalog.videos }),
    recordPlayerVideos: Object.freeze([...videoCatalog.recordPlayer.items]),
  })
}

export function getCollectibleById(
  catalog: ContentCatalog,
  id: string,
): CollectibleItem | undefined {
  return catalog.byId[id]
}

export function getFriendById(catalog: ContentCatalog, id: string): FriendItem | undefined {
  return catalog.friendById[id]
}

export function calculateCollectionProgress(
  catalog: ContentCatalog,
  collectedIds: Iterable<string>,
): CollectionProgress {
  const uniqueIds = new Set(collectedIds)
  const collectedByCategory: Record<CollectibleCategory, number> = {
    postcard: 0,
    'million-shot': 0,
    'site-first': 0,
  }
  const unknownIds: string[] = []

  for (const id of uniqueIds) {
    const item = catalog.byId[id]
    if (item) {
      collectedByCategory[item.category] += 1
    } else {
      unknownIds.push(id)
    }
  }

  unknownIds.sort()
  const collected = Object.values(collectedByCategory).reduce((sum, count) => sum + count, 0)
  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      progressGroup(collectedByCategory[category], catalog.categoryCounts[category]),
    ]),
  ) as Record<CollectibleCategory, CollectionProgressGroup>

  return Object.freeze({
    ...progressGroup(collected, catalog.items.length),
    byCategory: Object.freeze(byCategory),
    unknownIds: Object.freeze(unknownIds),
  })
}
