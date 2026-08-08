import type { FRIEND_EVENT_IDS, ITEM_IDS } from './constants'
import type { GameBalance, ProbabilityKey } from './gameBalance'

export type ActivityKind = 'travel' | 'stream' | 'trend'

export type ActivityPhase = 'idle' | 'running' | 'ready'

export type ItemId = (typeof ITEM_IDS)[number]

export type FriendEventId = (typeof FRIEND_EVENT_IDS)[number]

export type CollectibleCategory = 'postcard' | 'million-shot' | 'site-first'

/**
 * 收藏目录来自当前版本内容，不写入存档。全站第一的 chronology 必须是同一 ID 集合的
 * 旧到新排列，因此目录扩充后旧存档会自然把新 ID 视为未拥有。
 */
export interface CollectionCatalog extends Readonly<
  Record<CollectibleCategory, readonly string[]>
> {
  readonly siteFirstChronology: readonly string[]
}

export interface CollectionEntry {
  id: string
  firstObtainedAt: number
  duplicateCount: number
}

export type Inventory = Record<ItemId, number>

/** 仅用于识别和迁移 Demo 0.1 的严格 v1 存档。 */
export interface PityState {
  stream: number
  trend: number
}

export interface PlannedCollectionReward {
  id: string
  category: CollectibleCategory
}

/**
 * 字段形状暂时兼容 v1 UI；v2 中苹果与保底字段固定为 0/false/null。
 * 收藏结果在活动开始时落盘，之后修改 DEBUG 概率也不会改写结果。
 */
export interface RewardPlan {
  baseApples: 0
  modifierApples: 0
  collection: PlannedCollectionReward | null
  friendEventId: FriendEventId | null
  guaranteedByPity: false
  pityAfterClaim: null
}

export interface ActivityRun {
  runId: string
  kind: ActivityKind
  /** 与 endsAt 一起持久化当次活动的时长快照，导入时不得按当前平衡配置重算。 */
  startedAt: number
  endsAt: number
  rewardSeed: string
  rewardPlan: RewardPlan
  supplyId: ItemId
  usedLuckyApple: boolean
}

export interface LegacyRewardPlan {
  baseApples: number
  modifierApples: number
  collection: PlannedCollectionReward | null
  friendEventId: FriendEventId | null
  guaranteedByPity: boolean
  pityAfterClaim: number | null
}

export interface LegacyActivityRun extends Omit<ActivityRun, 'rewardPlan'> {
  rewardPlan: LegacyRewardPlan
}

export interface ActivityCounters {
  travel: number
  stream: number
  trend: number
}

export interface GameStatistics {
  started: ActivityCounters
  claimed: ActivityCounters
  applesEarned: number
  duplicateRewards: number
}

export interface LegacyPersistentRandomState {
  seed: string
  sequence: number
}

export interface RandomSequences {
  reward: number
  tasks: number
  preferences: number
}

export interface PersistentRandomState {
  seed: string
  sequences: RandomSequences
}

export type RoomArea =
  | 'bed'
  | 'computer'
  | 'wardrobe'
  | 'piano'
  | 'record-player'
  | 'fridge'
  | 'collection-wall'
  | 'door'

export type PetLocation = 'center' | RoomArea | 'outside'

export type ActivityPreferences = Record<ActivityKind, boolean>

export interface PetState {
  location: PetLocation
  preferences: ActivityPreferences
  tired: boolean
  restCount: number
}

export type TaskId =
  | 'greet-bingo'
  | 'open-backpack'
  | 'room-stroll'
  | 'piano-time'
  | 'record-time'
  | 'two-melodies'
  | 'wardrobe-choice'
  | 'open-memories'
  | 'revisit-two'
  | 'remember-postcard'
  | 'remember-million'
  | 'remember-first'
  | 'stage-test'

export type TaskTriggerGroup =
  'pet' | 'room-navigation' | 'music' | 'wardrobe' | 'collection' | 'stage'

export interface TaskInstance {
  instanceId: string
  taskId: TaskId
  assignedAt: number
  progress: number
  target: number
  rewardApples: number
  seenKeys: string[]
}

export interface TaskBoard {
  active: [TaskInstance, TaskInstance, TaskInstance]
  completedCount: number
  recentTemplateIds: TaskId[]
  oneOffCompleted: TaskId[]
}

export type TaskEvent =
  | { type: 'pet-greeted' }
  | { type: 'pet-menu-opened' }
  | { type: 'room-visited'; area: RoomArea }
  | { type: 'collection-wall-opened' }
  | {
      type: 'collection-viewed'
      collectionId: string
      category: CollectibleCategory
    }
  | { type: 'stage-test-opened' }

/** Demo 0.1 的业务载荷，字段必须由严格 v1 schema 验证后才可迁移。 */
export interface GameStateV1 {
  schemaVersion: 1
  profile: {
    createdAt: number
    debug: boolean
  }
  economy: {
    apples: number
  }
  inventory: Inventory
  collections: Record<string, CollectionEntry>
  activeActivity: LegacyActivityRun | null
  pity: PityState
  statistics: GameStatistics
  random: LegacyPersistentRandomState
}

export interface GameStateV2 {
  schemaVersion: 2
  profile: {
    createdAt: number
    debug: boolean
  }
  economy: {
    apples: number
  }
  inventory: Inventory
  collections: Record<string, CollectionEntry>
  activeActivity: ActivityRun | null
  pet: PetState
  tasks: TaskBoard
  gameBalance: GameBalance
  statistics: GameStatistics
  random: PersistentRandomState
}

export type GameState = GameStateV2

export interface ActivityTiming {
  phase: ActivityPhase
  remainingMs: number
  remainingSeconds: number
  progress: number
}

export interface ClaimSummary {
  runId: string
  kind: ActivityKind
  apples: {
    base: number
    modifier: number
    duplicateCompensation: number
    total: number
  }
  collection: (PlannedCollectionReward & { duplicate: boolean }) | null
  friendEventId: FriendEventId | null
  guaranteedByPity: boolean
}

export type GameErrorCode =
  | 'ACTIVITY_ALREADY_ACTIVE'
  | 'ACTIVITY_NOT_ACTIVE'
  | 'ACTIVITY_NOT_READY'
  | 'ACTIVITY_REFUSED'
  | 'PET_BUSY'
  | 'RUN_ID_MISMATCH'
  | 'INVALID_TIME'
  | 'INVALID_DURATION'
  | 'INVALID_PROBABILITY'
  | 'INVALID_LOCATION'
  | 'INVALID_AMOUNT'
  | 'INSUFFICIENT_APPLES'
  | 'MISSING_REQUIRED_ITEM'
  | 'INVENTORY_LIMIT_REACHED'
  | 'APPLE_LIMIT_REACHED'
  | 'INVALID_SUPPLY'
  | 'EMPTY_COLLECTION_POOL'
  | 'LUCKY_APPLE_NOT_USEFUL'
  | 'INVALID_CATALOG'
  | 'UNKNOWN_COLLECTION'
  | 'DEBUG_REQUIRED'

export interface GameError {
  code: GameErrorCode
  message: string
}

export type GameAction =
  | {
      type: 'activity/start'
      kind: ActivityKind
      now: number
      supplyId?: ItemId
      useLuckyApple?: boolean
      /** 兼容旧 UI；新 DEBUG 面板应改用 debug/duration-set。 */
      debugDurationMs?: number
    }
  | { type: 'activity/claim'; runId: string; now: number }
  | { type: 'item/purchase'; itemId: ItemId; quantity?: number }
  | { type: 'room/interact'; area: RoomArea; now: number }
  | { type: 'pet/move'; location: PetLocation }
  | { type: 'pet/rest'; now: number }
  | { type: 'pet/encourage'; kind: ActivityKind }
  | { type: 'task/event'; event: TaskEvent; now: number }
  | { type: 'debug/apples-adjust'; delta: number }
  | { type: 'debug/item-adjust'; itemId: ItemId; delta: number }
  | { type: 'debug/collection-set'; collectionId: string; owned: boolean; now: number }
  | { type: 'debug/collect-all'; now: number }
  | { type: 'debug/activity-complete'; now: number }
  | { type: 'debug/activity-clear' }
  | { type: 'debug/duration-set'; durationMs: number }
  | { type: 'debug/probability-set'; key: ProbabilityKey; value: number }
  | { type: 'debug/tuning-reset' }

export type GameEffect =
  | { type: 'activity-started'; activity: ActivityRun }
  | { type: 'activity-claimed'; summary: ClaimSummary }
  | { type: 'item-purchased'; itemId: ItemId; quantity: number; applesSpent: number }
  | { type: 'pet-moved'; location: PetLocation }
  | {
      type: 'pet-rested'
      restCount: number
      preferences: ActivityPreferences
      replayKey: number
    }
  | { type: 'pet-encouraged'; kind: ActivityKind; applesSpent: number }
  | {
      type: 'task-progressed'
      instanceId: string
      taskId: TaskId
      progress: number
      target: number
      completed: boolean
      applesAwarded: number
      boardRefreshed: boolean
    }
  | { type: 'debug-applied'; action: GameAction['type']; changedCount?: number }

export type GameTransition =
  | { ok: true; state: GameState; effects: readonly GameEffect[] }
  | { ok: false; state: GameState; error: GameError; effects: readonly [] }
