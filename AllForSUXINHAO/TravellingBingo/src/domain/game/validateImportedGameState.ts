import type { ActivityKind, CollectionCatalog, CollectibleCategory, GameState } from './types'

const CATEGORIES: readonly CollectibleCategory[] = ['postcard', 'million-shot', 'site-first']

const COLLECTION_CATEGORY_BY_ACTIVITY: Readonly<Record<ActivityKind, CollectibleCategory>> = {
  travel: 'postcard',
  stream: 'million-shot',
  trend: 'site-first',
}

export type ImportedGameStateValidationCode =
  | 'INVALID_CATALOG'
  | 'COLLECTION_KEY_MISMATCH'
  | 'UNKNOWN_COLLECTION'
  | 'REWARD_CATEGORY_MISMATCH'
  | 'UNKNOWN_REWARD_COLLECTION'
  | 'REWARD_CATALOG_CATEGORY_MISMATCH'

export type ImportedGameStateValidation =
  | { ok: true }
  | {
      ok: false
      code: ImportedGameStateValidationCode
      message: string
    }

function invalid(
  code: ImportedGameStateValidationCode,
  message: string,
): ImportedGameStateValidation {
  return { ok: false, code, message }
}

/**
 * Zod 负责存档形状；此处校验只能由当前内容目录确定的跨字段关系。
 * 调用方必须在展示导入预览或采用状态前执行本函数。
 */
export function validateImportedGameState(
  state: GameState,
  catalog: CollectionCatalog,
): ImportedGameStateValidation {
  const categoryById = new Map<string, CollectibleCategory>()
  for (const category of CATEGORIES) {
    for (const id of catalog[category]) {
      const previousCategory = categoryById.get(id)
      if (id.trim().length === 0 || previousCategory !== undefined) {
        return invalid(
          'INVALID_CATALOG',
          previousCategory === undefined
            ? '当前收藏目录含有空 ID，无法安全读取存档。'
            : `当前收藏目录的 ID“${id}”同时属于多个类别，无法安全读取存档。`,
        )
      }
      categoryById.set(id, category)
    }
  }

  for (const [collectionKey, entry] of Object.entries(state.collections)) {
    if (collectionKey !== entry.id) {
      return invalid(
        'COLLECTION_KEY_MISMATCH',
        `收藏记录键“${collectionKey}”与记录 ID“${entry.id}”不一致。`,
      )
    }
    if (!categoryById.has(entry.id)) {
      return invalid('UNKNOWN_COLLECTION', `收藏 ID“${entry.id}”不在当前收藏目录中。`)
    }
  }

  const activity = state.activeActivity
  const plannedCollection = activity?.rewardPlan.collection
  if (!activity || !plannedCollection) return { ok: true }

  const expectedCategory = COLLECTION_CATEGORY_BY_ACTIVITY[activity.kind]
  if (plannedCollection.category !== expectedCategory) {
    return invalid(
      'REWARD_CATEGORY_MISMATCH',
      `${activity.kind} 活动只能产生 ${expectedCategory} 收藏，存档却计划了 ${plannedCollection.category}。`,
    )
  }

  const catalogCategory = categoryById.get(plannedCollection.id)
  if (catalogCategory === undefined) {
    return invalid(
      'UNKNOWN_REWARD_COLLECTION',
      `活动奖励 ID“${plannedCollection.id}”不在当前收藏目录中。`,
    )
  }
  if (catalogCategory !== plannedCollection.category) {
    return invalid(
      'REWARD_CATALOG_CATEGORY_MISMATCH',
      `活动奖励 ID“${plannedCollection.id}”属于 ${catalogCategory}，与计划类别 ${plannedCollection.category} 不一致。`,
    )
  }

  return { ok: true }
}
