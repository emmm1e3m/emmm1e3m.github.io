import { z } from 'zod'

import {
  DEFAULT_GAME_BALANCE,
  FRIEND_GIFT_ITEM_BY_ID,
  ITEM_IDS,
  MAX_COMPANION_DAYS,
  gameStateV1Schema as legacyGameStateV1Schema,
  gameStateV2Schema,
  isValidActivityDuration,
  isValidDisplayName,
  type GameState,
  type GameStateV1,
  type GameStateV2,
  type FriendId,
  type StoredGameState,
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

const itemId = z.enum(ITEM_IDS)
const activityKind = z.enum(['travel', 'stream', 'trend', 'music', 'rest'])
const collectibleCategory = z.enum(['postcard', 'million-shot', 'site-first'])
const friendIds = Object.keys(FRIEND_GIFT_ITEM_BY_ID) as [FriendId, ...FriendId[]]
const friendId = z.enum(friendIds)
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

const friendEntry = z
  .strictObject({
    id: friendId,
    firstMetAt: timestamp,
    lastMetAt: timestamp,
    encounterCount: z.number().int().positive().safe(),
    totalGiftApples: safeCounter,
  })
  .refine((entry) => entry.lastMetAt >= entry.firstMetAt, {
    path: ['lastMetAt'],
    message: '最近相遇时间不能早于首次相遇时间',
  })

const rewardPlan = z.strictObject({
  baseApples: apples,
  modifierApples: apples,
  collection: z.strictObject({ id: z.string().min(1), category: collectibleCategory }).nullable(),
  friendId: friendId.nullable(),
  giftItemId: itemId.nullable(),
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
    supplyId: itemId.nullable(),
    usedLuckyApple: z.boolean(),
  })
  .refine((activity) => activity.endsAt >= activity.startedAt, {
    path: ['endsAt'],
    message: '活动结束时间不能早于开始时间',
  })
  .nullable()

const activityCounter = z.strictObject({
  travel: safeCounter,
  stream: safeCounter,
  trend: safeCounter,
  music: safeCounter,
  rest: safeCounter,
})

const statistics = z.strictObject({
  started: activityCounter,
  claimed: activityCounter,
  applesEarned: safeCounter,
  duplicateRewards: safeCounter,
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

/** Demo 0.1 的严格载荷由领域迁移器唯一维护。 */
export const gameStateV1Schema = legacyGameStateV1Schema

/**
 * schemaVersion 2 是已经发布的历史格式。直接复用领域层冻结的严格 schema，
 * 不能让 V3 新字段或默认值改变旧文件的摘要后解析语义。
 */
export const gameStateV2ImportSchema: z.ZodType<GameStateV2> = gameStateV2Schema

/** 导入 V3 只校验安全范围；普通档的历史规则会在摘要校验后显式规范化。 */
export const gameStateV3ImportSchema: z.ZodType<GameState> = z.strictObject({
  schemaVersion: z.literal(3),
  profile: z.strictObject({
    createdAt: timestamp,
    debug: z.boolean(),
    displayName: z.string().refine(isValidDisplayName, '用户名必须是 1–16 个非空字符'),
    companionDays: z.number().int().nonnegative().max(MAX_COMPANION_DAYS),
  }),
  economy: z.strictObject({ apples }),
  inventory,
  collections: z.record(z.string().min(1), collectionEntry),
  friends: z.partialRecord(friendId, friendEntry),
  activeActivity,
  pet: z.strictObject({
    location: petLocation,
    preferences: z.strictObject({
      travel: z.boolean(),
      computer: z.boolean(),
      music: z.boolean(),
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
      travelFriend: probability,
      musicFriend: probability,
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

const gameStateV3ExportSchema = gameStateV3ImportSchema.superRefine((state, context) => {
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

/** 新导出只允许写入 V3；普通档必须已经规范到当前版本的默认规则。 */
export const gameStateSchema: z.ZodType<GameState> = gameStateV3ExportSchema

/**
 * 导入阶段绝不 transform：摘要先按文件中的原始 v1/v2/v3 值验证，调用方
 * 随后再显式迁移到 V3、规范普通档规则并完成目录校验。
 */
export const importableGameStateSchema: z.ZodType<StoredGameState> = z.union([
  gameStateV1Schema,
  gameStateV2ImportSchema,
  gameStateV3ImportSchema,
])

export type ImportableGameState = GameStateV1 | GameStateV2 | GameState
