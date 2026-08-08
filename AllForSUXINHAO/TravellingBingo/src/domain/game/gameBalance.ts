import { BASE_ACTIVITY_DURATION_MS, MAX_DEBUG_ACTIVITY_DURATION_MS } from './constants'

export const PROBABILITY_KEYS = ['postcard', 'millionShot', 'siteFirst', 'friend'] as const

export type ProbabilityKey = (typeof PROBABILITY_KEYS)[number]

export interface GameProbabilities {
  postcard: number
  millionShot: number
  siteFirst: number
  friend: number
}

export interface GameBalance {
  activityDurationMs: number
  probabilities: GameProbabilities
}

/** 幸运苹果只影响当次收藏掉落，不写入存档平衡配置。 */
export const LUCKY_APPLE_COLLECTION_DROP_BONUS = 0.2

/** 苹果旅行便当只影响当次旅行遇见朋友，不写入存档平衡配置。 */
export const APPLE_LUNCHBOX_FRIEND_BONUS = 0.15

export const DEFAULT_GAME_BALANCE: Readonly<GameBalance> = Object.freeze({
  activityDurationMs: BASE_ACTIVITY_DURATION_MS,
  probabilities: Object.freeze({
    postcard: 1,
    millionShot: 0.4,
    siteFirst: 0.1,
    friend: 0.2,
  }),
})

/** @deprecated 请直接读取 DEFAULT_GAME_BALANCE.probabilities。 */
export const COLLECTION_DROP_CHANCES = {
  stream: DEFAULT_GAME_BALANCE.probabilities.millionShot,
  trend: DEFAULT_GAME_BALANCE.probabilities.siteFirst,
} as const

/** @deprecated 请直接读取 DEFAULT_GAME_BALANCE.probabilities.friend。 */
export const FRIEND_EVENT_CHANCE = DEFAULT_GAME_BALANCE.probabilities.friend

export function createDefaultGameBalance(): GameBalance {
  return {
    activityDurationMs: DEFAULT_GAME_BALANCE.activityDurationMs,
    probabilities: { ...DEFAULT_GAME_BALANCE.probabilities },
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
