import type { FRIEND_EVENT_IDS, ITEM_IDS } from './constants'

export type ActivityKind = 'travel' | 'stream' | 'trend'

export type ActivityPhase = 'idle' | 'running' | 'ready'

export type ItemId = (typeof ITEM_IDS)[number]

export type FriendEventId = (typeof FRIEND_EVENT_IDS)[number]

export type CollectibleCategory = 'postcard' | 'million-shot' | 'site-first'

export type CollectionCatalog = Readonly<Record<CollectibleCategory, readonly string[]>>

export interface CollectionEntry {
  id: string
  firstObtainedAt: number
  duplicateCount: number
}

export type Inventory = Record<ItemId, number>

export interface PityState {
  stream: number
  trend: number
}

export interface PlannedCollectionReward {
  id: string
  category: CollectibleCategory
}

export interface RewardPlan {
  baseApples: number
  modifierApples: number
  collection: PlannedCollectionReward | null
  friendEventId: FriendEventId | null
  guaranteedByPity: boolean
  pityAfterClaim: number | null
}

export interface ActivityRun {
  runId: string
  kind: ActivityKind
  startedAt: number
  endsAt: number
  rewardSeed: string
  rewardPlan: RewardPlan
  supplyId: ItemId
  usedLuckyApple: boolean
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

export interface PersistentRandomState {
  seed: string
  sequence: number
}

export interface GameState {
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
  activeActivity: ActivityRun | null
  pity: PityState
  statistics: GameStatistics
  random: PersistentRandomState
}

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
  | 'RUN_ID_MISMATCH'
  | 'INVALID_TIME'
  | 'INVALID_DURATION'
  | 'INVALID_AMOUNT'
  | 'INSUFFICIENT_APPLES'
  | 'MISSING_REQUIRED_ITEM'
  | 'INVENTORY_LIMIT_REACHED'
  | 'APPLE_LIMIT_REACHED'
  | 'INVALID_SUPPLY'
  | 'EMPTY_COLLECTION_POOL'
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
      debugDurationMs?: number
    }
  | { type: 'activity/claim'; runId: string; now: number }
  | { type: 'item/purchase'; itemId: ItemId; quantity?: number }
  | { type: 'debug/apples-adjust'; delta: number }
  | { type: 'debug/item-adjust'; itemId: ItemId; delta: number }
  | { type: 'debug/collection-set'; collectionId: string; owned: boolean; now: number }
  | { type: 'debug/collect-all'; now: number }
  | { type: 'debug/activity-complete'; now: number }
  | { type: 'debug/activity-clear' }

export type GameEffect =
  | { type: 'activity-started'; activity: ActivityRun }
  | { type: 'activity-claimed'; summary: ClaimSummary }
  | { type: 'item-purchased'; itemId: ItemId; quantity: number; applesSpent: number }
  | { type: 'debug-applied'; action: GameAction['type']; changedCount?: number }

export type GameTransition =
  | { ok: true; state: GameState; effects: readonly GameEffect[] }
  | { ok: false; state: GameState; error: GameError; effects: readonly [] }
