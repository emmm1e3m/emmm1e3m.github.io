export const BASE_ACTIVITY_DURATION_MS = 112_000
export const BASE_ACTIVITY_DURATION_MINUTES = BASE_ACTIVITY_DURATION_MS / 60_000

export const INITIAL_APPLES = 18

export const ITEM_IDS = [
  'travel-basic',
  'travel-apple',
  'signal-headphones',
  'trend-toolbox',
  'lucky-apple',
] as const

export const ITEM_PRICES = {
  'travel-basic': 3,
  'travel-apple': 5,
  'signal-headphones': 4,
  'trend-toolbox': 7,
  'lucky-apple': 6,
} as const

export const INITIAL_INVENTORY = {
  'travel-basic': 1,
  'travel-apple': 0,
  'signal-headphones': 0,
  'trend-toolbox': 0,
  'lucky-apple': 0,
} as const

/** 活动只带来收藏或朋友事件，苹果收入统一由任务板发放。 */
export const ACTIVITY_APPLE_REWARDS = {
  travel: { min: 0, max: 0 },
  stream: { min: 0, max: 0 },
  trend: { min: 0, max: 0 },
} as const

/** @deprecated v2 不再用重复收藏换苹果，仅为旧调用方保留零值。 */
export const DUPLICATE_APPLE_COMPENSATION = {
  postcard: 0,
  'million-shot': 0,
  'site-first': 0,
} as const

/** @deprecated v2 已取消保底。 */
export const PITY_THRESHOLDS = {
  stream: Number.POSITIVE_INFINITY,
  trend: Number.POSITIVE_INFINITY,
} as const

export const FRIEND_IDS = [
  'class-representative-bing',
  'san-hao-rabbit',
  'xin-hao-rabbit',
  'signal-dog',
  'bili-bing',
] as const

/** @deprecated V3 统一称为 FRIEND_IDS；保留旧名供 V1/V2 schema 使用。 */
export const FRIEND_EVENT_IDS = FRIEND_IDS

export const MAX_APPLES = 9_999_999
export const MAX_COMPANION_DAYS = 9_999_999
export const MAX_ITEM_STACK = 9_999
export const MAX_DEBUG_ACTIVITY_DURATION_MS = 30 * 24 * 60 * 60 * 1_000
export const PET_ENCOURAGEMENT_APPLE_COST = 2
