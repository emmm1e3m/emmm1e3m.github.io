import type { CollectionCatalog, GameState } from './types'

/**
 * 兼容早期 v2 在活动开始时计划了重复收藏的存档。只清除尚未领取的重复结果，
 * 不保存目录总数、解锁类别或下一个索引，也不会改动已经拥有的历史记录。
 */
export function reconcileGameStateWithCatalog(
  state: GameState,
  catalog: CollectionCatalog,
): GameState {
  const plannedCollection = state.activeActivity?.rewardPlan.collection
  if (plannedCollection === null || plannedCollection === undefined) return state
  if (!catalog[plannedCollection.category].includes(plannedCollection.id)) return state
  if (state.collections[plannedCollection.id] === undefined) return state

  return {
    ...state,
    activeActivity: {
      ...state.activeActivity!,
      rewardPlan: {
        ...state.activeActivity!.rewardPlan,
        collection: null,
      },
    },
  }
}
