import type { CollectionCatalog, CollectibleCategory } from './types'

const CATEGORIES: readonly CollectibleCategory[] = ['postcard', 'million-shot', 'site-first']

export type CollectionCatalogValidation = { ok: true } | { ok: false; message: string }

/** 校验 ID 唯一性及全站第一“旧到新”序列与类别 ID 集合完全一致。 */
export function validateCollectionCatalog(catalog: CollectionCatalog): CollectionCatalogValidation {
  const seen = new Set<string>()
  for (const category of CATEGORIES) {
    for (const id of catalog[category]) {
      if (id.trim().length === 0 || seen.has(id)) {
        return {
          ok: false,
          message: `收藏目录包含空 ID 或重复 ID：${id || '（空）'}`,
        }
      }
      seen.add(id)
    }
  }

  const siteFirstIds = new Set(catalog['site-first'])
  const chronologyIds = new Set(catalog.siteFirstChronology)
  if (
    chronologyIds.size !== catalog.siteFirstChronology.length ||
    chronologyIds.size !== siteFirstIds.size ||
    catalog.siteFirstChronology.some((id) => !siteFirstIds.has(id))
  ) {
    return {
      ok: false,
      message: '全站第一时间序列必须与该类别 ID 完整且唯一地对应。',
    }
  }

  return { ok: true }
}
