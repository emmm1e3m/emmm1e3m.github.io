import {
  BASE_ACTIVITY_DURATION_MS,
  LEGACY_ACTIVITY_DURATION_MS,
  MAX_DEBUG_ACTIVITY_DURATION_MS,
} from './constants'
import type { FriendId, LegacyItemId } from './types'

export const PROBABILITY_KEYS = [
  'postcard',
  'millionShot',
  'siteFirst',
  'travelFriend',
  'musicFriend',
] as const

export type ProbabilityKey = (typeof PROBABILITY_KEYS)[number]

export interface GameProbabilities {
  postcard: number
  millionShot: number
  siteFirst: number
  travelFriend: number
  musicFriend: number
}

export interface GameBalance {
  activityDurationMs: number
  probabilities: GameProbabilities
}

export type GameBalanceV3 = GameBalance

/** 严格对应 schemaVersion 2 的旧平衡结构。 */
export interface GameBalanceV2 {
  activityDurationMs: number
  probabilities: {
    postcard: number
    millionShot: number
    siteFirst: number
    friend: number
  }
}

/** 幸运苹果按常规收藏概率增加 100% 的基础值，不写入存档平衡配置。 */
export const LUCKY_APPLE_COLLECTION_BASE_BONUS_RATE = 1

/** 苹果旅行便当按常规遇友概率增加 100% 的基础值，不写入存档平衡配置。 */
export const APPLE_LUNCHBOX_FRIEND_BASE_BONUS_RATE = 1

export const REST_COMPLETION_APPLES = 0

/** 旧活动已经固化的音乐好友赠礼；导入时只用于兼容校验，绝不重算。 */
export const LEGACY_FRIEND_GIFT_APPLES_BY_ID: Readonly<Record<FriendId, number>> = Object.freeze({
  'class-representative-bing': 2,
  'san-hao-rabbit': 3,
  'xin-hao-rabbit': 4,
  'signal-dog': 3,
  'bili-bing': 2,
})

/** 钢琴召来的已认识朋友会按身份固定赠送苹果，避免额外随机序列。 */
export const FRIEND_GIFT_APPLES_BY_ID: Readonly<Record<FriendId, number>> = Object.freeze({
  'class-representative-bing': 4,
  'san-hao-rabbit': 6,
  'xin-hao-rabbit': 8,
  'signal-dog': 6,
  'bili-bing': 4,
})

/** 旅行遇友除固定道具外，还会按身份固定赠送苹果，避免额外随机序列。 */
export const TRAVEL_FRIEND_GIFT_APPLES_BY_ID: Readonly<Record<FriendId, number>> = Object.freeze({
  'class-representative-bing': 2,
  'san-hao-rabbit': 3,
  'xin-hao-rabbit': 4,
  'signal-dog': 3,
  'bili-bing': 2,
})

export const FRIEND_GIFT_ITEM_BY_ID: Readonly<Record<FriendId, LegacyItemId>> = Object.freeze({
  'class-representative-bing': 'travel-basic',
  'san-hao-rabbit': 'travel-apple',
  'xin-hao-rabbit': 'lucky-apple',
  'signal-dog': 'signal-headphones',
  'bili-bing': 'trend-toolbox',
})

export const DEFAULT_GAME_BALANCE_V2: Readonly<GameBalanceV2> = Object.freeze({
  activityDurationMs: LEGACY_ACTIVITY_DURATION_MS,
  probabilities: Object.freeze({
    postcard: 1,
    millionShot: 0.4,
    siteFirst: 0.1,
    friend: 0.2,
  }),
})

/** schemaVersion 3 新活动使用的历史默认；V3 -> V4 时只保留 DEBUG 自定义值。 */
export const DEFAULT_GAME_BALANCE_V3: Readonly<GameBalanceV3> = Object.freeze({
  activityDurationMs: LEGACY_ACTIVITY_DURATION_MS,
  probabilities: Object.freeze({
    postcard: 0.65,
    millionShot: 0.4,
    siteFirst: 0.1,
    travelFriend: 0.2,
    musicFriend: 0.2,
  }),
})

export const DEFAULT_GAME_BALANCE: Readonly<GameBalance> = Object.freeze({
  activityDurationMs: BASE_ACTIVITY_DURATION_MS,
  probabilities: Object.freeze({
    postcard: 0.65,
    millionShot: 0.3,
    siteFirst: 0.15,
    travelFriend: 0.1,
    /** 每位已经认识的朋友各提供 15% 来访概率，实际概率在奖励规划时统一封顶。 */
    musicFriend: 0.15,
  }),
})

/** @deprecated 请直接读取 DEFAULT_GAME_BALANCE.probabilities。 */
export const COLLECTION_DROP_CHANCES = {
  stream: DEFAULT_GAME_BALANCE.probabilities.millionShot,
  trend: DEFAULT_GAME_BALANCE.probabilities.siteFirst,
} as const

/** @deprecated 请直接读取 DEFAULT_GAME_BALANCE.probabilities.travelFriend。 */
export const FRIEND_EVENT_CHANCE = DEFAULT_GAME_BALANCE.probabilities.travelFriend

export function createDefaultGameBalance(): GameBalance {
  return {
    activityDurationMs: DEFAULT_GAME_BALANCE.activityDurationMs,
    probabilities: { ...DEFAULT_GAME_BALANCE.probabilities },
  }
}

export function createDefaultGameBalanceV2(): GameBalanceV2 {
  return {
    activityDurationMs: DEFAULT_GAME_BALANCE_V2.activityDurationMs,
    probabilities: { ...DEFAULT_GAME_BALANCE_V2.probabilities },
  }
}

export function createDefaultGameBalanceV3(): GameBalanceV3 {
  return {
    activityDurationMs: DEFAULT_GAME_BALANCE_V3.activityDurationMs,
    probabilities: { ...DEFAULT_GAME_BALANCE_V3.probabilities },
  }
}

export function isValidProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

/**
 * 在常规概率上增加基础值的一定比例；多个同类效果只采用最高比例，避免复合叠加。
 * 例如基础概率为 p、100% 加成生效时，结果始终为 min(1, p + p)。
 */
export function addNonStackingBaseProbabilityBonus(
  base: number,
  ...bonusRates: readonly number[]
): number {
  if (!isValidProbability(base) || bonusRates.some((rate) => !Number.isFinite(rate) || rate < 0)) {
    throw new RangeError('概率与基础概率加成比例必须是有效的非负数')
  }
  const highestRate = bonusRates.length > 0 ? Math.max(...bonusRates) : 0
  return Math.min(1, base + base * highestRate)
}

/** 为单次事件按倍数放大概率，并统一封顶为 1。 */
export function multiplyProbability(base: number, multiplier: number): number {
  if (!isValidProbability(base) || !Number.isFinite(multiplier) || multiplier < 0) {
    throw new RangeError('概率与概率倍数必须是有效的非负数')
  }
  return Math.min(1, base * multiplier)
}

export function isValidActivityDuration(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_DEBUG_ACTIVITY_DURATION_MS
}
