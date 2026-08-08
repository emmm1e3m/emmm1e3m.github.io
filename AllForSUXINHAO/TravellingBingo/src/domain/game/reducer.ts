import { deriveActivityTiming } from '../activities/timing'
import {
  exhaustActivityPreference,
  generateActivityPreferences,
  interestForActivity,
  isPetTired,
} from '../pet/preferences'
import { hashSeed } from '../rewards/prng'
import { planActivityReward } from '../rewards/planReward'
import { getLuckyAppleAvailability } from '../rewards/luckyApple'
import { applyTaskEvent } from '../tasks/taskBoard'
import {
  FRIEND_EVENT_IDS,
  ITEM_PRICES,
  MAX_APPLES,
  MAX_COMPANION_DAYS,
  MAX_ITEM_STACK,
  PET_ENCOURAGEMENT_APPLE_COST,
} from './constants'
import {
  createDefaultGameBalance,
  isValidActivityDuration,
  isValidProbability,
} from './gameBalance'
import { validateCollectionCatalog } from './validateCollectionCatalog'
import type {
  ActivityKind,
  ActivityRun,
  ClaimSummary,
  CollectionCatalog,
  CollectibleCategory,
  FriendCollection,
  GameAction,
  GameEffect,
  GameError,
  GameState,
  GameTransition,
  ItemId,
} from './types'

const CATEGORIES: readonly CollectibleCategory[] = ['postcard', 'million-shot', 'site-first']

function fail(state: GameState, code: GameError['code'], message: string): GameTransition {
  return { ok: false, state, error: { code, message }, effects: [] }
}

function succeed(
  state: GameState,
  effects: Extract<GameTransition, { ok: true }>['effects'] = [],
): GameTransition {
  return { ok: true, state, effects }
}

function isValidTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function categoryForActivity(kind: ActivityKind): CollectibleCategory | null {
  if (kind === 'travel') return 'postcard'
  if (kind === 'stream') return 'million-shot'
  if (kind === 'trend') return 'site-first'
  return null
}

type SupplyResolution = { ok: true; supplyId: ItemId | null } | { ok: false }

function resolveSupply(
  state: GameState,
  kind: ActivityKind,
  requestedSupply: ItemId | undefined,
): SupplyResolution {
  if (kind === 'music' || kind === 'rest') {
    return requestedSupply === undefined ? { ok: true, supplyId: null } : { ok: false }
  }
  if (kind === 'stream') {
    return requestedSupply === undefined || requestedSupply === 'signal-headphones'
      ? { ok: true, supplyId: 'signal-headphones' }
      : { ok: false }
  }
  if (kind === 'trend') {
    return requestedSupply === undefined || requestedSupply === 'trend-toolbox'
      ? { ok: true, supplyId: 'trend-toolbox' }
      : { ok: false }
  }

  if (requestedSupply !== undefined) {
    return requestedSupply === 'travel-basic' || requestedSupply === 'travel-apple'
      ? { ok: true, supplyId: requestedSupply }
      : { ok: false }
  }
  if (state.inventory['travel-basic'] > 0) return { ok: true, supplyId: 'travel-basic' }
  return { ok: true, supplyId: 'travel-apple' }
}

function resolveDuration(
  state: GameState,
  debugDurationMs: number | undefined,
): number | GameError {
  if (debugDurationMs === undefined) return state.gameBalance.activityDurationMs
  if (!state.profile.debug) {
    return { code: 'DEBUG_REQUIRED', message: '只有调试档可以覆盖活动时长' }
  }
  if (!isValidActivityDuration(debugDurationMs)) {
    return {
      code: 'INVALID_DURATION',
      message: '调试活动时长必须是 1ms 到 30 天之间的安全整数',
    }
  }
  return debugDurationMs
}

function activityRefusalMessage(kind: ActivityKind): string {
  if (kind === 'travel') return '饼狗今天不太想出门，先让它休息一下吧'
  if (kind === 'stream') return '饼狗今天不太想刷播，先让它休息一下吧'
  if (kind === 'trend') return '饼狗今天不太想冲热，先让它休息一下吧'
  if (kind === 'music') return '饼狗今天不太想弹琴，先让它休息一下吧'
  return '饼狗已经在床边，可以安心睡一觉'
}

function locationForActivity(kind: ActivityKind): GameState['pet']['location'] {
  if (kind === 'travel') return 'outside'
  if (kind === 'stream' || kind === 'trend') return 'computer'
  if (kind === 'music') return 'piano'
  return 'bed'
}

function returnLocationForActivity(kind: ActivityKind): GameState['pet']['location'] {
  return kind === 'travel' ? 'door' : locationForActivity(kind)
}

function startActivity(
  state: GameState,
  action: Extract<GameAction, { type: 'activity/start' }>,
  catalog: CollectionCatalog,
): GameTransition {
  if (state.activeActivity !== null) {
    return fail(state, 'ACTIVITY_ALREADY_ACTIVE', '同一时间只能进行一个活动')
  }
  if (!isValidTimestamp(action.now)) {
    return fail(state, 'INVALID_TIME', '活动开始时间无效')
  }
  if (state.profile.companionDays >= MAX_COMPANION_DAYS) {
    return fail(state, 'COMPANION_DAY_LIMIT_REACHED', '陪伴天数已达到存档上限')
  }
  const interest = interestForActivity(action.kind)
  if (interest !== null && (state.pet.tired || !state.pet.preferences[interest])) {
    return fail(state, 'ACTIVITY_REFUSED', activityRefusalMessage(action.kind))
  }

  const catalogValidation = validateCollectionCatalog(catalog)
  if (!catalogValidation.ok) return fail(state, 'INVALID_CATALOG', catalogValidation.message)
  const targetCategory = categoryForActivity(action.kind)
  if (targetCategory !== null && catalog[targetCategory].length === 0) {
    return fail(state, 'EMPTY_COLLECTION_POOL', `${targetCategory} 收藏池为空，无法开始活动`)
  }
  const supplyResolution = resolveSupply(state, action.kind, action.supplyId)
  if (!supplyResolution.ok) {
    return fail(state, 'INVALID_SUPPLY', '所选补给不能用于这个活动')
  }
  const supplyId = supplyResolution.supplyId
  if (action.useLuckyApple === true) {
    const availability = getLuckyAppleAvailability(state, action.kind, catalog, supplyId)
    if (!availability.canUse) {
      return fail(state, 'LUCKY_APPLE_NOT_USEFUL', availability.message)
    }
  }
  if (supplyId !== null && state.inventory[supplyId] < 1) {
    return fail(state, 'MISSING_REQUIRED_ITEM', `缺少活动补给：${supplyId}`)
  }
  if (action.useLuckyApple === true && state.inventory['lucky-apple'] < 1) {
    return fail(state, 'MISSING_REQUIRED_ITEM', '缺少幸运苹果')
  }

  const duration = resolveDuration(state, action.debugDurationMs)
  if (typeof duration !== 'number') return fail(state, duration.code, duration.message)
  const endsAt = action.now + duration
  if (!Number.isSafeInteger(endsAt)) {
    return fail(state, 'INVALID_DURATION', '活动结束时间超出安全整数范围')
  }

  const sequence = state.random.sequences.reward
  const advancesRewardSequence = action.kind !== 'rest'
  const rewardSeed = advancesRewardSequence
    ? `${state.random.seed}:reward:${sequence}`
    : `${state.random.seed}:rest:${state.profile.companionDays}:${action.now}`
  const rewardPlan = planActivityReward({
    kind: action.kind,
    rewardSeed,
    catalog,
    ownedCollectionIds: new Set(Object.keys(state.collections)),
    knownFriendIds: new Set(
      FRIEND_EVENT_IDS.filter((friendId) => state.friends[friendId] !== undefined),
    ),
    supplyId,
    usedLuckyApple: action.useLuckyApple === true,
    probabilities: state.gameBalance.probabilities,
  })
  const runId = `run-${sequence.toString(36)}-${hashSeed(`${rewardSeed}:${action.kind}:${action.now}`).toString(36)}`
  const activity: ActivityRun = {
    runId,
    kind: action.kind,
    startedAt: action.now,
    endsAt,
    rewardSeed,
    rewardPlan,
    supplyId,
    usedLuckyApple: action.useLuckyApple === true,
  }
  const nextInventory = { ...state.inventory }
  if (supplyId !== null) nextInventory[supplyId] -= 1
  if (action.useLuckyApple === true) {
    nextInventory['lucky-apple'] -= 1
  }
  const nextState: GameState = {
    ...state,
    inventory: nextInventory,
    activeActivity: activity,
    pet: {
      ...state.pet,
      location: locationForActivity(action.kind),
    },
    random: {
      ...state.random,
      sequences: {
        ...state.random.sequences,
        reward: sequence + (advancesRewardSequence ? 1 : 0),
      },
    },
    statistics: {
      ...state.statistics,
      started: {
        ...state.statistics.started,
        [action.kind]: state.statistics.started[action.kind] + 1,
      },
    },
  }

  return succeed(nextState, [{ type: 'activity-started', activity }])
}

function cancelActivity(
  state: GameState,
  action: Extract<GameAction, { type: 'activity/cancel' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '取消时间无效')
  const activity = state.activeActivity
  if (activity === null) return fail(state, 'ACTIVITY_NOT_ACTIVE', '当前没有可取消的活动')
  if (activity.runId !== action.runId) {
    return fail(state, 'RUN_ID_MISMATCH', '取消请求与当前活动不一致')
  }
  if (action.now < activity.startedAt) {
    return fail(state, 'INVALID_TIME', '取消时间不能早于活动开始时间')
  }

  return succeed(
    {
      ...state,
      activeActivity: null,
      pet: { ...state.pet, location: returnLocationForActivity(activity.kind) },
    },
    [{ type: 'activity-cancelled', activity, cancelledAt: action.now }],
  )
}

function claimActivity(
  state: GameState,
  action: Extract<GameAction, { type: 'activity/claim' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) {
    return fail(state, 'INVALID_TIME', '领取时间无效')
  }
  const activity = state.activeActivity
  if (activity === null) {
    return fail(state, 'ACTIVITY_NOT_ACTIVE', '当前没有可领取的活动')
  }
  if (activity.runId !== action.runId) {
    return fail(state, 'RUN_ID_MISMATCH', '领取请求与当前活动不一致')
  }
  if (activity.endsAt < activity.startedAt) {
    return fail(state, 'INVALID_TIME', '活动结束时间不能早于开始时间')
  }
  if (deriveActivityTiming(activity, action.now).phase !== 'ready') {
    return fail(state, 'ACTIVITY_NOT_READY', '活动尚未完成')
  }
  if (state.profile.companionDays >= MAX_COMPANION_DAYS) {
    return fail(state, 'COMPANION_DAY_LIMIT_REACHED', '陪伴天数已达到存档上限')
  }

  const plannedCollection = activity.rewardPlan.collection
  const existingCollection = plannedCollection ? state.collections[plannedCollection.id] : undefined
  const nextCollections = { ...state.collections }
  if (plannedCollection !== null && existingCollection === undefined) {
    nextCollections[plannedCollection.id] = {
      id: plannedCollection.id,
      firstObtainedAt: action.now,
      duplicateCount: 0,
    }
  }

  const availableAppleCapacity = MAX_APPLES - state.economy.apples
  const baseApples = Math.min(activity.rewardPlan.baseApples, availableAppleCapacity)
  const modifierApples = Math.min(
    activity.rewardPlan.modifierApples,
    availableAppleCapacity - baseApples,
  )
  const totalApples = baseApples + modifierApples

  const nextInventory = { ...state.inventory }
  const plannedGiftItemId = activity.rewardPlan.giftItemId
  const awardedGiftItemId =
    plannedGiftItemId !== null && nextInventory[plannedGiftItemId] < MAX_ITEM_STACK
      ? plannedGiftItemId
      : null
  if (awardedGiftItemId !== null) nextInventory[awardedGiftItemId] += 1

  const nextFriends: FriendCollection = { ...state.friends }
  const friendId = activity.rewardPlan.friendId
  if (friendId !== null) {
    const previous = state.friends[friendId]
    nextFriends[friendId] = previous
      ? {
          ...previous,
          lastMetAt: action.now,
          encounterCount: previous.encounterCount + 1,
          totalGiftApples: previous.totalGiftApples + modifierApples,
        }
      : {
          id: friendId,
          firstMetAt: action.now,
          lastMetAt: action.now,
          encounterCount: 1,
          totalGiftApples: modifierApples,
        }
  }

  const summary: ClaimSummary = {
    runId: activity.runId,
    kind: activity.kind,
    apples: {
      base: baseApples,
      modifier: modifierApples,
      duplicateCompensation: 0,
      total: totalApples,
    },
    collection:
      plannedCollection === null || existingCollection !== undefined
        ? null
        : { ...plannedCollection, duplicate: false },
    friendId,
    giftItemId: awardedGiftItemId,
    giftApples: modifierApples,
    guaranteedByPity: false,
  }
  const rested = activity.kind === 'rest'
  const generatedPreferences = rested
    ? generateActivityPreferences(state.random.seed, state.random.sequences.preferences)
    : null
  const nextPreferences = generatedPreferences
    ? generatedPreferences.preferences
    : exhaustActivityPreference(state.pet.preferences, activity.kind)
  const restCount = state.pet.restCount + (rested ? 1 : 0)
  const nextState: GameState = {
    ...state,
    profile: { ...state.profile, companionDays: state.profile.companionDays + 1 },
    economy: { apples: state.economy.apples + totalApples },
    inventory: nextInventory,
    collections: nextCollections,
    friends: nextFriends,
    activeActivity: null,
    pet: {
      ...state.pet,
      location: returnLocationForActivity(activity.kind),
      preferences: nextPreferences,
      tired: isPetTired(nextPreferences),
      restCount,
    },
    statistics: {
      ...state.statistics,
      claimed: {
        ...state.statistics.claimed,
        [activity.kind]: state.statistics.claimed[activity.kind] + 1,
      },
      applesEarned: state.statistics.applesEarned + totalApples,
      duplicateRewards: state.statistics.duplicateRewards,
    },
    random: generatedPreferences
      ? {
          ...state.random,
          sequences: {
            ...state.random.sequences,
            preferences: generatedPreferences.nextSequence,
          },
        }
      : state.random,
  }

  const effects: GameEffect[] = [{ type: 'activity-claimed', summary }]
  if (generatedPreferences !== null) {
    effects.push({
      type: 'pet-rested',
      restCount,
      preferences: generatedPreferences.preferences,
      replayKey: restCount,
    })
  }
  return succeed(nextState, effects)
}

function purchaseItem(
  state: GameState,
  action: Extract<GameAction, { type: 'item/purchase' }>,
): GameTransition {
  const quantity = action.quantity ?? 1
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return fail(state, 'INVALID_AMOUNT', '补充数量必须是正安全整数')
  }
  if (state.inventory[action.itemId] + quantity > MAX_ITEM_STACK) {
    return fail(state, 'INVENTORY_LIMIT_REACHED', '道具数量将超过冰箱容量')
  }
  const applesSpent = ITEM_PRICES[action.itemId] * quantity
  if (!Number.isSafeInteger(applesSpent) || state.economy.apples < applesSpent) {
    return fail(state, 'INSUFFICIENT_APPLES', '苹果不足，暂时不能补充这个道具')
  }

  return succeed(
    {
      ...state,
      economy: { apples: state.economy.apples - applesSpent },
      inventory: {
        ...state.inventory,
        [action.itemId]: state.inventory[action.itemId] + quantity,
      },
    },
    [{ type: 'item-purchased', itemId: action.itemId, quantity, applesSpent }],
  )
}

function movePet(
  state: GameState,
  action: Extract<GameAction, { type: 'pet/move' }>,
): GameTransition {
  if (state.activeActivity !== null) {
    return fail(state, 'PET_BUSY', '饼狗正在忙，等它完成现在的活动吧')
  }
  if (action.location === 'outside') {
    return fail(state, 'INVALID_LOCATION', '只有出门旅行时才能把饼狗移动到屋外')
  }
  return succeed({ ...state, pet: { ...state.pet, location: action.location } }, [
    { type: 'pet-moved', location: action.location },
  ])
}

function interactWithRoom(
  state: GameState,
  action: Extract<GameAction, { type: 'room/interact' }>,
  catalog: CollectionCatalog,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '房间互动时间无效')
  if (state.activeActivity !== null) {
    return fail(state, 'PET_BUSY', '饼狗正在忙，等它完成现在的活动吧')
  }

  const movedState: GameState = {
    ...state,
    pet: { ...state.pet, location: action.area },
  }
  const event =
    action.area === 'collection-wall'
      ? ({ type: 'collection-wall-opened' } as const)
      : ({ type: 'room-visited', area: action.area } as const)
  const application = applyTaskEvent(movedState, event, action.now, catalog)
  const effects: GameEffect[] = [{ type: 'pet-moved', location: action.area }]
  if (application.effect !== null) effects.push(application.effect)
  return succeed(application.state, effects)
}

function encouragePet(
  state: GameState,
  action: Extract<GameAction, { type: 'pet/encourage' }>,
): GameTransition {
  if (state.activeActivity !== null) {
    return fail(state, 'PET_BUSY', '饼狗正在忙，现在不用再鼓励它')
  }
  if (state.pet.preferences[action.interest]) {
    return fail(state, 'INVALID_AMOUNT', '饼狗已经很想做这件事啦')
  }
  if (state.economy.apples < PET_ENCOURAGEMENT_APPLE_COST) {
    return fail(state, 'INSUFFICIENT_APPLES', '苹果不够，先陪饼狗完成一些小任务吧')
  }
  return succeed(
    {
      ...state,
      economy: { apples: state.economy.apples - PET_ENCOURAGEMENT_APPLE_COST },
      pet: {
        ...state.pet,
        preferences: { ...state.pet.preferences, [action.interest]: true },
        tired: false,
      },
    },
    [
      {
        type: 'pet-encouraged',
        interest: action.interest,
        applesSpent: PET_ENCOURAGEMENT_APPLE_COST,
      },
    ],
  )
}

function progressTask(
  state: GameState,
  action: Extract<GameAction, { type: 'task/event' }>,
  catalog: CollectionCatalog,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '任务事件时间无效')
  const application = applyTaskEvent(state, action.event, action.now, catalog)
  return application.effect === null
    ? succeed(application.state)
    : succeed(application.state, [application.effect])
}

function requireDebug(state: GameState): GameTransition | null {
  return state.profile.debug ? null : fail(state, 'DEBUG_REQUIRED', '此操作只对调试档开放')
}

function adjustDebugApples(
  state: GameState,
  action: Extract<GameAction, { type: 'debug/apples-adjust' }>,
): GameTransition {
  const denied = requireDebug(state)
  if (denied !== null) return denied
  if (!Number.isSafeInteger(action.delta) || action.delta === 0) {
    return fail(state, 'INVALID_AMOUNT', '苹果增减量必须是非零安全整数')
  }
  const apples = state.economy.apples + action.delta
  if (apples < 0 || apples > MAX_APPLES) {
    return fail(state, 'INVALID_AMOUNT', '调试后的苹果数超出允许范围')
  }
  return succeed({ ...state, economy: { apples } }, [
    { type: 'debug-applied', action: action.type },
  ])
}

function adjustDebugItem(
  state: GameState,
  action: Extract<GameAction, { type: 'debug/item-adjust' }>,
): GameTransition {
  const denied = requireDebug(state)
  if (denied !== null) return denied
  if (!Number.isSafeInteger(action.delta) || action.delta === 0) {
    return fail(state, 'INVALID_AMOUNT', '道具增减量必须是非零安全整数')
  }
  const quantity = state.inventory[action.itemId] + action.delta
  if (quantity < 0 || quantity > MAX_ITEM_STACK) {
    return fail(state, 'INVALID_AMOUNT', '调试后的道具数超出允许范围')
  }
  return succeed(
    {
      ...state,
      inventory: { ...state.inventory, [action.itemId]: quantity },
    },
    [{ type: 'debug-applied', action: action.type }],
  )
}

function findCollectionCategory(
  catalog: CollectionCatalog,
  collectionId: string,
): CollectibleCategory | null {
  return CATEGORIES.find((category) => catalog[category].includes(collectionId)) ?? null
}

function setDebugCollection(
  state: GameState,
  action: Extract<GameAction, { type: 'debug/collection-set' }>,
  catalog: CollectionCatalog,
): GameTransition {
  const denied = requireDebug(state)
  if (denied !== null) return denied
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '收藏时间无效')
  const catalogValidation = validateCollectionCatalog(catalog)
  if (!catalogValidation.ok) return fail(state, 'INVALID_CATALOG', catalogValidation.message)
  if (findCollectionCategory(catalog, action.collectionId) === null) {
    return fail(state, 'UNKNOWN_COLLECTION', `收藏目录中不存在：${action.collectionId}`)
  }

  const nextCollections = { ...state.collections }
  if (action.owned) {
    nextCollections[action.collectionId] ??= {
      id: action.collectionId,
      firstObtainedAt: action.now,
      duplicateCount: 0,
    }
  } else {
    delete nextCollections[action.collectionId]
  }
  return succeed({ ...state, collections: nextCollections }, [
    { type: 'debug-applied', action: action.type },
  ])
}

function collectAllForDebug(
  state: GameState,
  action: Extract<GameAction, { type: 'debug/collect-all' }>,
  catalog: CollectionCatalog,
): GameTransition {
  const denied = requireDebug(state)
  if (denied !== null) return denied
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '收藏时间无效')
  const catalogValidation = validateCollectionCatalog(catalog)
  if (!catalogValidation.ok) return fail(state, 'INVALID_CATALOG', catalogValidation.message)

  const nextCollections = { ...state.collections }
  let changedCount = 0
  for (const category of CATEGORIES) {
    for (const id of catalog[category]) {
      if (nextCollections[id] === undefined) {
        nextCollections[id] = { id, firstObtainedAt: action.now, duplicateCount: 0 }
        changedCount += 1
      }
    }
  }
  return succeed({ ...state, collections: nextCollections }, [
    { type: 'debug-applied', action: action.type, changedCount },
  ])
}

function completeActivityForDebug(
  state: GameState,
  action: Extract<GameAction, { type: 'debug/activity-complete' }>,
): GameTransition {
  const denied = requireDebug(state)
  if (denied !== null) return denied
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '完成时间无效')
  if (state.activeActivity === null) {
    return fail(state, 'ACTIVITY_NOT_ACTIVE', '当前没有可立即完成的活动')
  }
  if (action.now < state.activeActivity.startedAt) {
    return fail(state, 'INVALID_TIME', '完成时间不能早于活动开始时间')
  }

  return succeed(
    {
      ...state,
      activeActivity: {
        ...state.activeActivity,
        endsAt: Math.min(state.activeActivity.endsAt, action.now),
      },
    },
    [{ type: 'debug-applied', action: action.type }],
  )
}

function clearActivityForDebug(state: GameState): GameTransition {
  const denied = requireDebug(state)
  if (denied !== null) return denied
  const location = state.activeActivity
    ? returnLocationForActivity(state.activeActivity.kind)
    : state.pet.location
  return succeed({ ...state, activeActivity: null, pet: { ...state.pet, location } }, [
    { type: 'debug-applied', action: 'debug/activity-clear' },
  ])
}

function setDebugDuration(
  state: GameState,
  action: Extract<GameAction, { type: 'debug/duration-set' }>,
): GameTransition {
  const denied = requireDebug(state)
  if (denied !== null) return denied
  if (!isValidActivityDuration(action.durationMs)) {
    return fail(state, 'INVALID_DURATION', '调试活动时长必须是 1ms 到 30 天之间的安全整数')
  }
  return succeed(
    {
      ...state,
      gameBalance: { ...state.gameBalance, activityDurationMs: action.durationMs },
    },
    [{ type: 'debug-applied', action: action.type }],
  )
}

function setDebugProbability(
  state: GameState,
  action: Extract<GameAction, { type: 'debug/probability-set' }>,
): GameTransition {
  const denied = requireDebug(state)
  if (denied !== null) return denied
  if (!isValidProbability(action.value)) {
    return fail(state, 'INVALID_PROBABILITY', '调试概率必须在 0 到 1 之间')
  }
  return succeed(
    {
      ...state,
      gameBalance: {
        ...state.gameBalance,
        probabilities: { ...state.gameBalance.probabilities, [action.key]: action.value },
      },
    },
    [{ type: 'debug-applied', action: action.type }],
  )
}

function resetDebugTuning(state: GameState): GameTransition {
  const denied = requireDebug(state)
  if (denied !== null) return denied
  return succeed({ ...state, gameBalance: createDefaultGameBalance() }, [
    { type: 'debug-applied', action: 'debug/tuning-reset' },
  ])
}

/** 游戏领域的唯一状态入口；失败时返回原 state 引用，保证调用方不会提交半成品。 */
export function reduceGame(
  state: GameState,
  action: GameAction,
  catalog: CollectionCatalog,
): GameTransition {
  switch (action.type) {
    case 'activity/start':
      return startActivity(state, action, catalog)
    case 'activity/cancel':
      return cancelActivity(state, action)
    case 'activity/claim':
      return claimActivity(state, action)
    case 'item/purchase':
      return purchaseItem(state, action)
    case 'room/interact':
      return interactWithRoom(state, action, catalog)
    case 'pet/move':
      return movePet(state, action)
    case 'pet/encourage':
      return encouragePet(state, action)
    case 'task/event':
      return progressTask(state, action, catalog)
    case 'debug/apples-adjust':
      return adjustDebugApples(state, action)
    case 'debug/item-adjust':
      return adjustDebugItem(state, action)
    case 'debug/collection-set':
      return setDebugCollection(state, action, catalog)
    case 'debug/collect-all':
      return collectAllForDebug(state, action, catalog)
    case 'debug/activity-complete':
      return completeActivityForDebug(state, action)
    case 'debug/activity-clear':
      return clearActivityForDebug(state)
    case 'debug/duration-set':
      return setDebugDuration(state, action)
    case 'debug/probability-set':
      return setDebugProbability(state, action)
    case 'debug/tuning-reset':
      return resetDebugTuning(state)
  }
}
