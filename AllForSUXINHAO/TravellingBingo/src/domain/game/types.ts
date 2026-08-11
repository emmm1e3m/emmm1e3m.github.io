import type {
  FRIEND_EVENT_IDS,
  ITEM_IDS,
  LEGACY_ITEM_IDS,
  PIANO_NOTE_IDS,
  STREAM_FAVORITE_IDS,
} from './constants'
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

export type WardrobeTargetId = 'bingo' | FriendId

export type WardrobeAssetId =
  | 'green-sailor-top'
  | 'red-ruffle-dress'
  | 'monochrome-maid-dress'
  | 'black-stage-suit'
  | 'black-tie-uniform'
  | 'blue-street-jacket'
  | 'tan-bear-suit'
  | 'cream-apple-cape'
  | 'round-glasses'
  | 'square-glasses'
  | 'maid-headband'
  | 'black-beret'
  | 'cat-ears'
  | 'microphone'
  | 'signal-sign'
  | 'apple-cake'
  | 'paw-glove'
  | 'check-sign'
  | 'cross-sign'
  | 'dim-sum-basket'
  | 'apple-cuffs'
  | 'apple-badge'
  | 'black-fedora'
  | 'red-bead-trim'

export type WardrobeAssetCategory = 'outfit' | 'headwear' | 'face' | 'accessory' | 'prop'

/**
 * 奇迹饼狗只在存档中保存目录 ID。名称、图片与基准尺寸由当前版本的服装目录提供，
 * 不能把图片 URL、data URL 或完整合成图写进存档。
 */
export interface WardrobeCatalogItem {
  id: WardrobeAssetId
  name: string
  category: WardrobeAssetCategory
  priceApples: number
  starter: boolean
  defaultTransform: WardrobeElementTransform
}

/** 已发布 V11 的等比服饰变换；仅供严格导入与 V11 -> V12 迁移。 */
export interface WardrobeTransformV11 {
  x: number
  y: number
  scale: number
  rotation: number
  z: number
}

/**
 * 所有可选画布组件共用的变换。两轴都以所属画布宽度为像素基准；
 * scaleX === scaleY 时保持素材天然宽高比。
 */
export interface WardrobeTransform {
  /** 所属画布中的归一化中心坐标，范围为 0–1。 */
  x: number
  y: number
  scaleX: number
  scaleY: number
  /** 规范化到 -180–180 度。 */
  rotation: number
  /** 数值越大越靠前；同一组合中的 z 必须唯一。 */
  z: number
}

export type WardrobeElementTransform = WardrobeTransform

export interface WardrobeElementV11 extends WardrobeTransformV11 {
  placementId: string
  assetId: WardrobeAssetId
}

export interface WardrobeElement extends WardrobeElementTransform {
  /** 同一形象内稳定且唯一，允许一件已购元素被放置多次。 */
  placementId: string
  assetId: WardrobeAssetId
}

export interface SavedWardrobeLookV11 {
  lookId: string
  targetId: WardrobeTargetId
  name: string
  elements: WardrobeElementV11[]
  createdAt: number
  updatedAt: number
}

export interface SavedWardrobeLook {
  lookId: string
  targetId: WardrobeTargetId
  name: string
  elements: WardrobeElement[]
  createdAt: number
  updatedAt: number
}

export interface WardrobePhotoParticipantV11 extends WardrobeTransformV11 {
  targetId: WardrobeTargetId
  sourceLookId: string | null
  elements: WardrobeElementV11[]
}

export interface WardrobePhotoParticipant extends WardrobeTransform {
  targetId: WardrobeTargetId
  /** 仅记录创建合拍时选择的来源；造型删除后仍保留快照。 */
  sourceLookId: string | null
  /** 合拍创建时冻结的轻量搭配快照；以后改造型不会改写旧照片。 */
  elements: WardrobeElement[]
}

export interface WardrobePhotoV11 {
  photoId: string
  /** 内容目录变化时可以协调为 null；新合拍仍必须选择已拥有明信片。 */
  postcardId: string | null
  participants: WardrobePhotoParticipantV11[]
  createdAt: number
}

/** 可独立放置在照片画布上的服装或配饰层。 */
export interface WardrobePhotoDecoration extends WardrobeElementTransform {
  placementId: string
  assetId: WardrobeAssetId
}

export interface WardrobePhoto extends Omit<WardrobePhotoV11, 'participants'> {
  participants: WardrobePhotoParticipant[]
  decorations: WardrobePhotoDecoration[]
}

export type WardrobePhotoLayer =
  | { kind: 'participant'; value: WardrobePhotoParticipant }
  | { kind: 'decoration'; value: WardrobePhotoDecoration }

export interface WardrobeStateV11 {
  /** 海星体锚点、归一化坐标与缩放语义的版本。 */
  layoutVersion: 1
  shop: {
    companionDay: number
    /** 当天刷新时冻结的商品，不因购买而补位；全收集后可以为空。 */
    assetIds: WardrobeAssetId[]
  }
  /** 顺序即获得顺序；ID 唯一。 */
  ownedAssetIds: WardrobeAssetId[]
  nextLookSequence: number
  looks: Record<string, SavedWardrobeLookV11>
  nextPhotoSequence: number
  photos: Record<string, WardrobePhotoV11>
}

export interface WardrobeState extends Omit<
  WardrobeStateV11,
  'layoutVersion' | 'looks' | 'photos'
> {
  layoutVersion: 2
  looks: Record<string, SavedWardrobeLook>
  photos: Record<string, WardrobePhoto>
}

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

export interface TaskBoardV4 {
  active: [TaskInstance, TaskInstance, TaskInstance]
  completedCount: number
  recentTemplateIds: TaskId[]
  oneOffCompleted: TaskId[]
}

export interface TaskBoard extends TaskBoardV4 {
  /** 三项全部完成的时刻；未完成的任务板必须为 null。 */
  completedAt: number | null
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

/** 已发布 V4-V8 的现实停留形状；仅供严格导入与迁移。 */
export interface RealityStayV8 {
  stayId: string
  enteredAt: number
}

/**
 * 当前现实停留。activeDurationMs 只累计浏览器页面实际持有租约的时间；
 * leaseStartedAt 为 null 时计时暂停，重新进入游戏后从新的租约起点继续。
 */
export interface RealityStay extends RealityStayV8 {
  activeDurationMs: number
  leaseStartedAt: number | null
}

/** 已发布 V4-V8 的现实结算形状；仅供严格导入与迁移。 */
export interface RealitySettlementV8 {
  stayId: string
  enteredAt: number
  leftAt: number
  fullRewardApples: number
}

export interface RealitySettlement extends RealitySettlementV8 {
  /** 本段停留中由页面租约证明的实际累计时长。 */
  activeDurationMs: number
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

/** 已发布 V4 苹果钟快照；仅供严格导入与 V4 -> V5 迁移。 */
export type PomodoroStatusV4 = 'running' | 'completed'

export interface PomodoroSessionV4 {
  sessionId: string
  status: PomodoroStatusV4
  startedAt: number
  endsAt: number
  durationMs: number
  completedAt: number | null
  notificationIssuedAt: number | null
  todoId: string | null
  /** 开始时锁定的明信片背景；只保存收藏 ID，不复制展示元数据。 */
  postcardId: string | null
}

export interface PomodoroStateV4 {
  nextSessionSequence: number
  selectedPostcardId: string | null
  session: PomodoroSessionV4 | null
}

export interface RealityStateV4 {
  nextStaySequence: number
  activeStay: RealityStayV8 | null
  pendingSettlement: RealitySettlementV8 | null
  todos: Record<string, TodoItem>
  pomodoro: PomodoroStateV4
}

export type PomodoroStatus = 'focus' | 'break' | 'completed'

export interface PomodoroSession {
  sessionId: string
  status: PomodoroStatus
  startedAt: number
  focusEndsAt: number
  cycleEndsAt: number
  focusDurationMs: number
  breakDurationMs: number
  completedAt: number | null
  /** 专注结束提醒的签发时间；跨过整轮时只作幂等标记，不弹过期提醒。 */
  focusNotificationIssuedAt: number | null
  /** 整轮结束提醒的签发时间。 */
  completionNotificationIssuedAt: number | null
  todoId: string | null
  /** 开始时锁定的明信片背景；只保存收藏 ID，不复制展示元数据。 */
  postcardId: string | null
}

export interface PomodoroState {
  nextSessionSequence: number
  selectedPostcardId: string | null
  session: PomodoroSession | null
}

/** V12 起苹果钟背景既可以引用明信片，也可以引用一张已保存的合拍。 */
export type PomodoroBackgroundRef =
  { kind: 'postcard'; id: string } | { kind: 'wardrobe-photo'; id: string }

export interface PomodoroSessionV12 extends Omit<PomodoroSession, 'postcardId'> {
  /** 开始时锁定的背景引用；后续修改默认背景不会改变本轮。 */
  background: PomodoroBackgroundRef | null
}

export interface PomodoroStateV12 {
  nextSessionSequence: number
  selectedBackground: PomodoroBackgroundRef | null
  session: PomodoroSessionV12 | null
}

export interface RealityState {
  nextStaySequence: number
  activeStay: RealityStayV8 | null
  pendingSettlement: RealitySettlementV8 | null
  todos: Record<string, TodoItem>
  pomodoro: PomodoroState
}

/** 冻结 V6 刷播历史中的单轮记录。 */
export interface StreamRoundRecord {
  round: number
  /** 该轮实际完成时间。 */
  completedAt: number
}

/** 冻结 V6 刷播历史；仅供旧存档严格校验与迁移。 */
export interface StreamHistoryV6 {
  completedRounds: number
  /** 最近十轮，索引 0 始终是最新一轮。 */
  recentRounds: StreamRoundRecord[]
}

export interface RealityStateV6 extends RealityState {
  streamHistory: StreamHistoryV6
}

export type StreamSessionOutcome = 'completed' | 'stopped'

/** 一次已经结束的刷播任务；一项可以包含多轮。 */
export interface StreamSessionRecord {
  sessionId: string
  startedAt: number
  endedAt: number
  roundsCompleted: number
  outcome: StreamSessionOutcome
}

export interface StreamHistory {
  /** 所有刷播任务累计完成的轮次。 */
  completedRounds: number
  /** 最近十次已结束的刷播任务，索引 0 始终是最新一次。 */
  recentSessions: StreamSessionRecord[]
}

export interface RealityStateV7 extends RealityState {
  streamHistory: StreamHistory
}

/** V8/V9 已发布的刷播设置；只用于冻结存档校验与迁移。 */
export interface StreamSettingsV8 {
  /** 额外插入轮换序列末尾的单个自测视频。 */
  selfTestBvid: string | null
  /** 返回游戏维度后仍运行实验性游客刷播。 */
  dimensionPenetrationEnabled: boolean
}

export interface RealityStateV8 extends RealityStateV7 {
  streamSettings: StreamSettingsV8
}

export interface RealityStateV9 extends Omit<RealityStateV8, 'activeStay' | 'pendingSettlement'> {
  activeStay: RealityStay | null
  pendingSettlement: RealitySettlement | null
}

export type StreamFavoriteId = (typeof STREAM_FAVORITE_IDS)[number]

export interface StreamSettings {
  /** 额外插入轮换序列末尾的单个自测视频。 */
  selfTestBvid: string | null
  /** 当前刷播使用的本地收藏夹快照。 */
  favoriteId: StreamFavoriteId
}

export interface RealityStateV10 extends Omit<RealityStateV9, 'streamSettings'> {
  streamSettings: StreamSettings
}

export interface StreamDailyRewardState {
  /** 已结算奖励的最大本地现实日期；只接受严格更晚的下一次领取。 */
  lastRewardDateKey: string | null
}

export interface RealityStateV12 extends Omit<RealityStateV10, 'pomodoro'> {
  pomodoro: PomodoroStateV12
  streamDailyReward: StreamDailyRewardState
}

export type MusicLoopMode = 'list' | 'single' | 'shuffle'

/** 冻结 V4/旧 V5 存档校验专用，不属于当前播放器业务状态。 */
export interface MusicPlaylist {
  id: string
  name: string
  bvids: string[]
  createdAt: number
  updatedAt: number
}

/** 仅保存唯一内置曲库的当前位置与循环设置；曲目元数据始终来自 content。 */
export interface MusicPlayerState {
  currentBvid: string | null
  currentIndex: number
  loopMode: MusicLoopMode
}

/** 冻结的 V4 播放器形状；仅供旧存档严格校验与迁移。 */
export interface MusicPlayerStateV4 {
  playlists: Record<string, MusicPlaylist>
  order: string[]
  activePlaylistId: string | null
  currentBvid: string | null
  currentIndex: number
  loopMode: MusicLoopMode
  startAtSeconds: number
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
  tasks: TaskBoardV4
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
  tasks: TaskBoardV4
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
  tasks: TaskBoardV4
  gameBalance: GameBalance
  statistics: GameStatistics
  random: PersistentRandomState
  /** 玩家当前所处世界；与媒体播放器无关。 */
  world: WorldDimension
  player: PlayerState
  reality: RealityStateV4
  musicPlayer: MusicPlayerStateV4
}

export interface GameStateV5 {
  schemaVersion: 5
  profile: GameStateV4['profile']
  economy: GameStateV4['economy']
  inventory: Inventory
  collections: Record<string, CollectionEntry>
  friends: FriendCollection
  activeActivity: ActivityRun | null
  pet: PetState
  tasks: TaskBoard
  gameBalance: GameBalance
  statistics: GameStatistics
  random: PersistentRandomState
  world: WorldDimension
  player: PlayerState
  reality: RealityState
  musicPlayer: MusicPlayerState
}

/** 同为 schemaVersion 5 的旧缓存播放器形状；只用于原值校验后收敛到当前状态。 */
export interface GameStateV5LegacyMusic extends Omit<GameStateV5, 'musicPlayer'> {
  musicPlayer: MusicPlayerState &
    Pick<MusicPlayerStateV4, 'playlists' | 'order' | 'activePlaylistId'>
}

export interface GameStateV6 extends Omit<GameStateV5, 'schemaVersion' | 'reality'> {
  schemaVersion: 6
  reality: RealityStateV6
}

export interface GameStateV7 extends Omit<GameStateV6, 'schemaVersion' | 'reality'> {
  schemaVersion: 7
  reality: RealityStateV7
}

export interface GameStateV8 extends Omit<GameStateV7, 'schemaVersion' | 'reality'> {
  schemaVersion: 8
  reality: RealityStateV8
}

export interface GameStateV9 extends Omit<GameStateV8, 'schemaVersion' | 'reality'> {
  schemaVersion: 9
  reality: RealityStateV9
}

export interface GameStateV10 extends Omit<GameStateV9, 'schemaVersion' | 'reality'> {
  schemaVersion: 10
  reality: RealityStateV10
}

export interface GameStateV11 extends Omit<GameStateV10, 'schemaVersion'> {
  schemaVersion: 11
  wardrobe: WardrobeStateV11
}

export interface GameStateV12 extends Omit<GameStateV11, 'schemaVersion' | 'reality' | 'wardrobe'> {
  schemaVersion: 12
  reality: RealityStateV12
  wardrobe: WardrobeState
}

export type GameState = GameStateV12

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
  | 'DUPLICATE_ID'
  | 'INVALID_BVID'
  | 'INVALID_STREAM_FAVORITE'
  | 'INVALID_DATE_KEY'
  | 'WARDROBE_ITEM_NOT_FOR_SALE'
  | 'WARDROBE_ITEM_ALREADY_OWNED'
  | 'WARDROBE_TARGET_LOCKED'
  | 'WARDROBE_ASSET_NOT_OWNED'
  | 'WARDROBE_LOOK_INVALID'
  | 'WARDROBE_LOOK_NAME_INVALID'
  | 'WARDROBE_LOOK_LIMIT_REACHED'
  | 'WARDROBE_LOOK_ID_COLLISION'
  | 'WARDROBE_LOOK_NOT_FOUND'
  | 'WARDROBE_LOOK_TARGET_MISMATCH'
  | 'WARDROBE_PHOTO_LIMIT_REACHED'
  | 'WARDROBE_PHOTO_ID_COLLISION'
  | 'WARDROBE_PHOTO_NOT_FOUND'
  | 'WARDROBE_POSTCARD_NOT_OWNED'
  | 'WARDROBE_PARTICIPANTS_INVALID'
  | 'WARDROBE_DECORATIONS_INVALID'
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
  | { type: 'reality/session-resume'; stayId: string; now: number }
  | { type: 'reality/session-heartbeat'; stayId: string; now: number }
  | { type: 'reality/session-suspend'; stayId: string; now: number }
  | { type: 'reality/stream-self-test-set'; bvid: string | null }
  | { type: 'reality/stream-favorite-set'; favoriteId: StreamFavoriteId }
  | { type: 'stream/daily-reward-claim'; dateKey: string }
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
  | { type: 'pomodoro/background-set'; background: PomodoroBackgroundRef | null }
  | { type: 'pomodoro/start'; now: number; durationMs: number; todoId?: string | null }
  | { type: 'pomodoro/cancel'; sessionId: string; now: number }
  | { type: 'clock/tick'; now: number }
  | { type: 'music/track-select'; bvid: string; index: number }
  | { type: 'music/loop-set'; loopMode: MusicLoopMode }
  | { type: 'wardrobe/item-purchase'; assetId: string }
  | {
      type: 'wardrobe/look-create'
      targetId: WardrobeTargetId
      name: string
      elements: WardrobeElement[]
      now: number
    }
  | {
      type: 'wardrobe/look-update'
      lookId: string
      name: string
      elements: WardrobeElement[]
      now: number
    }
  | { type: 'wardrobe/look-delete'; lookId: string }
  | {
      type: 'wardrobe/photo-create'
      postcardId: string
      participants: Array<WardrobeTransform & { targetId: WardrobeTargetId; lookId: string | null }>
      decorations: WardrobePhotoDecoration[]
      now: number
    }
  | { type: 'wardrobe/photo-delete'; photoId: string }
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
  | { type: 'pomodoro-started'; session: PomodoroSessionV12 }
  | { type: 'pomodoro-cancelled'; sessionId: string; cancelledAt: number }
  | {
      type: 'pomodoro-break-started'
      notificationId: string
      session: PomodoroSessionV12
      notificationTitle: string
      notificationBody: string
    }
  | {
      type: 'pomodoro-completed'
      notificationId: string
      session: PomodoroSessionV12
      notificationTitle: string
      notificationBody: string
    }
  | {
      type: 'music-player-updated'
      change: 'track-selected' | 'loop-set'
      bvid?: string | null
    }
  | { type: 'wardrobe-item-purchased'; assetId: string; applesSpent: number }
  | { type: 'wardrobe-look-created'; look: SavedWardrobeLook }
  | { type: 'wardrobe-look-updated'; look: SavedWardrobeLook }
  | { type: 'wardrobe-look-deleted'; lookId: string; targetId: WardrobeTargetId }
  | { type: 'wardrobe-photo-created'; photo: WardrobePhoto }
  | { type: 'wardrobe-photo-deleted'; photoId: string }
  | {
      type: 'stream-daily-reward-claimed'
      dateKey: string
      applesAwarded: number
    }
  | {
      type: 'debug-applied'
      action: GameAction['type']
      changedCount?: number
      collectionChangedCount?: number
      friendChangedCount?: number
      wardrobeChangedCount?: number
    }

export type GameTransition =
  | { ok: true; state: GameState; effects: readonly GameEffect[] }
  | { ok: false; state: GameState; error: GameError; effects: readonly [] }
