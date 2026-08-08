import { z } from 'zod'

import {
  DEFAULT_GAME_BALANCE,
  gameStateV1Schema as legacyGameStateV1Schema,
  isValidActivityDuration,
  type GameState,
  type GameStateV1,
} from '@/domain'

const timestamp = z.number().int().nonnegative().safe()
const safeCounter = z.number().int().nonnegative().safe()
const itemCount = z.number().int().nonnegative().max(9_999)
const apples = z.number().int().nonnegative().max(9_999_999)
const activityDuration = z
  .number()
  .int()
  .positive()
  .safe()
  .refine(isValidActivityDuration, '活动时长超出允许范围')
const probability = z.number().min(0).max(1).finite()

const itemId = z.enum([
  'travel-basic',
  'travel-apple',
  'signal-headphones',
  'trend-toolbox',
  'lucky-apple',
])
const activityKind = z.enum(['travel', 'stream', 'trend'])
const collectibleCategory = z.enum(['postcard', 'million-shot', 'site-first'])
const friendEventId = z.enum([
  'class-representative-bing',
  'san-hao-rabbit',
  'xin-hao-rabbit',
  'signal-dog',
  'bili-bing',
])
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
  'travel-basic': itemCount,
  'travel-apple': itemCount,
  'signal-headphones': itemCount,
  'trend-toolbox': itemCount,
  'lucky-apple': itemCount,
})

const collectionEntry = z.strictObject({
  id: z.string().min(1),
  firstObtainedAt: timestamp,
  duplicateCount: safeCounter,
})

const collections = z.record(z.string().min(1), collectionEntry)

const rewardPlan = z.strictObject({
  baseApples: z.literal(0),
  modifierApples: z.literal(0),
  collection: z.strictObject({ id: z.string().min(1), category: collectibleCategory }).nullable(),
  friendEventId: friendEventId.nullable(),
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
  .nullable()

const counter = z.strictObject({
  travel: safeCounter,
  stream: safeCounter,
  trend: safeCounter,
})

const statistics = z.strictObject({
  started: counter,
  claimed: counter,
  applesEarned: safeCounter,
  duplicateRewards: safeCounter,
})

/** Demo 0.1 的严格载荷由领域迁移器唯一维护。 */
export const gameStateV1Schema = legacyGameStateV1Schema

const task = z.strictObject({
  instanceId: z.string().min(1),
  taskId,
  assignedAt: timestamp,
  progress: safeCounter,
  target: z.number().int().positive().safe(),
  rewardApples: safeCounter,
  seenKeys: z.array(z.string().min(1)),
})

/** 导入只校验历史 v2 的安全取值范围；不能把旧默认值等同于当前默认值。 */
const gameStateV2ImportSchema = z.strictObject({
  schemaVersion: z.literal(2),
  profile: z.strictObject({ createdAt: timestamp, debug: z.boolean() }),
  economy: z.strictObject({ apples }),
  inventory,
  collections,
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
  statistics,
  random: z.strictObject({
    seed: z.string().min(1),
    sequences: z.strictObject({
      reward: safeCounter,
      tasks: safeCounter,
      preferences: safeCounter,
    }),
  }),
})

const gameStateV2ExportSchema = gameStateV2ImportSchema.superRefine((state, context) => {
  if (
    !state.profile.debug &&
    (state.gameBalance.activityDurationMs !== DEFAULT_GAME_BALANCE.activityDurationMs ||
      Object.entries(DEFAULT_GAME_BALANCE.probabilities).some(
        ([key, value]) =>
          state.gameBalance.probabilities[key as keyof typeof state.gameBalance.probabilities] !==
          value,
      ))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['gameBalance'],
      message: '普通存档不能包含 DEBUG 调节值',
    })
  }
})

/** 新导出只允许写入 v2；普通档必须已经规范到当前版本的默认规则。 */
export const gameStateSchema: z.ZodType<GameState> = gameStateV2ExportSchema

/**
 * 导入阶段不做 transform：摘要必须先按文件中的原始 v1/v2 值验证，调用方
 * 随后再显式执行 v1 -> v2 迁移或普通档规则规范化。
 */
export const importableGameStateSchema: z.ZodType<GameStateV1 | GameState> = z.union([
  gameStateV1Schema,
  gameStateV2ImportSchema,
])

export type ImportableGameState = GameStateV1 | GameState
