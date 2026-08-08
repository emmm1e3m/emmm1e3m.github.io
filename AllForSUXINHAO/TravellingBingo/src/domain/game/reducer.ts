import { deriveActivityTiming } from '../activities/timing'
import { hashSeed } from '../rewards/prng'
import { planActivityReward } from '../rewards/planReward'
import {
  BASE_ACTIVITY_DURATION_MS,
  DUPLICATE_APPLE_COMPENSATION,
  ITEM_PRICES,
  MAX_APPLES,
  MAX_DEBUG_ACTIVITY_DURATION_MS,
  MAX_ITEM_STACK,
} from './constants'
import type {
  ActivityKind,
  ActivityRun,
  ClaimSummary,
  CollectionCatalog,
  CollectibleCategory,
  GameAction,
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

function validateCatalog(catalog: CollectionCatalog): GameError | null {
  const seen = new Set<string>()
  for (const category of CATEGORIES) {
    for (const id of catalog[category]) {
      if (id.trim().length === 0 || seen.has(id)) {
        return {
          code: 'INVALID_CATALOG',
          message: `收藏目录包含空 ID 或重复 ID：${id || '（空）'}`,
        }
      }
      seen.add(id)
    }
  }
  return null
}

function categoryForActivity(kind: ActivityKind): CollectibleCategory {
  if (kind === 'travel') return 'postcard'
  if (kind === 'stream') return 'million-shot'
  return 'site-first'
}

function resolveSupply(
  state: GameState,
  kind: ActivityKind,
  requestedSupply: ItemId | undefined,
): ItemId | null {
  if (kind === 'stream') {
    return requestedSupply === undefined || requestedSupply === 'signal-headphones'
      ? 'signal-headphones'
      : null
  }
  if (kind === 'trend') {
    return requestedSupply === undefined || requestedSupply === 'trend-toolbox'
      ? 'trend-toolbox'
      : null
  }

  if (requestedSupply !== undefined) {
    return requestedSupply === 'travel-basic' || requestedSupply === 'travel-apple'
      ? requestedSupply
      : null
  }
  if (state.inventory['travel-basic'] > 0) return 'travel-basic'
  return 'travel-apple'
}

function resolveDuration(
  state: GameState,
  debugDurationMs: number | undefined,
): number | GameError {
  if (debugDurationMs === undefined) return BASE_ACTIVITY_DURATION_MS
  if (!state.profile.debug) {
    return { code: 'DEBUG_REQUIRED', message: '只有调试档可以覆盖任务时长' }
  }
  if (
    !Number.isSafeInteger(debugDurationMs) ||
    debugDurationMs <= 0 ||
    debugDurationMs > MAX_DEBUG_ACTIVITY_DURATION_MS
  ) {
    return {
      code: 'INVALID_DURATION',
      message: '调试任务时长必须是 1ms 到 30 天之间的安全整数',
    }
  }
  return debugDurationMs
}

function startActivity(
  state: GameState,
  action: Extract<GameAction, { type: 'activity/start' }>,
  catalog: CollectionCatalog,
): GameTransition {
  if (state.activeActivity !== null) {
    return fail(state, 'ACTIVITY_ALREADY_ACTIVE', '同一时间只能进行一个长任务')
  }
  if (!isValidTimestamp(action.now)) {
    return fail(state, 'INVALID_TIME', '任务开始时间无效')
  }

  const catalogError = validateCatalog(catalog)
  if (catalogError !== null) return fail(state, catalogError.code, catalogError.message)
  const targetCategory = categoryForActivity(action.kind)
  if (catalog[targetCategory].length === 0) {
    return fail(state, 'EMPTY_COLLECTION_POOL', `${targetCategory} 收藏池为空，无法开始任务`)
  }

  const supplyId = resolveSupply(state, action.kind, action.supplyId)
  if (supplyId === null) {
    return fail(state, 'INVALID_SUPPLY', '所选补给不能用于这个任务')
  }
  if (state.inventory[supplyId] < 1) {
    return fail(state, 'MISSING_REQUIRED_ITEM', `缺少任务补给：${supplyId}`)
  }
  if (action.useLuckyApple === true && state.inventory['lucky-apple'] < 1) {
    return fail(state, 'MISSING_REQUIRED_ITEM', '缺少幸运苹果')
  }

  const duration = resolveDuration(state, action.debugDurationMs)
  if (typeof duration !== 'number') return fail(state, duration.code, duration.message)
  const endsAt = action.now + duration
  if (!Number.isSafeInteger(endsAt)) {
    return fail(state, 'INVALID_DURATION', '任务结束时间超出安全整数范围')
  }

  const sequence = state.random.sequence
  const rewardSeed = `${state.random.seed}:${sequence}`
  const rewardPlan = planActivityReward({
    kind: action.kind,
    rewardSeed,
    pity: state.pity,
    catalog,
    ownedCollectionIds: new Set(Object.keys(state.collections)),
    supplyId,
    usedLuckyApple: action.useLuckyApple === true,
  })
  const runId = `run-${sequence.toString(36)}-${hashSeed(rewardSeed).toString(36)}`
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
  const nextInventory = {
    ...state.inventory,
    [supplyId]: state.inventory[supplyId] - 1,
  }
  if (action.useLuckyApple === true) {
    nextInventory['lucky-apple'] -= 1
  }
  const nextState: GameState = {
    ...state,
    inventory: nextInventory,
    activeActivity: activity,
    random: { ...state.random, sequence: sequence + 1 },
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

function claimActivity(
  state: GameState,
  action: Extract<GameAction, { type: 'activity/claim' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) {
    return fail(state, 'INVALID_TIME', '领奖时间无效')
  }
  const activity = state.activeActivity
  if (activity === null) {
    return fail(state, 'ACTIVITY_NOT_ACTIVE', '当前没有可领取的任务')
  }
  if (activity.runId !== action.runId) {
    return fail(state, 'RUN_ID_MISMATCH', '领奖请求与当前任务不一致')
  }
  if (deriveActivityTiming(activity, action.now).phase !== 'ready') {
    return fail(state, 'ACTIVITY_NOT_READY', '任务尚未完成')
  }

  const plannedCollection = activity.rewardPlan.collection
  const existingCollection = plannedCollection ? state.collections[plannedCollection.id] : undefined
  const isDuplicate = existingCollection !== undefined
  const duplicateCompensation =
    plannedCollection !== null && isDuplicate
      ? DUPLICATE_APPLE_COMPENSATION[plannedCollection.category]
      : 0
  const totalApples =
    activity.rewardPlan.baseApples + activity.rewardPlan.modifierApples + duplicateCompensation
  if (state.economy.apples + totalApples > MAX_APPLES) {
    return fail(state, 'APPLE_LIMIT_REACHED', '苹果已接近上限，请先消费后再领奖')
  }

  const nextCollections = { ...state.collections }
  if (plannedCollection !== null) {
    nextCollections[plannedCollection.id] = existingCollection
      ? { ...existingCollection, duplicateCount: existingCollection.duplicateCount + 1 }
      : {
          id: plannedCollection.id,
          firstObtainedAt: action.now,
          duplicateCount: 0,
        }
  }

  const nextPity = { ...state.pity }
  if (activity.kind === 'stream' || activity.kind === 'trend') {
    nextPity[activity.kind] = activity.rewardPlan.pityAfterClaim ?? 0
  }

  const summary: ClaimSummary = {
    runId: activity.runId,
    kind: activity.kind,
    apples: {
      base: activity.rewardPlan.baseApples,
      modifier: activity.rewardPlan.modifierApples,
      duplicateCompensation,
      total: totalApples,
    },
    collection:
      plannedCollection === null ? null : { ...plannedCollection, duplicate: isDuplicate },
    friendEventId: activity.rewardPlan.friendEventId,
    guaranteedByPity: activity.rewardPlan.guaranteedByPity,
  }
  const nextState: GameState = {
    ...state,
    economy: { apples: state.economy.apples + totalApples },
    collections: nextCollections,
    activeActivity: null,
    pity: nextPity,
    statistics: {
      started: state.statistics.started,
      claimed: {
        ...state.statistics.claimed,
        [activity.kind]: state.statistics.claimed[activity.kind] + 1,
      },
      applesEarned: state.statistics.applesEarned + totalApples,
      duplicateRewards: state.statistics.duplicateRewards + (isDuplicate ? 1 : 0),
    },
  }

  return succeed(nextState, [{ type: 'activity-claimed', summary }])
}

function purchaseItem(
  state: GameState,
  action: Extract<GameAction, { type: 'item/purchase' }>,
): GameTransition {
  const quantity = action.quantity ?? 1
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return fail(state, 'INVALID_AMOUNT', '购买数量必须是正安全整数')
  }
  if (state.inventory[action.itemId] + quantity > MAX_ITEM_STACK) {
    return fail(state, 'INVENTORY_LIMIT_REACHED', '道具数量将超过库存上限')
  }
  const applesSpent = ITEM_PRICES[action.itemId] * quantity
  if (!Number.isSafeInteger(applesSpent) || state.economy.apples < applesSpent) {
    return fail(state, 'INSUFFICIENT_APPLES', '苹果不足，无法购买道具')
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
  const catalogError = validateCatalog(catalog)
  if (catalogError !== null) return fail(state, catalogError.code, catalogError.message)
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
  const catalogError = validateCatalog(catalog)
  if (catalogError !== null) return fail(state, catalogError.code, catalogError.message)

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
    return fail(state, 'ACTIVITY_NOT_ACTIVE', '当前没有可立即完成的任务')
  }
  if (action.now < state.activeActivity.startedAt) {
    return fail(state, 'INVALID_TIME', '完成时间不能早于任务开始时间')
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
  return succeed({ ...state, activeActivity: null }, [
    { type: 'debug-applied', action: 'debug/activity-clear' },
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
    case 'activity/claim':
      return claimActivity(state, action)
    case 'item/purchase':
      return purchaseItem(state, action)
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
  }
}
