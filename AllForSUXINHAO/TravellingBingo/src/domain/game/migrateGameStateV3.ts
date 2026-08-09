import { z } from 'zod'

import {
  BILIBILI_BVID_PATTERN,
  FRIEND_IDS,
  LEGACY_ITEM_IDS,
  MAX_APPLES,
  MAX_COMPANION_DAYS,
  MAX_ITEM_STACK,
  MAX_PLAYLIST_ID_LENGTH,
  MAX_PLAYLIST_NAME_LENGTH,
  MAX_PLAYLISTS,
  MAX_PLAYLIST_TRACKS,
  MAX_POMODORO_DURATION_MS,
  MAX_TODO_ID_LENGTH,
  MAX_TODOS,
  MAX_TODO_TITLE_LENGTH,
  MIN_POMODORO_DURATION_MS,
  REALITY_REWARD_INTERVAL_MS,
  VITALITY_MAGIC_COMPANION_DAYS,
} from './constants'
import { createDefaultGameBalance, isValidActivityDuration } from './gameBalance'
import { migrateGameStateV1, type MigrateGameStateV1Options } from './migrateGameStateV1'
import { migrateGameStateV2ToV3, migrateStoredGameStateToV3 } from './migrateGameStateV2'
import { isValidDisplayName } from './profile'
import type { CollectionCatalog, GameStateV1, GameStateV2, GameStateV3, GameStateV4 } from './types'
import { validateCollectionCatalog } from './validateCollectionCatalog'
import { replaceRetiredTaskBoard } from '../tasks/taskBoard'
import { assertValidTimestamp, MAX_DATE_TIMESTAMP_MS } from './time'

const timestamp = z.number().int().nonnegative().max(MAX_DATE_TIMESTAMP_MS)
const safeCounter = z.number().int().nonnegative().safe()
const probability = z.number().min(0).max(1).finite()
const activityDuration = z
  .number()
  .int()
  .positive()
  .safe()
  .refine(isValidActivityDuration, '活动时长超出允许范围')
const pomodoroDuration = z
  .number()
  .int()
  .safe()
  .min(MIN_POMODORO_DURATION_MS)
  .max(MAX_POMODORO_DURATION_MS)
const legacyItemId = z.enum(LEGACY_ITEM_IDS)
const friendId = z.enum(FRIEND_IDS)
const activityKind = z.enum(['travel', 'stream', 'trend', 'music', 'rest'])
const collectibleCategory = z.enum(['postcard', 'million-shot', 'site-first'])
const petLocationV3 = z.enum([
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
const petLocationV4 = z.enum([...petLocationV3.options, 'work-computer'])
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

const legacyInventory = z.strictObject({
  'travel-basic': z.number().int().nonnegative().max(MAX_ITEM_STACK),
  'travel-apple': z.number().int().nonnegative().max(MAX_ITEM_STACK),
  'signal-headphones': z.number().int().nonnegative().max(MAX_ITEM_STACK),
  'trend-toolbox': z.number().int().nonnegative().max(MAX_ITEM_STACK),
  'lucky-apple': z.number().int().nonnegative().max(MAX_ITEM_STACK),
})

const inventory = legacyInventory.extend({
  'bottled-speed-magic': z.number().int().nonnegative().max(MAX_ITEM_STACK),
  'bottled-vitality-magic': z.number().int().nonnegative().max(MAX_ITEM_STACK),
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
    totalGiftApples: z.number().int().nonnegative().max(MAX_APPLES),
  })
  .refine((entry) => entry.lastMetAt >= entry.firstMetAt, {
    path: ['lastMetAt'],
    message: '最近相遇时间不能早于首次相遇时间',
  })

const rewardPlan = z.strictObject({
  baseApples: z.number().int().nonnegative().safe(),
  modifierApples: z.number().int().nonnegative().safe(),
  collection: z.strictObject({ id: z.string().min(1), category: collectibleCategory }).nullable(),
  friendId: friendId.nullable(),
  giftItemId: legacyItemId.nullable(),
  guaranteedByPity: z.boolean(),
  pityAfterClaim: safeCounter.nullable(),
})

const activeActivityFields = {
  runId: z.string().min(1),
  kind: activityKind,
  startedAt: timestamp,
  endsAt: timestamp,
  rewardSeed: z.string().min(1),
  rewardPlan,
  supplyId: legacyItemId.nullable(),
  usedLuckyApple: z.boolean(),
}

const activeActivityV3 = z
  .strictObject(activeActivityFields)
  .refine((activity) => activity.endsAt >= activity.startedAt, {
    path: ['endsAt'],
    message: '活动结束时间不能早于开始时间',
  })
  .nullable()

const activeActivityV4 = z
  .strictObject({ ...activeActivityFields, legacySource: z.literal('v1').optional() })
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

const task = z.strictObject({
  instanceId: z.string().min(1),
  taskId,
  assignedAt: timestamp,
  progress: safeCounter,
  target: z.number().int().positive().safe(),
  rewardApples: safeCounter,
  seenKeys: z.array(z.string().min(1)),
})

const taskBoard = z.strictObject({
  active: z.tuple([task, task, task]),
  completedCount: safeCounter,
  recentTemplateIds: z.array(taskId),
  oneOffCompleted: z.array(taskId),
})

const gameBalance = z.strictObject({
  activityDurationMs: activityDuration,
  probabilities: z.strictObject({
    postcard: probability,
    millionShot: probability,
    siteFirst: probability,
    travelFriend: probability,
    musicFriend: probability,
  }),
})

const statistics = z.strictObject({
  started: activityCounter,
  claimed: activityCounter,
  applesEarned: safeCounter,
  duplicateRewards: safeCounter,
})

const randomState = z.strictObject({
  seed: z.string().min(1),
  sequences: z.strictObject({ reward: safeCounter, tasks: safeCounter, preferences: safeCounter }),
})

const profile = z.strictObject({
  createdAt: timestamp,
  debug: z.boolean(),
  displayName: z.string().refine(isValidDisplayName, '用户名必须是 1–16 个非空字符'),
  companionDays: z.number().int().nonnegative().max(MAX_COMPANION_DAYS),
})

const petV3 = z.strictObject({
  location: petLocationV3,
  preferences: z.strictObject({
    travel: z.boolean(),
    computer: z.boolean(),
    music: z.boolean(),
  }),
  tired: z.boolean(),
  restCount: safeCounter,
})

/** 已发布 V3 的严格原始载荷；新增 V4 字段绝不能改变它。 */
export const gameStateV3Schema: z.ZodType<GameStateV3> = z.strictObject({
  schemaVersion: z.literal(3),
  profile,
  economy: z.strictObject({ apples: z.number().int().nonnegative().max(MAX_APPLES) }),
  inventory: legacyInventory,
  collections: z.record(z.string().min(1), collectionEntry),
  friends: z.partialRecord(friendId, friendEntry),
  activeActivity: activeActivityV3,
  pet: petV3,
  tasks: taskBoard,
  gameBalance,
  statistics,
  random: randomState,
})

const vitalityEffect = z
  .strictObject({
    activatedAt: timestamp,
    activatedOnCompanionDay: z.number().int().nonnegative().max(MAX_COMPANION_DAYS),
    expiresAfterCompanionDay: z.number().int().positive().max(MAX_COMPANION_DAYS),
  })
  .refine((effect) => effect.expiresAfterCompanionDay > effect.activatedOnCompanionDay, {
    path: ['expiresAfterCompanionDay'],
    message: '活力效果结束日必须晚于生效日',
  })

function boundedIdentifier(maxLength: number, message: string) {
  return z
    .string()
    .refine(
      (value) => value === value.trim() && value.length >= 1 && value.length <= maxLength,
      message,
    )
}

const todoIdentifier = boundedIdentifier(
  MAX_TODO_ID_LENGTH,
  '待办 ID 必须是 1–64 个无首尾空白的字符',
)
const playlistIdentifier = boundedIdentifier(
  MAX_PLAYLIST_ID_LENGTH,
  '播放列表 ID 必须是 1–64 个无首尾空白的字符',
)

const todoTitle = z.string().refine((value) => {
  const trimmed = value.trim()
  return (
    trimmed === value && [...trimmed].length >= 1 && [...trimmed].length <= MAX_TODO_TITLE_LENGTH
  )
}, '待办标题必须是 1–120 个已去除首尾空白的字符')

const todo = z
  .strictObject({
    id: todoIdentifier,
    title: todoTitle,
    createdAt: timestamp,
    updatedAt: timestamp,
    dueAt: timestamp.nullable(),
    completedAt: timestamp.nullable(),
    notificationIssuedAt: timestamp.nullable(),
  })
  .superRefine((entry, context) => {
    if (entry.updatedAt < entry.createdAt) {
      context.addIssue({ code: 'custom', path: ['updatedAt'], message: '更新时间不能早于创建时间' })
    }
    if (entry.completedAt !== null && entry.completedAt < entry.createdAt) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: '完成时间不能早于创建时间',
      })
    }
    if (entry.completedAt !== null && entry.completedAt > entry.updatedAt) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: '完成时间不能晚于最后更新时间',
      })
    }
    if (entry.notificationIssuedAt !== null && entry.dueAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['notificationIssuedAt'],
        message: '没有到期节点的待办不能标记通知',
      })
    }
    if (
      entry.notificationIssuedAt !== null &&
      entry.dueAt !== null &&
      entry.notificationIssuedAt < entry.dueAt
    ) {
      context.addIssue({
        code: 'custom',
        path: ['notificationIssuedAt'],
        message: '通知签发时间不能早于待办节点',
      })
    }
  })

const pomodoroSession = z
  .strictObject({
    sessionId: z.string().min(1).max(128),
    status: z.enum(['running', 'completed']),
    startedAt: timestamp,
    endsAt: timestamp,
    durationMs: pomodoroDuration,
    completedAt: timestamp.nullable(),
    notificationIssuedAt: timestamp.nullable(),
    todoId: todoIdentifier.nullable(),
    postcardId: z.string().min(1).nullable(),
  })
  .superRefine((session, context) => {
    if (session.endsAt !== session.startedAt + session.durationMs) {
      context.addIssue({ code: 'custom', path: ['endsAt'], message: '苹果钟结束时间与时长不一致' })
    }
    if (session.status === 'running') {
      if (session.completedAt !== null || session.notificationIssuedAt !== null) {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: '运行中的苹果钟不能已完成或已通知',
        })
      }
    } else if (
      session.completedAt !== session.endsAt ||
      session.notificationIssuedAt === null ||
      session.notificationIssuedAt < session.endsAt
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: '完成的苹果钟缺少合法完成与通知时间',
      })
    }
  })

const playlistName = z.string().refine((value) => {
  const trimmed = value.trim()
  return (
    trimmed === value && [...trimmed].length >= 1 && [...trimmed].length <= MAX_PLAYLIST_NAME_LENGTH
  )
}, '播放列表名称必须是 1–60 个已去除首尾空白的字符')
const bvid = z.string().regex(BILIBILI_BVID_PATTERN)
const playlist = z
  .strictObject({
    id: playlistIdentifier,
    name: playlistName,
    bvids: z.array(bvid).max(MAX_PLAYLIST_TRACKS),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((entry, context) => {
    if (new Set(entry.bvids).size !== entry.bvids.length) {
      context.addIssue({ code: 'custom', path: ['bvids'], message: '播放列表不能包含重复 BV' })
    }
    if (entry.updatedAt < entry.createdAt) {
      context.addIssue({ code: 'custom', path: ['updatedAt'], message: '更新时间不能早于创建时间' })
    }
  })

const gameStateV4Shape = z.strictObject({
  schemaVersion: z.literal(4),
  profile,
  economy: z.strictObject({ apples: z.number().int().nonnegative().max(MAX_APPLES) }),
  inventory,
  collections: z.record(z.string().min(1), collectionEntry),
  friends: z.partialRecord(friendId, friendEntry),
  activeActivity: activeActivityV4,
  pet: petV3.extend({ location: petLocationV4 }),
  tasks: taskBoard,
  gameBalance,
  statistics,
  random: randomState,
  world: z.enum(['game', 'reality']),
  player: z.strictObject({ effects: z.strictObject({ vitality: vitalityEffect.nullable() }) }),
  reality: z.strictObject({
    nextStaySequence: safeCounter,
    activeStay: z.strictObject({ stayId: z.string().min(1), enteredAt: timestamp }).nullable(),
    pendingSettlement: z
      .strictObject({
        stayId: z.string().min(1),
        enteredAt: timestamp,
        leftAt: timestamp,
        fullRewardApples: safeCounter,
      })
      .nullable(),
    todos: z.record(todoIdentifier, todo),
    pomodoro: z.strictObject({
      nextSessionSequence: safeCounter,
      selectedPostcardId: z.string().min(1).nullable(),
      session: pomodoroSession.nullable(),
    }),
  }),
  musicPlayer: z.strictObject({
    playlists: z.record(playlistIdentifier, playlist),
    order: z.array(playlistIdentifier).max(MAX_PLAYLISTS),
    activePlaylistId: playlistIdentifier.nullable(),
    currentBvid: bvid.nullable(),
    currentIndex: safeCounter,
    loopMode: z.enum(['list', 'single', 'shuffle']),
    startAtSeconds: safeCounter,
    autoplay: z.boolean(),
  }),
})

/** V4 严格存档 schema；目录成员关系继续由 validateImportedGameState 校验。 */
export const gameStateV4Schema: z.ZodType<GameStateV4> = gameStateV4Shape.superRefine(
  (state, context) => {
    const vitality = state.player.effects.vitality
    if (vitality !== null && state.profile.companionDays >= vitality.expiresAfterCompanionDay) {
      context.addIssue({
        code: 'custom',
        path: ['player', 'effects', 'vitality'],
        message: '活力效果已经过期',
      })
    }
    if (
      vitality !== null &&
      (state.profile.companionDays < vitality.activatedOnCompanionDay ||
        vitality.expiresAfterCompanionDay !==
          Math.min(
            MAX_COMPANION_DAYS,
            vitality.activatedOnCompanionDay + VITALITY_MAGIC_COMPANION_DAYS,
          ))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['player', 'effects', 'vitality'],
        message: '活力效果的七日窗口无效',
      })
    }
    if (
      vitality !== null &&
      (state.pet.tired || !Object.values(state.pet.preferences).every(Boolean))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['pet', 'preferences'],
        message: '活力效果生效时所有活动意愿必须为真',
      })
    }
    if (state.tasks.active.some((entry) => entry.taskId === 'greet-bingo')) {
      context.addIssue({
        code: 'custom',
        path: ['tasks', 'active'],
        message: 'V4 任务板不能再包含已退役的打招呼任务',
      })
    }

    if ((state.world === 'reality') !== (state.reality.activeStay !== null)) {
      context.addIssue({ code: 'custom', path: ['world'], message: '世界状态与现实停留记录不一致' })
    }
    if (state.reality.activeStay !== null && state.reality.pendingSettlement !== null) {
      context.addIssue({
        code: 'custom',
        path: ['reality'],
        message: '现实停留与待决奖励不能同时存在',
      })
    }
    if (
      state.reality.pendingSettlement !== null &&
      state.reality.pendingSettlement.leftAt < state.reality.pendingSettlement.enteredAt
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'pendingSettlement'],
        message: '现实停留时间倒置',
      })
    }
    if (
      state.reality.pendingSettlement !== null &&
      state.reality.pendingSettlement.fullRewardApples !==
        Math.floor(
          (state.reality.pendingSettlement.leftAt - state.reality.pendingSettlement.enteredAt) /
            REALITY_REWARD_INTERVAL_MS,
        )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'pendingSettlement', 'fullRewardApples'],
        message: '现实停留奖励与完整十分钟数不一致',
      })
    }

    const todoEntries = Object.entries(state.reality.todos)
    if (todoEntries.length > MAX_TODOS) {
      context.addIssue({ code: 'custom', path: ['reality', 'todos'], message: '待办数量超过上限' })
    }
    for (const [key, entry] of todoEntries) {
      if (key !== entry.id) {
        context.addIssue({
          code: 'custom',
          path: ['reality', 'todos', key],
          message: '待办键与 ID 不一致',
        })
      }
    }
    const linkedTodoId = state.reality.pomodoro.session?.todoId
    if (
      linkedTodoId !== null &&
      linkedTodoId !== undefined &&
      state.reality.todos[linkedTodoId] === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'pomodoro', 'session', 'todoId'],
        message: '苹果钟关联了不存在的待办',
      })
    }

    const playlists = state.musicPlayer.playlists
    const playlistIds = Object.keys(playlists)
    if (playlistIds.length > MAX_PLAYLISTS) {
      context.addIssue({
        code: 'custom',
        path: ['musicPlayer', 'playlists'],
        message: '播放列表数量超过上限',
      })
    }
    for (const [key, entry] of Object.entries(playlists)) {
      if (key !== entry.id) {
        context.addIssue({
          code: 'custom',
          path: ['musicPlayer', 'playlists', key],
          message: '播放列表键与 ID 不一致',
        })
      }
    }
    if (
      new Set(state.musicPlayer.order).size !== state.musicPlayer.order.length ||
      state.musicPlayer.order.length !== playlistIds.length ||
      state.musicPlayer.order.some((id) => playlists[id] === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['musicPlayer', 'order'],
        message: '播放列表顺序必须完整且无重复',
      })
    }
    const activePlaylistId = state.musicPlayer.activePlaylistId
    if (state.musicPlayer.currentBvid === null && state.musicPlayer.currentIndex !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['musicPlayer'],
        message: '未选择曲目时索引必须归零',
      })
    }
    if (activePlaylistId !== null) {
      const active = playlists[activePlaylistId]
      if (active === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['musicPlayer', 'activePlaylistId'],
          message: '当前播放列表不存在',
        })
      } else if (active.bvids.length === 0) {
        if (state.musicPlayer.currentBvid !== null || state.musicPlayer.currentIndex !== 0) {
          context.addIssue({
            code: 'custom',
            path: ['musicPlayer'],
            message: '空播放列表不能选择曲目',
          })
        }
      } else if (active.bvids[state.musicPlayer.currentIndex] !== state.musicPlayer.currentBvid) {
        context.addIssue({
          code: 'custom',
          path: ['musicPlayer'],
          message: '当前曲目与播放列表索引不一致',
        })
      }
    }
  },
)

export function isStrictGameStateV3(value: unknown): value is GameStateV3 {
  return gameStateV3Schema.safeParse(value).success
}

export function isStrictGameStateV4(value: unknown): value is GameStateV4 {
  return gameStateV4Schema.safeParse(value).success
}

export interface MigrateGameStateV3Options {
  now: number
  catalog: CollectionCatalog
}

/** V3 -> V4：绝不重算 activeActivity，只让未来普通活动采用 V4 当前默认。 */
export function migrateGameStateV3ToV4(
  state: GameStateV3,
  options: MigrateGameStateV3Options,
): GameStateV4 {
  assertValidTimestamp(options.now, '迁移时间必须是 Date 可表示的非负整数毫秒时间戳')
  const catalogValidation = validateCollectionCatalog(options.catalog)
  if (!catalogValidation.ok) throw new TypeError(catalogValidation.message)
  const repairedTasks = replaceRetiredTaskBoard({
    board: state.tasks,
    seed: state.random.seed,
    sequence: state.random.sequences.tasks,
    now: options.now,
    catalog: options.catalog,
    collections: state.collections,
  })
  return {
    schemaVersion: 4,
    profile: structuredClone(state.profile),
    economy: structuredClone(state.economy),
    inventory: {
      ...structuredClone(state.inventory),
      'bottled-speed-magic': 0,
      'bottled-vitality-magic': 0,
    },
    collections: structuredClone(state.collections),
    friends: structuredClone(state.friends),
    // V3 原生活动（睡觉的固定苹果、电子琴好友赠礼）也可能携带非零苹果，
    // 因此绝不能从奖励数值猜测 V1 来源。只有显式 V1 -> V4 包装器会写来源标记。
    activeActivity: structuredClone(state.activeActivity),
    pet: structuredClone(state.pet),
    tasks: structuredClone(repairedTasks.board),
    gameBalance: state.profile.debug
      ? structuredClone(state.gameBalance)
      : createDefaultGameBalance(),
    statistics: structuredClone(state.statistics),
    random: {
      ...structuredClone(state.random),
      sequences: {
        ...structuredClone(state.random.sequences),
        tasks: repairedTasks.nextSequence,
      },
    },
    world: 'game',
    player: { effects: { vitality: null } },
    reality: {
      nextStaySequence: 0,
      activeStay: null,
      pendingSettlement: null,
      todos: {},
      pomodoro: { nextSessionSequence: 0, selectedPostcardId: null, session: null },
    },
    musicPlayer: {
      playlists: {},
      order: [],
      activePlaylistId: null,
      currentBvid: null,
      currentIndex: 0,
      loopMode: 'list',
      startAtSeconds: 0,
      autoplay: true,
    },
  }
}

export type StoredGameStateThroughV4 = GameStateV1 | GameStateV2 | GameStateV3 | GameStateV4

export function migrateStoredGameStateToV4(
  state: StoredGameStateThroughV4,
  options: MigrateGameStateV1Options,
): GameStateV4 {
  if (state.schemaVersion === 4) {
    return state.musicPlayer.autoplay
      ? state
      : { ...state, musicPlayer: { ...state.musicPlayer, autoplay: true } }
  }
  if (state.schemaVersion === 1) return migrateGameStateV1ToV4(state, options)
  if (state.schemaVersion === 3) return migrateGameStateV3ToV4(state, options)
  return migrateGameStateV3ToV4(migrateStoredGameStateToV3(state, options), options)
}

export function migrateGameStateV2ToV4(
  state: GameStateV2,
  options: MigrateGameStateV1Options,
): GameStateV4 {
  return migrateGameStateV3ToV4(migrateGameStateV2ToV3(state, options), options)
}

export function migrateGameStateV1ToV4(
  state: GameStateV1,
  options: MigrateGameStateV1Options,
): GameStateV4 {
  const migrated = migrateGameStateV3ToV4(
    migrateGameStateV2ToV3(migrateGameStateV1(state, options), options),
    options,
  )
  return migrated.activeActivity === null
    ? migrated
    : {
        ...migrated,
        activeActivity: { ...migrated.activeActivity, legacySource: 'v1' },
      }
}
