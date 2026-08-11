import type { ActivityRun, CollectionCatalog, CollectibleCategory, GameState } from './types'
import { reconcileTaskBoardAvailability } from '../tasks/taskBoard'

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
 * 在所有版本迁移汇合后统一协调依赖当前目录的安全旧引用：只清除尚未领取的
 * 重复结果、失效明信片，并重签合法但已失去收藏条件的未完成任务槽位。
 */
export function reconcileGameStateWithCatalog(
  state: GameState,
  catalog: CollectionCatalog,
): GameState {
  const reconciledTasks = reconcileTaskBoardAvailability({
    board: state.tasks,
    seed: state.random.seed,
    sequence: state.random.sequences.tasks,
    catalog,
    collections: state.collections,
  })
  const repairsTaskBoard = reconciledTasks.board !== state.tasks
  const plannedCollection = state.activeActivity?.rewardPlan.collection
  const clearsPlannedCollection =
    state.activeActivity !== null &&
    canClearDuplicatePlan(state.activeActivity) &&
    plannedCollection !== null &&
    plannedCollection !== undefined &&
    catalog[plannedCollection.category].includes(plannedCollection.id) &&
    state.collections[plannedCollection.id] !== undefined

  const selectedBackground = state.reality.pomodoro.selectedBackground
  const sessionBackground = state.reality.pomodoro.session?.background ?? null
  const isUsablePostcard = (id: string | null): boolean =>
    id === null || (catalog.postcard.includes(id) && state.collections[id] !== undefined)
  const isUsablePomodoroBackground = (background: typeof selectedBackground): boolean =>
    background === null ||
    (background.kind === 'postcard'
      ? isUsablePostcard(background.id)
      : state.wardrobe.photos[background.id] !== undefined)
  const clearsSelectedBackground = !isUsablePomodoroBackground(selectedBackground)
  const clearsSessionBackground = !isUsablePomodoroBackground(sessionBackground)
  const clearsPhotoBackgrounds = Object.values(state.wardrobe.photos).some(
    (photo) => !isUsablePostcard(photo.postcardId),
  )
  if (
    !repairsTaskBoard &&
    !clearsPlannedCollection &&
    !clearsSelectedBackground &&
    !clearsSessionBackground &&
    !clearsPhotoBackgrounds
  ) {
    return state
  }

  return {
    ...state,
    tasks: reconciledTasks.board,
    random: repairsTaskBoard
      ? {
          ...state.random,
          sequences: { ...state.random.sequences, tasks: reconciledTasks.nextSequence },
        }
      : state.random,
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
      clearsSelectedBackground || clearsSessionBackground
        ? {
            ...state.reality,
            pomodoro: {
              ...state.reality.pomodoro,
              selectedBackground: clearsSelectedBackground ? null : selectedBackground,
              session: clearsSessionBackground
                ? { ...state.reality.pomodoro.session!, background: null }
                : state.reality.pomodoro.session,
            },
          }
        : state.reality,
    wardrobe: clearsPhotoBackgrounds
      ? {
          ...state.wardrobe,
          photos: Object.fromEntries(
            Object.entries(state.wardrobe.photos).map(([photoId, photo]) => [
              photoId,
              isUsablePostcard(photo.postcardId) ? photo : { ...photo, postcardId: null },
            ]),
          ),
        }
      : state.wardrobe,
  }
}
