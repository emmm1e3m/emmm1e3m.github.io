import type { FRIEND_EVENT_IDS, ITEM_IDS, LEGACY_ITEM_IDS, PIANO_NOTE_IDS } from './constants'
import type { GameBalance, GameBalanceV2, ProbabilityKey } from './gameBalance'

export type LegacyActivityKind = 'travel' | 'stream' | 'trend'

export type ActivityKind = LegacyActivityKind | 'music' | 'rest'

export type CollectibleActivityKind = LegacyActivityKind

export type PetInterest = 'travel' | 'computer' | 'music'

export type ActivityPhase = 'idle' | 'running' | 'ready'

export type ItemId = (typeof ITEM_IDS)[number]

export type LegacyItemId = (typeof LEGACY_ITEM_IDS)[number]

export type PianoNoteId = (typeof PIANO_NOTE_IDS)[number]

export type FriendId = (typeof FRIEND_EVENT_IDS)[number]

/** @deprecated V3 统一使用 FriendId。 */
export type FriendEventId = FriendId

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

export interface FriendEntry {
  id: FriendId
  firstMetAt: number
  lastMetAt: number
  encounterCount: number
  totalGiftApples: number
}

export type FriendCollection = Partial<Record<FriendId, FriendEntry>>

export type Inventory = Record<ItemId, number>

/** V1–V3 冻结的五种旧道具结构；不能随 V4 冰箱扩项漂移。 */
export type LegacyInventory = Record<LegacyItemId, number>

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
 * 原生 v2 存档的苹果字段固定为 0；类型保留 number 是为了让 v1 -> v2 迁移中间态
 * 无损携带 v1 已冻结的苹果计划。严格 v2 导入 schema 仍只接受原生的 0。
 */
export interface RewardPlanV2 {
  baseApples: number
  modifierApples: number
  collection: PlannedCollectionReward | null
  friendEventId: FriendEventId | null
  guaranteedByPity: boolean
  pityAfterClaim: number | null
}

/**
 * V3 仍保留 base/modifier 字段以兼容奖励展示：睡觉苹果写入 base，好友赠礼写入 modifier。
 */
export interface RewardPlan {
  baseApples: number
  modifierApples: number
  collection: PlannedCollectionReward | null
  friendId: FriendId | null
  giftItemId: LegacyItemId | null
  /** 新活动固定为 false；旧 V1 活动保留开始时冻结的展示元数据。 */
  guaranteedByPity: boolean
  /** 新活动固定为 null；旧 V1 活动只保留快照，V4 不再继续旧保底计数。 */
  pityAfterClaim: number | null
}

export interface ActivityRun {
  runId: string
  kind: ActivityKind
  /** 与 endsAt 一起持久化当次活动的时长快照，导入时不得按当前平衡配置重算。 */
  startedAt: number
  endsAt: number
  rewardSeed: string
  rewardPlan: RewardPlan
  supplyId: LegacyItemId | null
  usedLuckyApple: boolean
  /** 仅 V4 迁移写入；用于无损兑现 V1 的重复收藏与苹果快照。 */
  legacySource?: 'v1'
}

export interface ActivityRunV2 {
  runId: string
  kind: LegacyActivityKind
  startedAt: number
  endsAt: number
  rewardSeed: string
  rewardPlan: RewardPlanV2
  supplyId: LegacyItemId
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

export interface LegacyActivityRun extends Omit<ActivityRunV2, 'rewardPlan'> {
  rewardPlan: LegacyRewardPlan
}

export interface ActivityCounters {
  travel: number
  stream: number
  trend: number
  music: number
  rest: number
}

export interface LegacyActivityCounters {
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

export interface LegacyGameStatistics {
  started: LegacyActivityCounters
  claimed: LegacyActivityCounters
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

export type LegacyRoomArea =
  | 'bed'
  | 'computer'
  | 'wardrobe'
  | 'piano'
  | 'record-player'
  | 'fridge'
  | 'collection-wall'
  | 'door'

export type RoomArea = LegacyRoomArea | 'work-computer'

export type PetLocationV3 = 'center' | LegacyRoomArea | 'outside'

export type PetLocation = 'center' | RoomArea | 'outside'

export type ActivityPreferences = Record<PetInterest, boolean>

export type ActivityPreferencesV2 = Record<LegacyActivityKind, boolean>

export interface PetState {
  location: PetLocation
  preferences: ActivityPreferences
  tired: boolean
  restCount: number
}

export interface PetStateV3 extends Omit<PetState, 'location'> {
  location: PetLocationV3
}

export interface PetStateV2 {
  location: PetLocationV3
  preferences: ActivityPreferencesV2
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
  | { type: 'piano-note-played'; noteId: PianoNoteId }
  /** 只确认用户主动发起播放请求；不代表 iframe 已加载或视频实际播放、播完。 */
  | { type: 'record-player-opened'; bvid: string }
  | { type: 'collection-player-opened'; collectionId: string; bvid: string }
  | { type: 'stage-test-opened' }

export type WorldDimension = 'game' | 'reality'

/** 活力魔法按“成功领取活动后增加的伴随日”计时，结束日为 exclusive。 */
export interface VitalityEffect {
  activatedAt: number
  activatedOnCompanionDay: number
  expiresAfterCompanionDay: number
}

/** 玩家持久状态；与 reducer 返回、仅供 UI 播放一次的 GameEffect 明确分离。 */
export interface PlayerState {
  effects: {
    vitality: VitalityEffect | null
  }
}

export interface RealityStay {
  stayId: string
  enteredAt: number
}

export interface RealitySettlement {
  stayId: string
  enteredAt: number
  leftAt: number
  fullRewardApples: number
}

export type RealityRewardDecision = 'serious' | 'not-serious'

export interface TodoItem {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  dueAt: number | null
  completedAt: number | null
  /** clock/tick 成功签发浏览器通知请求的时间；非浏览器实际展示回执。 */
  notificationIssuedAt: number | null
}

export type PomodoroStatus = 'running' | 'completed'

export interface PomodoroSession {
  sessionId: string
  status: PomodoroStatus
  startedAt: number
  endsAt: number
  durationMs: number
  completedAt: number | null
  notificationIssuedAt: number | null
  todoId: string | null
  /** 开始时锁定的明信片背景；只保存收藏 ID，不复制展示元数据。 */
  postcardId: string | null
}

export interface PomodoroState {
  nextSessionSequence: number
  selectedPostcardId: string | null
  session: PomodoroSession | null
}

export interface RealityState {
  nextStaySequence: number
  activeStay: RealityStay | null
  pendingSettlement: RealitySettlement | null
  todos: Record<string, TodoItem>
  pomodoro: PomodoroState
}

export type MusicLoopMode = 'list' | 'single' | 'shuffle'

export interface MusicPlaylist {
  id: string
  name: string
  bvids: string[]
  createdAt: number
  updatedAt: number
}

/** 仅保存用户播放列表与明确设置；内置曲目和视频元数据始终来自 content。 */
export interface MusicPlayerState {
  playlists: Record<string, MusicPlaylist>
  order: string[]
  /** null 表示使用 content 提供的内置默认列表。 */
  activePlaylistId: string | null
  currentBvid: string | null
  currentIndex: number
  loopMode: MusicLoopMode
  /** 跨域播放器不可读取真实进度；这里只记录用户最后明确设置的起点。 */
  startAtSeconds: number
  /** 旧 V4 存档兼容字段；运行态始终规范为 true，不能作为关闭自动播放的开关。 */
  autoplay: boolean
}

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
  inventory: LegacyInventory
  collections: Record<string, CollectionEntry>
  activeActivity: LegacyActivityRun | null
  pity: PityState
  statistics: LegacyGameStatistics
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
  inventory: LegacyInventory
  collections: Record<string, CollectionEntry>
  activeActivity: ActivityRunV2 | null
  pet: PetStateV2
  tasks: TaskBoard
  gameBalance: GameBalanceV2
  statistics: LegacyGameStatistics
  random: PersistentRandomState
}

export interface GameStateV3 {
  schemaVersion: 3
  profile: {
    createdAt: number
    debug: boolean
    displayName: string
    companionDays: number
  }
  economy: {
    apples: number
  }
  inventory: LegacyInventory
  collections: Record<string, CollectionEntry>
  friends: FriendCollection
  activeActivity: ActivityRun | null
  pet: PetStateV3
  tasks: TaskBoard
  gameBalance: GameBalance
  statistics: GameStatistics
  random: PersistentRandomState
}

export interface GameStateV4 {
  schemaVersion: 4
  profile: GameStateV3['profile']
  economy: GameStateV3['economy']
  inventory: Inventory
  collections: Record<string, CollectionEntry>
  friends: FriendCollection
  activeActivity: ActivityRun | null
  pet: PetState
  tasks: TaskBoard
  gameBalance: GameBalance
  statistics: GameStatistics
  random: PersistentRandomState
  /** 玩家当前所处世界；与媒体播放器无关。 */
  world: WorldDimension
  player: PlayerState
  reality: RealityState
  musicPlayer: MusicPlayerState
}

export type GameState = GameStateV4

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
  friendId: FriendId | null
  giftItemId: LegacyItemId | null
  giftApples: number
  guaranteedByPity: boolean
}

export type GameErrorCode =
  | 'ACTIVITY_ALREADY_ACTIVE'
  | 'ACTIVITY_NOT_ACTIVE'
  | 'ACTIVITY_NOT_READY'
  | 'ACTIVITY_NOT_RUNNING'
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
  | 'COMPANION_DAY_LIMIT_REACHED'
  | 'INVALID_SUPPLY'
  | 'EMPTY_COLLECTION_POOL'
  | 'LUCKY_APPLE_NOT_USEFUL'
  | 'INVALID_CATALOG'
  | 'UNKNOWN_COLLECTION'
  | 'EFFECT_ALREADY_ACTIVE'
  | 'MAGIC_NOT_NEEDED'
  | 'DIMENSION_ALREADY_ACTIVE'
  | 'REALITY_STAY_NOT_ACTIVE'
  | 'REALITY_SETTLEMENT_PENDING'
  | 'REALITY_SETTLEMENT_NOT_FOUND'
  | 'TODO_NOT_FOUND'
  | 'TODO_LIMIT_REACHED'
  | 'POMODORO_ALREADY_RUNNING'
  | 'POMODORO_NOT_RUNNING'
  | 'PLAYLIST_NOT_FOUND'
  | 'PLAYLIST_LIMIT_REACHED'
  | 'DUPLICATE_ID'
  | 'INVALID_BVID'
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
      supplyId?: LegacyItemId
      useLuckyApple?: boolean
      /** 兼容旧 UI；新 DEBUG 面板应改用 debug/duration-set。 */
      debugDurationMs?: number
    }
  | { type: 'activity/cancel'; runId: string; now: number }
  | { type: 'activity/claim'; runId: string; now: number }
  | { type: 'magic/speed-use'; runId: string; now: number }
  | { type: 'magic/vitality-use'; now: number }
  | { type: 'item/purchase'; itemId: ItemId; quantity?: number }
  | { type: 'room/interact'; area: RoomArea; now: number }
  | { type: 'pet/move'; location: PetLocation }
  | { type: 'pet/encourage'; interest: PetInterest }
  | { type: 'task/event'; event: TaskEvent; now: number }
  | { type: 'reality/enter'; now: number }
  | { type: 'reality/leave'; now: number }
  | {
      type: 'reality/settle'
      stayId: string
      decision: RealityRewardDecision
      now: number
    }
  | { type: 'todo/create'; todoId: string; title: string; dueAt?: number | null; now: number }
  | {
      type: 'todo/update'
      todoId: string
      title?: string
      dueAt?: number | null
      now: number
    }
  | { type: 'todo/completion-set'; todoId: string; completed: boolean; now: number }
  | { type: 'todo/delete'; todoId: string; now: number }
  | { type: 'pomodoro/background-set'; postcardId: string | null }
  | { type: 'pomodoro/start'; now: number; durationMs: number; todoId?: string | null }
  | { type: 'pomodoro/cancel'; sessionId: string; now: number }
  | { type: 'clock/tick'; now: number }
  | {
      type: 'music/playlist-create'
      playlistId: string
      name: string
      bvids?: string[]
      now: number
    }
  | {
      type: 'music/playlist-update'
      playlistId: string
      name?: string
      bvids?: string[]
      now: number
    }
  | { type: 'music/playlist-delete'; playlistId: string; now: number }
  | { type: 'music/playlist-select'; playlistId: string | null }
  | { type: 'music/track-select'; bvid: string; index: number }
  | { type: 'music/seek-set'; startAtSeconds: number }
  | { type: 'music/loop-set'; loopMode: MusicLoopMode }
  | { type: 'music/autoplay-set'; autoplay: boolean }
  | { type: 'debug/apples-adjust'; delta: number }
  | { type: 'debug/item-adjust'; itemId: ItemId; delta: number }
  | { type: 'debug/collection-set'; collectionId: string; owned: boolean; now: number }
  | { type: 'debug/collect-all'; now: number }
  | { type: 'debug/clear-all'; now: number }
  | { type: 'debug/activity-complete'; now: number }
  | { type: 'debug/activity-clear' }
  | { type: 'debug/duration-set'; durationMs: number }
  | { type: 'debug/probability-set'; key: ProbabilityKey; value: number }
  | { type: 'debug/tuning-reset' }

export type GameEffect =
  | { type: 'activity-started'; activity: ActivityRun }
  | { type: 'activity-cancelled'; activity: ActivityRun; cancelledAt: number }
  | { type: 'activity-claimed'; summary: ClaimSummary }
  | {
      type: 'activity-accelerated'
      runId: string
      usedAt: number
      previousEndsAt: number
      endsAt: number
    }
  | { type: 'player-effect-activated'; effect: 'vitality'; value: VitalityEffect }
  | {
      type: 'player-effect-expired'
      effect: 'vitality'
      expiredAtCompanionDay: number
    }
  | { type: 'item-purchased'; itemId: ItemId; quantity: number; applesSpent: number }
  | { type: 'pet-moved'; location: PetLocation }
  | {
      type: 'pet-rested'
      restCount: number
      preferences: ActivityPreferences
      replayKey: number
    }
  | { type: 'pet-encouraged'; interest: PetInterest; applesSpent: number }
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
  | { type: 'reality-entered'; stay: RealityStay }
  | { type: 'reality-reward-pending'; settlement: RealitySettlement }
  | {
      type: 'reality-reward-settled'
      stayId: string
      decision: RealityRewardDecision
      settledAt: number
      fullRewardApples: number
      awardedApples: number
    }
  | { type: 'todo-created'; todo: TodoItem }
  | { type: 'todo-updated'; todo: TodoItem }
  | { type: 'todo-completion-set'; todo: TodoItem }
  | { type: 'todo-deleted'; todoId: string; deletedAt: number }
  | {
      type: 'todo-notification-due'
      notificationId: string
      todoId: string
      dueAt: number
      issuedAt: number
      notificationTitle: string
      notificationBody: string
    }
  | { type: 'pomodoro-started'; session: PomodoroSession }
  | { type: 'pomodoro-cancelled'; sessionId: string; cancelledAt: number }
  | {
      type: 'pomodoro-completed'
      notificationId: string
      session: PomodoroSession
      notificationTitle: string
      notificationBody: string
    }
  | {
      type: 'music-player-updated'
      change:
        | 'playlist-created'
        | 'playlist-updated'
        | 'playlist-deleted'
        | 'playlist-selected'
        | 'track-selected'
        | 'seek-set'
        | 'loop-set'
        | 'autoplay-set'
      playlistId?: string | null
      bvid?: string | null
    }
  | {
      type: 'debug-applied'
      action: GameAction['type']
      changedCount?: number
      collectionChangedCount?: number
      friendChangedCount?: number
    }

export type GameTransition =
  | { ok: true; state: GameState; effects: readonly GameEffect[] }
  | { ok: false; state: GameState; error: GameError; effects: readonly [] }
