import { FRIEND_EVENT_IDS } from './constants'
import {
  FRIEND_GIFT_APPLES_BY_ID,
  FRIEND_GIFT_ITEM_BY_ID,
  REST_COMPLETION_APPLES,
} from './gameBalance'
import { isPetTired } from '../pet/preferences'
import type {
  CollectionCatalog,
  CollectibleActivityKind,
  CollectibleCategory,
  FriendId,
  GameState,
} from './types'
import { validateCollectionCatalog } from './validateCollectionCatalog'

const CATEGORIES: readonly CollectibleCategory[] = ['postcard', 'million-shot', 'site-first']

const COLLECTION_CATEGORY_BY_ACTIVITY: Readonly<
  Record<CollectibleActivityKind, CollectibleCategory>
> = {
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
  | 'FRIEND_KEY_MISMATCH'
  | 'UNKNOWN_FRIEND'
  | 'REWARD_PLAN_MISMATCH'
  | 'ACTIVITY_TIME_INVALID'
  | 'TASK_BOARD_STALLED'
  | 'PET_FATIGUE_MISMATCH'

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

function validateRewardPlan(state: GameState): ImportedGameStateValidation {
  const activity = state.activeActivity
  if (activity === null) return { ok: true }

  const plan = activity.rewardPlan
  const mismatch = (message: string): ImportedGameStateValidation =>
    invalid('REWARD_PLAN_MISMATCH', message)

  if (activity.kind === 'music' || activity.kind === 'rest') {
    if (activity.supplyId !== null || activity.usedLuckyApple) {
      return mismatch('电子琴和睡觉活动不能携带活动补给或幸运苹果。')
    }
  } else if (
    (activity.kind === 'travel' &&
      activity.supplyId !== 'travel-basic' &&
      activity.supplyId !== 'travel-apple') ||
    (activity.kind === 'stream' && activity.supplyId !== 'signal-headphones') ||
    (activity.kind === 'trend' && activity.supplyId !== 'trend-toolbox')
  ) {
    return mismatch('活动使用的补给与活动种类不一致。')
  }

  if (activity.kind === 'rest') {
    return plan.baseApples === REST_COMPLETION_APPLES &&
      plan.modifierApples === 0 &&
      plan.collection === null &&
      plan.friendId === null &&
      plan.giftItemId === null
      ? { ok: true }
      : mismatch('睡觉活动只能计划固定的每日苹果，不能包含收藏或好友赠礼。')
  }

  if (activity.kind === 'music') {
    if (plan.baseApples !== 0 || plan.collection !== null || plan.giftItemId !== null) {
      return mismatch('电子琴活动不能包含基础苹果、收藏或道具赠礼。')
    }
    if (plan.friendId === null) {
      return plan.modifierApples === 0
        ? { ok: true }
        : mismatch('没有好友造访时不能计划好友赠送的苹果。')
    }
    if (state.friends[plan.friendId] === undefined) {
      return mismatch('电子琴只能召来已经认识的朋友。')
    }
    return plan.modifierApples === FRIEND_GIFT_APPLES_BY_ID[plan.friendId]
      ? { ok: true }
      : mismatch('好友赠送的苹果数与当前好友不一致。')
  }

  if (plan.baseApples !== 0 || plan.modifierApples !== 0) {
    return mismatch('旅行、刷播和冲热活动不能直接计划苹果奖励。')
  }

  if (activity.kind === 'stream' || activity.kind === 'trend') {
    // V3 新电脑活动不会规划好友；但旧 V1/V2 的通用 friendEventId 字段可随
    // 任意旧活动迁移。只允许它以无苹果、无道具的 legacy 结果完成结算。
    return plan.giftItemId === null ? { ok: true } : mismatch('电脑活动不能计划好友道具赠礼。')
  }

  if (plan.friendId === null) {
    return plan.giftItemId === null ? { ok: true } : mismatch('没有遇见朋友时不能计划好友道具。')
  }

  // 新 V3 旅行遇友必须与明信片互斥并匹配固定礼物；旧 V1/V2 活动允许
  // collection + friend 双结果，但迁移后 giftItemId 固定为 null。
  if (plan.giftItemId === null) return { ok: true }
  return plan.collection === null && plan.giftItemId === FRIEND_GIFT_ITEM_BY_ID[plan.friendId]
    ? { ok: true }
    : mismatch('旅行好友、明信片与好友礼物的计划组合不一致。')
}

/**
 * Zod 负责存档形状；此处校验只能由当前内容目录确定的跨字段关系。
 * 调用方必须在展示导入预览或采用状态前执行本函数。
 */
export function validateImportedGameState(
  state: GameState,
  catalog: CollectionCatalog,
): ImportedGameStateValidation {
  const catalogValidation = validateCollectionCatalog(catalog)
  if (!catalogValidation.ok) {
    return invalid('INVALID_CATALOG', catalogValidation.message)
  }

  if (state.tasks.active.every((task) => task.progress >= task.target)) {
    return invalid(
      'TASK_BOARD_STALLED',
      '任务板中的三件小事都已完成，却没有刷新；请使用完成前保存的存档。',
    )
  }

  if (state.pet.tired !== isPetTired(state.pet.preferences)) {
    return invalid(
      'PET_FATIGUE_MISMATCH',
      '饼狗的疲劳状态与当前活动意愿不一致，请使用正常导出的存档。',
    )
  }

  const categoryById = new Map<string, CollectibleCategory>()
  for (const category of CATEGORIES) {
    for (const id of catalog[category]) {
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

  const knownFriendIds = new Set<FriendId>(FRIEND_EVENT_IDS)
  for (const [friendKey, entry] of Object.entries(state.friends)) {
    if (!knownFriendIds.has(friendKey as FriendId)) {
      return invalid('UNKNOWN_FRIEND', `好友 ID“${friendKey}”不在当前好友目录中。`)
    }
    if (friendKey !== entry.id) {
      return invalid(
        'FRIEND_KEY_MISMATCH',
        `好友记录键“${friendKey}”与记录 ID“${entry.id}”不一致。`,
      )
    }
  }

  const rewardPlanValidation = validateRewardPlan(state)
  if (!rewardPlanValidation.ok) return rewardPlanValidation

  const activity = state.activeActivity
  if (activity !== null && activity.endsAt < activity.startedAt) {
    return invalid('ACTIVITY_TIME_INVALID', '活动结束时间不能早于开始时间。')
  }
  const plannedCollection = activity?.rewardPlan.collection
  if (!activity || !plannedCollection) return { ok: true }

  if (activity.kind === 'music' || activity.kind === 'rest') {
    return invalid('REWARD_CATEGORY_MISMATCH', `${activity.kind} 活动不能产生收藏奖励。`)
  }
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
