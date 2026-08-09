import type { ActivityRun, CollectionCatalog, CollectibleCategory, GameState } from './types'

const COLLECTION_CATEGORY_BY_ACTIVITY: Partial<Record<ActivityRun['kind'], CollectibleCategory>> = {
  travel: 'postcard',
  stream: 'million-shot',
  trend: 'site-first',
}

/** 只协调本来就能通过奖励组合校验的旧计划，不能借删除字段掩盖篡改。 */
function canClearDuplicatePlan(activity: ActivityRun): boolean {
  const plan = activity.rewardPlan
  if (
    activity.legacySource === 'v1' ||
    plan.collection === null ||
    COLLECTION_CATEGORY_BY_ACTIVITY[activity.kind] !== plan.collection.category ||
    plan.baseApples !== 0 ||
    plan.modifierApples !== 0 ||
    plan.guaranteedByPity ||
    plan.pityAfterClaim !== null
  ) {
    return false
  }
  if (plan.friendId === null) return plan.giftItemId === null
  // 旧 V1/V2 可以保留 collection + friend 双结果，但从不补抽好友道具。
  return plan.giftItemId === null
}

/**
 * 兼容早期 v2 在活动开始时计划了重复收藏的存档。只清除尚未领取的重复结果，
 * 不保存目录总数、解锁类别或下一个索引，也不会改动已经拥有的历史记录。
 */
export function reconcileGameStateWithCatalog(
  state: GameState,
  catalog: CollectionCatalog,
): GameState {
  const plannedCollection = state.activeActivity?.rewardPlan.collection
  const clearsPlannedCollection =
    state.activeActivity !== null &&
    canClearDuplicatePlan(state.activeActivity) &&
    plannedCollection !== null &&
    plannedCollection !== undefined &&
    catalog[plannedCollection.category].includes(plannedCollection.id) &&
    state.collections[plannedCollection.id] !== undefined

  const selectedPostcardId = state.reality.pomodoro.selectedPostcardId
  const sessionPostcardId = state.reality.pomodoro.session?.postcardId ?? null
  const isUsablePostcard = (id: string | null): boolean =>
    id === null || (catalog.postcard.includes(id) && state.collections[id] !== undefined)
  const clearsSelectedPostcard = !isUsablePostcard(selectedPostcardId)
  const clearsSessionPostcard = !isUsablePostcard(sessionPostcardId)
  if (!clearsPlannedCollection && !clearsSelectedPostcard && !clearsSessionPostcard) return state

  return {
    ...state,
    activeActivity: clearsPlannedCollection
      ? {
          ...state.activeActivity!,
          rewardPlan: {
            ...state.activeActivity!.rewardPlan,
            collection: null,
          },
        }
      : state.activeActivity,
    reality:
      clearsSelectedPostcard || clearsSessionPostcard
        ? {
            ...state.reality,
            pomodoro: {
              ...state.reality.pomodoro,
              selectedPostcardId: clearsSelectedPostcard ? null : selectedPostcardId,
              session: clearsSessionPostcard
                ? { ...state.reality.pomodoro.session!, postcardId: null }
                : state.reality.pomodoro.session,
            },
          }
        : state.reality,
  }
}
