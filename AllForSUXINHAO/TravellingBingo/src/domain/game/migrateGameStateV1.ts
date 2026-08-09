import { z } from 'zod'

import { generateActivityPreferences } from '../pet/preferences'
import { generateTaskBoard } from '../tasks/taskBoard'
import { FRIEND_EVENT_IDS, LEGACY_ITEM_IDS, MAX_ITEM_STACK } from './constants'
import { createDefaultGameBalanceV2 } from './gameBalance'
import { assertValidTimestamp, MAX_DATE_TIMESTAMP_MS } from './time'
import type { ActivityRunV2, CollectionCatalog, GameStateV1, GameStateV2 } from './types'

const timestamp = z.number().int().nonnegative().max(MAX_DATE_TIMESTAMP_MS)
const itemId = z.enum(LEGACY_ITEM_IDS)
const activityKind = z.enum(['travel', 'stream', 'trend'])
const collectibleCategory = z.enum(['postcard', 'million-shot', 'site-first'])
const friendEventId = z.enum(FRIEND_EVENT_IDS)

const rewardPlanV1Schema = z.strictObject({
  baseApples: z.number().int().nonnegative().safe(),
  modifierApples: z.number().int().nonnegative().safe(),
  collection: z.strictObject({ id: z.string().min(1), category: collectibleCategory }).nullable(),
  friendEventId: friendEventId.nullable(),
  guaranteedByPity: z.boolean(),
  pityAfterClaim: z.number().int().nonnegative().safe().nullable(),
})

const counterV1Schema = z.strictObject({
  travel: z.number().int().nonnegative().safe(),
  stream: z.number().int().nonnegative().safe(),
  trend: z.number().int().nonnegative().safe(),
})

/**
 * Demo 0.1 的严格业务载荷 schema。未知字段会被拒绝；不要把它放宽成 passthrough，
 * 否则迁移时无法判断旧 UI 临时状态是否被误写进存档。
 */
export const gameStateV1Schema: z.ZodType<GameStateV1> = z.strictObject({
  schemaVersion: z.literal(1),
  profile: z.strictObject({ createdAt: timestamp, debug: z.boolean() }),
  economy: z.strictObject({ apples: z.number().int().nonnegative().max(9_999_999) }),
  inventory: z.strictObject({
    'travel-basic': z.number().int().nonnegative().max(MAX_ITEM_STACK),
    'travel-apple': z.number().int().nonnegative().max(MAX_ITEM_STACK),
    'signal-headphones': z.number().int().nonnegative().max(MAX_ITEM_STACK),
    'trend-toolbox': z.number().int().nonnegative().max(MAX_ITEM_STACK),
    'lucky-apple': z.number().int().nonnegative().max(MAX_ITEM_STACK),
  }),
  collections: z.record(
    z.string().min(1),
    z.strictObject({
      id: z.string().min(1),
      firstObtainedAt: timestamp,
      duplicateCount: z.number().int().nonnegative().safe(),
    }),
  ),
  activeActivity: z
    .strictObject({
      runId: z.string().min(1),
      kind: activityKind,
      startedAt: timestamp,
      endsAt: timestamp,
      rewardSeed: z.string().min(1),
      rewardPlan: rewardPlanV1Schema,
      supplyId: itemId,
      usedLuckyApple: z.boolean(),
    })
    .superRefine((activity, context) => {
      // 旧 DEBUG 可在开始瞬间完成活动，因此允许相等，只拒绝时间倒置。
      if (activity.endsAt < activity.startedAt) {
        context.addIssue({
          code: 'custom',
          path: ['endsAt'],
          message: '活动结束时间不能早于开始时间',
        })
      }
    })
    .nullable(),
  pity: z.strictObject({
    stream: z.number().int().nonnegative().safe(),
    trend: z.number().int().nonnegative().safe(),
  }),
  statistics: z.strictObject({
    started: counterV1Schema,
    claimed: counterV1Schema,
    applesEarned: z.number().int().nonnegative().safe(),
    duplicateRewards: z.number().int().nonnegative().safe(),
  }),
  random: z.strictObject({
    seed: z.string().min(1),
    sequence: z.number().int().nonnegative().safe(),
  }),
})

export function isStrictGameStateV1(value: unknown): value is GameStateV1 {
  return gameStateV1Schema.safeParse(value).success
}

export interface MigrateGameStateV1Options {
  now: number
  catalog: CollectionCatalog
}

/**
 * v1 活动开始时已经扣过补给并冻结了完整奖励计划。迁移不再运行旧保底计数逻辑，
 * 但苹果、收藏、朋友、保底展示信息与绝对时间全部原样保留且绝不重抽；已经消耗的
 * 补给也不会返还，否则同一次活动会同时得到退款和原计划奖励。
 */
export function migrateGameStateV1(
  state: GameStateV1,
  options: MigrateGameStateV1Options,
): GameStateV2 {
  assertValidTimestamp(options.now, '迁移时间必须是 Date 可表示的非负整数毫秒时间戳')

  const preferences = generateActivityPreferences(state.random.seed, 0)
  const tasks = generateTaskBoard({
    seed: state.random.seed,
    sequence: 0,
    now: options.now,
    catalog: options.catalog,
    collections: state.collections,
  })
  const activeActivity: ActivityRunV2 | null =
    state.activeActivity === null
      ? null
      : {
          ...structuredClone(state.activeActivity),
          rewardPlan: {
            ...structuredClone(state.activeActivity.rewardPlan),
            baseApples: state.activeActivity.rewardPlan.baseApples,
            modifierApples: state.activeActivity.rewardPlan.modifierApples,
            collection: structuredClone(state.activeActivity.rewardPlan.collection),
            guaranteedByPity: state.activeActivity.rewardPlan.guaranteedByPity,
            pityAfterClaim: state.activeActivity.rewardPlan.pityAfterClaim,
          },
        }

  return {
    schemaVersion: 2,
    profile: structuredClone(state.profile),
    economy: structuredClone(state.economy),
    inventory: structuredClone(state.inventory),
    collections: structuredClone(state.collections),
    activeActivity,
    pet: {
      location:
        activeActivity?.kind === 'travel'
          ? 'outside'
          : activeActivity === null
            ? 'center'
            : 'computer',
      preferences: {
        travel: preferences.preferences.travel,
        stream: preferences.preferences.computer,
        trend: preferences.preferences.computer,
      },
      tired: false,
      restCount: 0,
    },
    tasks: tasks.board,
    gameBalance: createDefaultGameBalanceV2(),
    statistics: structuredClone(state.statistics),
    random: {
      seed: state.random.seed,
      sequences: {
        reward: state.random.sequence,
        tasks: tasks.nextSequence,
        preferences: preferences.nextSequence,
      },
    },
  }
}

export const migrateGameStateV1ToV2 = migrateGameStateV1
