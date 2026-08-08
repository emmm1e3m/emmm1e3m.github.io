import {
  type CollectibleCategory,
  type CollectibleItem,
  type MillionShotCatalogSource,
  type PostcardCatalogSource,
  type SiteFirstCatalogSource,
} from './schema'

export interface ContentCatalog {
  readonly items: readonly CollectibleItem[]
  readonly byId: Readonly<Record<string, CollectibleItem>>
  readonly categoryCounts: Readonly<Record<CollectibleCategory, number>>
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

export function mergeContentCatalogs(
  millionShots: MillionShotCatalogSource,
  siteFirsts: SiteFirstCatalogSource,
  postcards: PostcardCatalogSource,
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

  return Object.freeze({
    items,
    byId: Object.freeze(mutableIndex),
    categoryCounts: Object.freeze(mutableCounts),
  })
}

export function getCollectibleById(
  catalog: ContentCatalog,
  id: string,
): CollectibleItem | undefined {
  return catalog.byId[id]
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
