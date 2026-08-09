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
  ALL_ACTIVITY_PREFERENCES,
  getVitalityMagicAvailability,
  isVitalityActive,
  resolveVitalityForCompanionDayAdvance,
  vitalityExpiryDay,
} from '../player/vitality'
import {
  FRIEND_EVENT_IDS,
  ITEM_PRICES,
  LEGACY_V1_DUPLICATE_APPLE_COMPENSATION,
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
import { incrementSafeCounter, saturatingAddSafeCounter } from './counters'
import { validateCollectionCatalog } from './validateCollectionCatalog'
import { isMusicPlayerAction, reduceMusicPlayer } from './musicPlayer'
import { isProductivityAction, reduceProductivity } from './productivity'
import { isValidTimestamp } from './time'
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
  LegacyItemId,
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

function categoryForActivity(kind: ActivityKind): CollectibleCategory | null {
  if (kind === 'travel') return 'postcard'
  if (kind === 'stream') return 'million-shot'
  if (kind === 'trend') return 'site-first'
  return null
}

type SupplyResolution = { ok: true; supplyId: LegacyItemId | null } | { ok: false }

function resolveSupply(
  state: GameState,
  kind: ActivityKind,
  requestedSupply: LegacyItemId | undefined,
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
  if (
    interest !== null &&
    !isVitalityActive(state) &&
    (state.pet.tired || !state.pet.preferences[interest])
  ) {
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
  const advancesRewardSequence = action.kind !== 'rest'
  if (advancesRewardSequence && state.random.sequences.reward >= Number.MAX_SAFE_INTEGER) {
    return fail(state, 'INVALID_AMOUNT', '奖励随机序列已达到存档上限')
  }
  const endsAt = action.now + duration
  if (!isValidTimestamp(endsAt)) {
    return fail(state, 'INVALID_DURATION', '活动结束时间超出 Date 可表示范围')
  }

  const sequence = state.random.sequences.reward
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
        reward: advancesRewardSequence ? incrementSafeCounter(sequence) : sequence,
      },
    },
    statistics: {
      ...state.statistics,
      started: {
        ...state.statistics.started,
        [action.kind]: incrementSafeCounter(state.statistics.started[action.kind]),
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

function applySpeedMagic(
  state: GameState,
  action: Extract<GameAction, { type: 'magic/speed-use' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '使用魔法的时间无效')
  const activity = state.activeActivity
  if (activity === null) return fail(state, 'ACTIVITY_NOT_ACTIVE', '当前没有正在进行的活动')
  if (activity.runId !== action.runId) {
    return fail(state, 'RUN_ID_MISMATCH', '加速请求与当前活动不一致')
  }
  if (action.now < activity.startedAt) {
    return fail(state, 'INVALID_TIME', '使用魔法的时间不能早于活动开始时间')
  }
  if (deriveActivityTiming(activity, action.now).phase !== 'running') {
    return fail(state, 'MAGIC_NOT_NEEDED', '这次活动已经可以领取，不需要再加速')
  }
  if (state.inventory['bottled-speed-magic'] < 1) {
    return fail(state, 'MISSING_REQUIRED_ITEM', '冰箱里还没有瓶装速度魔法')
  }

  return succeed(
    {
      ...state,
      inventory: {
        ...state.inventory,
        'bottled-speed-magic': state.inventory['bottled-speed-magic'] - 1,
      },
      activeActivity: { ...activity, endsAt: action.now },
    },
    [
      {
        type: 'activity-accelerated',
        runId: activity.runId,
        usedAt: action.now,
        previousEndsAt: activity.endsAt,
        endsAt: action.now,
      },
    ],
  )
}

function applyVitalityMagic(
  state: GameState,
  action: Extract<GameAction, { type: 'magic/vitality-use' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '使用魔法的时间无效')
  const availability = getVitalityMagicAvailability(state)
  if (!availability.canUse) {
    if (availability.reason === 'missing-item') {
      return fail(state, 'MISSING_REQUIRED_ITEM', availability.message)
    }
    if (availability.reason === 'day-limit') {
      return fail(state, 'COMPANION_DAY_LIMIT_REACHED', availability.message)
    }
    if (availability.reason === 'already-active') {
      return fail(state, 'EFFECT_ALREADY_ACTIVE', availability.message)
    }
    return fail(state, 'MAGIC_NOT_NEEDED', availability.message)
  }

  const vitality = {
    activatedAt: action.now,
    activatedOnCompanionDay: state.profile.companionDays,
    expiresAfterCompanionDay: vitalityExpiryDay(state.profile.companionDays),
  }
  return succeed(
    {
      ...state,
      inventory: {
        ...state.inventory,
        'bottled-vitality-magic': state.inventory['bottled-vitality-magic'] - 1,
      },
      player: { effects: { ...state.player.effects, vitality } },
      pet: {
        ...state.pet,
        preferences: { ...ALL_ACTIVITY_PREFERENCES },
        tired: false,
      },
    },
    [{ type: 'player-effect-activated', effect: 'vitality', value: vitality }],
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
  const isLegacyV1Duplicate =
    activity.legacySource === 'v1' && plannedCollection !== null && existingCollection !== undefined
  const legacyDuplicateCompensation = isLegacyV1Duplicate
    ? LEGACY_V1_DUPLICATE_APPLE_COMPENSATION[plannedCollection.category]
    : 0
  const availableAppleCapacity = MAX_APPLES - state.economy.apples
  if (
    activity.legacySource === 'v1' &&
    (activity.rewardPlan.baseApples > availableAppleCapacity ||
      activity.rewardPlan.modifierApples >
        availableAppleCapacity - activity.rewardPlan.baseApples ||
      legacyDuplicateCompensation >
        availableAppleCapacity -
          activity.rewardPlan.baseApples -
          activity.rewardPlan.modifierApples)
  ) {
    // V1 的领取语义是“空间不足则等待”，不能截断已经冻结的奖励快照。
    return fail(state, 'APPLE_LIMIT_REACHED', '🍎已接近上限，请先消费后再领取')
  }
  const nextCollections = { ...state.collections }
  if (plannedCollection !== null) {
    if (existingCollection === undefined) {
      nextCollections[plannedCollection.id] = {
        id: plannedCollection.id,
        firstObtainedAt: action.now,
        duplicateCount: 0,
      }
    } else if (isLegacyV1Duplicate) {
      nextCollections[plannedCollection.id] = {
        ...existingCollection,
        duplicateCount: incrementSafeCounter(existingCollection.duplicateCount),
      }
    }
  }

  const baseApples = Math.min(activity.rewardPlan.baseApples, availableAppleCapacity)
  const modifierApples = Math.min(
    activity.rewardPlan.modifierApples,
    availableAppleCapacity - baseApples,
  )
  const duplicateCompensation = isLegacyV1Duplicate
    ? Math.min(legacyDuplicateCompensation, availableAppleCapacity - baseApples - modifierApples)
    : 0
  const totalApples = baseApples + modifierApples + duplicateCompensation

  const nextInventory = { ...state.inventory }
  const plannedGiftItemId = activity.rewardPlan.giftItemId
  const awardedGiftItemId =
    plannedGiftItemId !== null && nextInventory[plannedGiftItemId] < MAX_ITEM_STACK
      ? plannedGiftItemId
      : null
  if (awardedGiftItemId !== null) nextInventory[awardedGiftItemId] += 1

  const nextFriends: FriendCollection = { ...state.friends }
  const friendId = activity.rewardPlan.friendId
  // V1 的 modifier 是活动苹果，并不是朋友图鉴引入后的好友赠礼。
  const giftApples = activity.legacySource === 'v1' ? 0 : modifierApples
  if (friendId !== null) {
    const previous = state.friends[friendId]
    nextFriends[friendId] = previous
      ? {
          ...previous,
          lastMetAt: action.now,
          encounterCount: incrementSafeCounter(previous.encounterCount),
          totalGiftApples: Math.min(MAX_APPLES, previous.totalGiftApples + giftApples),
        }
      : {
          id: friendId,
          firstMetAt: action.now,
          lastMetAt: action.now,
          encounterCount: 1,
          totalGiftApples: giftApples,
        }
  }

  const summary: ClaimSummary = {
    runId: activity.runId,
    kind: activity.kind,
    apples: {
      base: baseApples,
      modifier: modifierApples,
      duplicateCompensation,
      total: totalApples,
    },
    collection:
      plannedCollection === null || (existingCollection !== undefined && !isLegacyV1Duplicate)
        ? null
        : { ...plannedCollection, duplicate: existingCollection !== undefined },
    friendId,
    giftItemId: awardedGiftItemId,
    giftApples,
    guaranteedByPity: activity.rewardPlan.guaranteedByPity,
  }
  const rested = activity.kind === 'rest'
  const dayAdvance = resolveVitalityForCompanionDayAdvance(state)
  if (!dayAdvance.ok) {
    return fail(state, 'COMPANION_DAY_LIMIT_REACHED', '陪伴天数已达到存档上限')
  }
  const generatedRestPreferences =
    rested && !dayAdvance.vitalityWasActive
      ? generateActivityPreferences(state.random.seed, state.random.sequences.preferences)
      : null
  const nextPreferences =
    dayAdvance.preferences ??
    generatedRestPreferences?.preferences ??
    exhaustActivityPreference(state.pet.preferences, activity.kind)
  const restCount = rested ? incrementSafeCounter(state.pet.restCount) : state.pet.restCount
  const nextState: GameState = {
    ...state,
    profile: { ...state.profile, companionDays: dayAdvance.nextCompanionDay },
    economy: { apples: state.economy.apples + totalApples },
    inventory: nextInventory,
    collections: nextCollections,
    friends: nextFriends,
    activeActivity: null,
    player:
      dayAdvance.nextVitality === state.player.effects.vitality
        ? state.player
        : { effects: { ...state.player.effects, vitality: dayAdvance.nextVitality } },
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
        [activity.kind]: incrementSafeCounter(state.statistics.claimed[activity.kind]),
      },
      applesEarned: saturatingAddSafeCounter(state.statistics.applesEarned, totalApples),
      duplicateRewards: isLegacyV1Duplicate
        ? incrementSafeCounter(state.statistics.duplicateRewards)
        : state.statistics.duplicateRewards,
    },
    random:
      dayAdvance.nextPreferenceSequence !== state.random.sequences.preferences ||
      generatedRestPreferences !== null
        ? {
            ...state.random,
            sequences: {
              ...state.random.sequences,
              preferences:
                generatedRestPreferences?.nextSequence ?? dayAdvance.nextPreferenceSequence,
            },
          }
        : state.random,
  }

  const effects: GameEffect[] = [{ type: 'activity-claimed', summary }]
  if (rested) {
    effects.push({
      type: 'pet-rested',
      restCount,
      preferences: nextPreferences,
      replayKey: restCount,
    })
  }
  if (dayAdvance.vitalityExpired) {
    effects.push({
      type: 'player-effect-expired',
      effect: 'vitality',
      expiredAtCompanionDay: dayAdvance.nextCompanionDay,
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
    return fail(state, 'INSUFFICIENT_APPLES', '🍎不够，暂时不能补充这个道具')
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
    return fail(state, 'INSUFFICIENT_APPLES', '🍎不够，先陪饼狗完成一些小任务吧')
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
    return fail(state, 'INVALID_AMOUNT', '🍎增减量必须是非零安全整数')
  }
  const apples = state.economy.apples + action.delta
  if (apples < 0 || apples > MAX_APPLES) {
    return fail(state, 'INVALID_AMOUNT', '调试后的🍎数量超出允许范围')
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
  const removedSelectedPostcard =
    !action.owned && state.reality.pomodoro.selectedPostcardId === action.collectionId
  const removedSessionPostcard =
    !action.owned && state.reality.pomodoro.session?.postcardId === action.collectionId
  return succeed(
    {
      ...state,
      collections: nextCollections,
      reality:
        removedSelectedPostcard || removedSessionPostcard
          ? {
              ...state.reality,
              pomodoro: {
                ...state.reality.pomodoro,
                selectedPostcardId: removedSelectedPostcard
                  ? null
                  : state.reality.pomodoro.selectedPostcardId,
                session: removedSessionPostcard
                  ? { ...state.reality.pomodoro.session!, postcardId: null }
                  : state.reality.pomodoro.session,
              },
            }
          : state.reality,
    },
    [{ type: 'debug-applied', action: action.type }],
  )
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
  let collectionChangedCount = 0
  for (const category of CATEGORIES) {
    for (const id of catalog[category]) {
      if (nextCollections[id] === undefined) {
        nextCollections[id] = { id, firstObtainedAt: action.now, duplicateCount: 0 }
        collectionChangedCount += 1
      }
    }
  }
  const nextFriends: FriendCollection = { ...state.friends }
  let friendChangedCount = 0
  for (const friendId of FRIEND_EVENT_IDS) {
    if (nextFriends[friendId] !== undefined) continue
    nextFriends[friendId] = {
      id: friendId,
      firstMetAt: action.now,
      lastMetAt: action.now,
      encounterCount: 1,
      totalGiftApples: 0,
    }
    friendChangedCount += 1
  }
  return succeed({ ...state, collections: nextCollections, friends: nextFriends }, [
    {
      type: 'debug-applied',
      action: action.type,
      changedCount: collectionChangedCount + friendChangedCount,
      collectionChangedCount,
      friendChangedCount,
    },
  ])
}

function clearAllForDebug(
  state: GameState,
  action: Extract<GameAction, { type: 'debug/clear-all' }>,
): GameTransition {
  const denied = requireDebug(state)
  if (denied !== null) return denied
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '清空时间无效')
  if (state.activeActivity !== null) {
    return fail(state, 'PET_BUSY', '请先完成或取消当前活动，再撤销所有收集')
  }
  const collectionChangedCount = Object.keys(state.collections).length
  const friendChangedCount = Object.keys(state.friends).length
  const session = state.reality.pomodoro.session
  return succeed(
    {
      ...state,
      collections: {},
      friends: {},
      reality: {
        ...state.reality,
        pomodoro: {
          ...state.reality.pomodoro,
          selectedPostcardId: null,
          session: session === null ? null : { ...session, postcardId: null },
        },
      },
    },
    [
      {
        type: 'debug-applied',
        action: action.type,
        changedCount: collectionChangedCount + friendChangedCount,
        collectionChangedCount,
        friendChangedCount,
      },
    ],
  )
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
  if (isMusicPlayerAction(action)) return reduceMusicPlayer(state, action)
  if (isProductivityAction(action)) return reduceProductivity(state, action, catalog)
  switch (action.type) {
    case 'activity/start':
      return startActivity(state, action, catalog)
    case 'activity/cancel':
      return cancelActivity(state, action)
    case 'activity/claim':
      return claimActivity(state, action)
    case 'magic/speed-use':
      return applySpeedMagic(state, action)
    case 'magic/vitality-use':
      return applyVitalityMagic(state, action)
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
    case 'debug/clear-all':
      return clearAllForDebug(state, action)
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
    default:
      return fail(state, 'INVALID_AMOUNT', '暂不支持的领域动作')
  }
}
