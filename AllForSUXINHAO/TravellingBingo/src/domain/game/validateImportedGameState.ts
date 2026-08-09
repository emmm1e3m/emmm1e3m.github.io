import { FRIEND_EVENT_IDS } from './constants'
import {
  FRIEND_GIFT_APPLES_BY_ID,
  FRIEND_GIFT_ITEM_BY_ID,
  LEGACY_FRIEND_GIFT_APPLES_BY_ID,
  REST_COMPLETION_APPLES,
  TRAVEL_FRIEND_GIFT_APPLES_BY_ID,
} from './gameBalance'
import { isPetTired } from '../pet/preferences'
import {
  hasRetiredTask,
  meetsTaskInstanceAssignmentRequirements,
  TASK_LIBRARY,
  validateTaskInstanceReachability,
} from '../tasks/taskBoard'
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
  | 'TASK_BOARD_INVALID'
  | 'PET_FATIGUE_MISMATCH'
  | 'POMODORO_BACKGROUND_INVALID'

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
  const hasCompatibleTravelGiftApples = (friendId: FriendId): boolean =>
    plan.modifierApples === 0 || plan.modifierApples === TRAVEL_FRIEND_GIFT_APPLES_BY_ID[friendId]

  if (activity.kind === 'music' || activity.kind === 'rest') {
    if (activity.legacySource !== undefined) {
      return mismatch('V1 不存在电子琴或睡觉活动，不能携带旧版来源标记。')
    }
    if (activity.supplyId !== null || activity.usedLuckyApple) {
      return mismatch('电子琴和睡觉活动不能携带活动补给或幸运苹果。')
    }
    if (plan.guaranteedByPity || plan.pityAfterClaim !== null) {
      return mismatch('电子琴和睡觉活动不能携带旧版保底计划。')
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
      : mismatch('睡觉活动只能计划固定的每日🍎，不能包含收藏或好友赠礼。')
  }

  if (activity.kind === 'music') {
    if (plan.baseApples !== 0 || plan.collection !== null || plan.giftItemId !== null) {
      return mismatch('电子琴活动不能包含基础🍎、收藏或道具赠礼。')
    }
    if (plan.friendId === null) {
      return plan.modifierApples === 0
        ? { ok: true }
        : mismatch('没有好友造访时不能计划好友赠送的🍎。')
    }
    if (state.friends[plan.friendId] === undefined) {
      return mismatch('电子琴只能召来已经认识的朋友。')
    }
    return plan.modifierApples === FRIEND_GIFT_APPLES_BY_ID[plan.friendId] ||
      plan.modifierApples === LEGACY_FRIEND_GIFT_APPLES_BY_ID[plan.friendId]
      ? { ok: true }
      : mismatch('好友赠送的🍎数量与当前好友不一致。')
  }

  // V1 的普通活动曾冻结苹果与保底展示信息；迁移写入显式来源。
  // 计划只兑现，不再继续旧保底计数。
  const hasCurrentOrPreviousTravelGift =
    activity.kind === 'travel' &&
    activity.legacySource === undefined &&
    plan.baseApples === 0 &&
    plan.friendId !== null &&
    plan.collection === null &&
    plan.giftItemId === FRIEND_GIFT_ITEM_BY_ID[plan.friendId] &&
    hasCompatibleTravelGiftApples(plan.friendId)
  const hasLegacyAppleReward =
    plan.baseApples !== 0 || (plan.modifierApples !== 0 && !hasCurrentOrPreviousTravelGift)
  const hasLegacyPitySnapshot = plan.guaranteedByPity || plan.pityAfterClaim !== null
  if ((hasLegacyAppleReward || hasLegacyPitySnapshot) && activity.legacySource !== 'v1') {
    return mismatch('只有显式迁移的 V1 活动才能携带旧版苹果或保底计划。')
  }
  if (hasLegacyAppleReward && plan.giftItemId !== null) {
    return mismatch('旧版活动的🍎计划不能同时伪造新版好友道具。')
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
  return plan.collection === null &&
    plan.giftItemId === FRIEND_GIFT_ITEM_BY_ID[plan.friendId] &&
    hasCompatibleTravelGiftApples(plan.friendId)
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

  if (hasRetiredTask(state.tasks)) {
    return invalid('TASK_BOARD_INVALID', '任务板仍包含已经退役、无法继续完成的任务。')
  }
  const taskInstanceIds = new Set<string>()
  const taskTriggerGroups = new Set<string>()
  for (const task of state.tasks.active) {
    const template = TASK_LIBRARY[task.taskId]
    if (taskInstanceIds.has(task.instanceId)) {
      return invalid('TASK_BOARD_INVALID', '任务板中的任务实例 ID 必须互不重复。')
    }
    taskInstanceIds.add(task.instanceId)
    if (
      !Number.isSafeInteger(task.progress) ||
      task.progress < 0 ||
      !Number.isSafeInteger(task.target) ||
      task.target <= 0 ||
      !Number.isSafeInteger(task.rewardApples) ||
      task.rewardApples < 0
    ) {
      return invalid('TASK_BOARD_INVALID', '任务目标、进度与奖励必须是有效的安全整数。')
    }
    if (task.progress > task.target) {
      return invalid('TASK_BOARD_INVALID', '任务进度不能超过任务目标。')
    }
    if (new Set(task.seenKeys).size !== task.seenKeys.length) {
      return invalid('TASK_BOARD_INVALID', '任务进度记录不能包含重复事件。')
    }
    if (task.seenKeys.length !== task.progress) {
      return invalid('TASK_BOARD_INVALID', '任务进度必须与已记录的独立事件数量一致。')
    }
    const reachability = validateTaskInstanceReachability(task, catalog)
    if (!reachability.ok) {
      return invalid('TASK_BOARD_INVALID', reachability.message)
    }
    if (
      task.progress < task.target &&
      !meetsTaskInstanceAssignmentRequirements(task, {
        catalog,
        collections: state.collections,
        oneOffCompleted: state.tasks.oneOffCompleted,
      })
    ) {
      return invalid('TASK_BOARD_INVALID', '任务板包含当前没有完成条件的未完成任务。')
    }
    if (template.oneOff) {
      const recorded = state.tasks.oneOffCompleted.includes(task.taskId)
      if (task.progress < task.target && recorded) {
        return invalid('TASK_BOARD_INVALID', '已经完成过的一次性任务不能再次出现在任务板。')
      }
      if (task.progress >= task.target && !recorded) {
        return invalid('TASK_BOARD_INVALID', '已经完成的一次性任务必须记录在完成列表中。')
      }
    }
    if (taskTriggerGroups.has(template.triggerGroup)) {
      return invalid('TASK_BOARD_INVALID', '同一任务板的三项任务必须来自不同触发组。')
    }
    taskTriggerGroups.add(template.triggerGroup)
  }

  const taskBoardCompleted = state.tasks.active.every((task) => task.progress >= task.target)
  if (taskBoardCompleted !== (state.tasks.completedAt !== null)) {
    return invalid('TASK_BOARD_INVALID', '任务板完成状态与完成时间不一致。')
  }
  if (
    state.tasks.completedAt !== null &&
    state.tasks.completedAt < Math.max(...state.tasks.active.map((task) => task.assignedAt))
  ) {
    return invalid('TASK_BOARD_INVALID', '任务板完成时间不能早于任务签发时间。')
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

  const pomodoroPostcardIds = [
    state.reality.pomodoro.selectedPostcardId,
    state.reality.pomodoro.session?.postcardId ?? null,
  ]
  for (const postcardId of pomodoroPostcardIds) {
    if (
      postcardId !== null &&
      (!catalog.postcard.includes(postcardId) || state.collections[postcardId] === undefined)
    ) {
      return invalid(
        'POMODORO_BACKGROUND_INVALID',
        `苹果钟背景“${postcardId}”不是当前已拥有的明信片。`,
      )
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
