import { z } from 'zod'

import { validateCollectionCatalog } from './validateCollectionCatalog'
import {
  FRIEND_EVENT_IDS,
  LEGACY_ITEM_IDS,
  MAX_APPLES,
  MAX_COMPANION_DAYS,
  MAX_ITEM_STACK,
} from './constants'
import { createDefaultGameBalanceV3, isValidActivityDuration } from './gameBalance'
import { migrateGameStateV1, type MigrateGameStateV1Options } from './migrateGameStateV1'
import { assertValidTimestamp, MAX_DATE_TIMESTAMP_MS } from './time'
import type {
  ActivityRun,
  CollectionCatalog,
  GameStateV1,
  GameStateV2,
  GameStateV3,
  LegacyActivityCounters,
} from './types'

const timestamp = z.number().int().nonnegative().max(MAX_DATE_TIMESTAMP_MS)
const safeCounter = z.number().int().nonnegative().safe()
const probability = z.number().min(0).max(1).finite()
const activityDuration = z
  .number()
  .int()
  .positive()
  .safe()
  .refine(isValidActivityDuration, '活动时长超出允许范围')
const itemId = z.enum(LEGACY_ITEM_IDS)
const friendId = z.enum(FRIEND_EVENT_IDS)
const activityKind = z.enum(['travel', 'stream', 'trend'])
const collectibleCategory = z.enum(['postcard', 'million-shot', 'site-first'])
const petLocation = z.enum([
  'center',
  'bed',
  'computer',
  'wardrobe',
  'piano',
  'record-player',
  'fridge',
  'collection-wall',
  'door',
  'outside',
])
const taskId = z.enum([
  'greet-bingo',
  'open-backpack',
  'room-stroll',
  'piano-time',
  'record-time',
  'two-melodies',
  'wardrobe-choice',
  'open-memories',
  'revisit-two',
  'remember-postcard',
  'remember-million',
  'remember-first',
  'stage-test',
])

const inventory = z.strictObject({
  'travel-basic': z.number().int().nonnegative().max(MAX_ITEM_STACK),
  'travel-apple': z.number().int().nonnegative().max(MAX_ITEM_STACK),
  'signal-headphones': z.number().int().nonnegative().max(MAX_ITEM_STACK),
  'trend-toolbox': z.number().int().nonnegative().max(MAX_ITEM_STACK),
  'lucky-apple': z.number().int().nonnegative().max(MAX_ITEM_STACK),
})

const collectionEntry = z.strictObject({
  id: z.string().min(1),
  firstObtainedAt: timestamp,
  duplicateCount: safeCounter,
})

const rewardPlan = z.strictObject({
  baseApples: z.literal(0),
  modifierApples: z.literal(0),
  collection: z.strictObject({ id: z.string().min(1), category: collectibleCategory }).nullable(),
  friendEventId: friendId.nullable(),
  guaranteedByPity: z.literal(false),
  pityAfterClaim: z.null(),
})

const activeActivity = z
  .strictObject({
    runId: z.string().min(1),
    kind: activityKind,
    startedAt: timestamp,
    endsAt: timestamp,
    rewardSeed: z.string().min(1),
    rewardPlan,
    supplyId: itemId,
    usedLuckyApple: z.boolean(),
  })
  .superRefine((activity, context) => {
    // V2 DEBUG 曾允许在 startedAt 当刻完成，零时长有效；负时长始终非法。
    if (activity.endsAt < activity.startedAt) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: '活动结束时间不能早于开始时间',
      })
    }
  })
  .nullable()

const activityCounter = z.strictObject({
  travel: safeCounter,
  stream: safeCounter,
  trend: safeCounter,
})

const task = z.strictObject({
  instanceId: z.string().min(1),
  taskId,
  assignedAt: timestamp,
  progress: safeCounter,
  target: z.number().int().positive().safe(),
  rewardApples: safeCounter,
  seenKeys: z.array(z.string().min(1)),
})

/** schemaVersion 2 的严格导入 schema；普通档历史 balance 只检查安全范围。 */
export const gameStateV2Schema: z.ZodType<GameStateV2> = z.strictObject({
  schemaVersion: z.literal(2),
  profile: z.strictObject({ createdAt: timestamp, debug: z.boolean() }),
  economy: z.strictObject({ apples: z.number().int().nonnegative().max(MAX_APPLES) }),
  inventory,
  collections: z.record(z.string().min(1), collectionEntry),
  activeActivity,
  pet: z.strictObject({
    location: petLocation,
    preferences: z.strictObject({
      travel: z.boolean(),
      stream: z.boolean(),
      trend: z.boolean(),
    }),
    tired: z.boolean(),
    restCount: safeCounter,
  }),
  tasks: z.strictObject({
    active: z.tuple([task, task, task]),
    completedCount: safeCounter,
    recentTemplateIds: z.array(taskId),
    oneOffCompleted: z.array(taskId),
  }),
  gameBalance: z.strictObject({
    activityDurationMs: activityDuration,
    probabilities: z.strictObject({
      postcard: probability,
      millionShot: probability,
      siteFirst: probability,
      friend: probability,
    }),
  }),
  statistics: z.strictObject({
    started: activityCounter,
    claimed: activityCounter,
    applesEarned: safeCounter,
    duplicateRewards: safeCounter,
  }),
  random: z.strictObject({
    seed: z.string().min(1),
    sequences: z.strictObject({
      reward: safeCounter,
      tasks: safeCounter,
      preferences: safeCounter,
    }),
  }),
})

export function isStrictGameStateV2(value: unknown): value is GameStateV2 {
  return gameStateV2Schema.safeParse(value).success
}

export interface MigrateGameStateV2Options {
  now: number
  catalog: CollectionCatalog
}

function sumLegacyClaims(claimed: LegacyActivityCounters): number {
  return ([claimed.travel, claimed.stream, claimed.trend] as const).reduce(
    (total, count) => Math.min(MAX_COMPANION_DAYS, total + Math.min(count, MAX_COMPANION_DAYS)),
    0,
  )
}

function migrateActiveActivity(state: GameStateV2): ActivityRun | null {
  const activity = state.activeActivity
  if (activity === null) return null
  return {
    runId: activity.runId,
    kind: activity.kind,
    startedAt: activity.startedAt,
    endsAt: activity.endsAt,
    rewardSeed: activity.rewardSeed,
    rewardPlan: {
      baseApples: activity.rewardPlan.baseApples,
      modifierApples: activity.rewardPlan.modifierApples,
      collection: structuredClone(activity.rewardPlan.collection),
      friendId: activity.rewardPlan.friendEventId,
      // 旧活动只兑现当时已经计划的结果，不按 V3 规则追加新礼物。
      giftItemId: null,
      guaranteedByPity: activity.rewardPlan.guaranteedByPity,
      pityAfterClaim: activity.rewardPlan.pityAfterClaim,
    },
    supplyId: activity.supplyId,
    usedLuckyApple: activity.usedLuckyApple,
  }
}

/** V2 -> V3：保留进行中活动的绝对时间和旧计划结果，只扩充新版字段。 */
export function migrateGameStateV2ToV3(
  state: GameStateV2,
  options: MigrateGameStateV2Options,
): GameStateV3 {
  assertValidTimestamp(options.now, '迁移时间必须是 Date 可表示的非负整数毫秒时间戳')
  const catalogValidation = validateCollectionCatalog(options.catalog)
  if (!catalogValidation.ok) throw new TypeError(catalogValidation.message)

  const gameBalance = createDefaultGameBalanceV3()
  if (state.profile.debug) {
    gameBalance.activityDurationMs = state.gameBalance.activityDurationMs
    gameBalance.probabilities = {
      postcard: state.gameBalance.probabilities.postcard,
      millionShot: state.gameBalance.probabilities.millionShot,
      siteFirst: state.gameBalance.probabilities.siteFirst,
      travelFriend: state.gameBalance.probabilities.friend,
      musicFriend: gameBalance.probabilities.musicFriend,
    }
  }

  return {
    schemaVersion: 3,
    profile: {
      createdAt: state.profile.createdAt,
      debug: state.profile.debug,
      displayName: '你',
      companionDays: sumLegacyClaims(state.statistics.claimed),
    },
    economy: structuredClone(state.economy),
    inventory: structuredClone(state.inventory),
    collections: structuredClone(state.collections),
    friends: {},
    activeActivity: migrateActiveActivity(state),
    pet: {
      location: state.pet.location,
      preferences: {
        travel: state.pet.preferences.travel,
        computer: state.pet.preferences.stream || state.pet.preferences.trend,
        // V2 没有音乐意愿；已疲劳的旧档必须先睡觉，不能借新增活动绕过疲劳。
        music: !state.pet.tired,
      },
      tired: state.pet.tired,
      restCount: state.pet.restCount,
    },
    tasks: structuredClone(state.tasks),
    gameBalance,
    statistics: {
      started: { ...state.statistics.started, music: 0, rest: 0 },
      claimed: { ...state.statistics.claimed, music: 0, rest: 0 },
      applesEarned: state.statistics.applesEarned,
      duplicateRewards: state.statistics.duplicateRewards,
    },
    random: structuredClone(state.random),
  }
}

export type StoredGameStateThroughV3 = GameStateV1 | GameStateV2 | GameStateV3

export function migrateStoredGameStateToV3(
  state: StoredGameStateThroughV3,
  options: MigrateGameStateV1Options,
): GameStateV3 {
  if (state.schemaVersion === 3) return state
  const v2 = state.schemaVersion === 1 ? migrateGameStateV1(state, options) : state
  return migrateGameStateV2ToV3(v2, options)
}

export function migrateGameStateV1ToV3(
  state: GameStateV1,
  options: MigrateGameStateV1Options,
): GameStateV3 {
  return migrateGameStateV2ToV3(migrateGameStateV1(state, options), options)
}
