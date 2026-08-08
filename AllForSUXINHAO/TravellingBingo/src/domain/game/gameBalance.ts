import { BASE_ACTIVITY_DURATION_MS, MAX_DEBUG_ACTIVITY_DURATION_MS } from './constants'
import type { FriendId, ItemId } from './types'

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

/** 幸运苹果只影响当次收藏掉落，不写入存档平衡配置。 */
export const LUCKY_APPLE_COLLECTION_DROP_BONUS = 0.2

/** 苹果旅行便当只影响当次旅行遇见朋友，不写入存档平衡配置。 */
export const APPLE_LUNCHBOX_FRIEND_BONUS = 0.15

export const REST_COMPLETION_APPLES = 1

/** 钢琴召来的已认识朋友会按身份固定赠送苹果，避免额外随机序列。 */
export const FRIEND_GIFT_APPLES_BY_ID: Readonly<Record<FriendId, number>> = Object.freeze({
  'class-representative-bing': 2,
  'san-hao-rabbit': 3,
  'xin-hao-rabbit': 4,
  'signal-dog': 3,
  'bili-bing': 2,
})

/** 旅行遇友只赠送道具，不形成“花苹果又赚苹果”的活动闭环。 */
export const FRIEND_GIFT_ITEM_BY_ID: Readonly<Record<FriendId, ItemId>> = Object.freeze({
  'class-representative-bing': 'travel-basic',
  'san-hao-rabbit': 'travel-apple',
  'xin-hao-rabbit': 'lucky-apple',
  'signal-dog': 'signal-headphones',
  'bili-bing': 'trend-toolbox',
})

export const DEFAULT_GAME_BALANCE_V2: Readonly<GameBalanceV2> = Object.freeze({
  activityDurationMs: BASE_ACTIVITY_DURATION_MS,
  probabilities: Object.freeze({
    postcard: 1,
    millionShot: 0.4,
    siteFirst: 0.1,
    friend: 0.2,
  }),
})

export const DEFAULT_GAME_BALANCE: Readonly<GameBalance> = Object.freeze({
  activityDurationMs: BASE_ACTIVITY_DURATION_MS,
  probabilities: Object.freeze({
    postcard: 0.65,
    millionShot: 0.4,
    siteFirst: 0.1,
    travelFriend: 0.2,
    musicFriend: 0.2,
  }),
})

/** @deprecated 请直接读取 DEFAULT_GAME_BALANCE.probabilities。 */
export const COLLECTION_DROP_CHANCES = {
  stream: DEFAULT_GAME_BALANCE.probabilities.millionShot,
  trend: DEFAULT_GAME_BALANCE.probabilities.siteFirst,
} as const

/** @deprecated 请直接读取 DEFAULT_GAME_BALANCE.probabilities.friend。 */
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

export function isValidProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

/** 为单次事件叠加非负概率加成，并统一封顶为 1。 */
export function addProbabilityBonus(base: number, bonus: number): number {
  if (!isValidProbability(base) || !Number.isFinite(bonus) || bonus < 0) {
    throw new RangeError('概率与概率加成必须是有效的非负数')
  }
  return Math.min(1, base + bonus)
}

export function isValidActivityDuration(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_DEBUG_ACTIVITY_DURATION_MS
}
