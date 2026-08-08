export const BASE_ACTIVITY_DURATION_MINUTES = 72
export const BASE_ACTIVITY_DURATION_MS = BASE_ACTIVITY_DURATION_MINUTES * 60 * 1_000

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
  'travel-apple': 6,
  'signal-headphones': 4,
  'trend-toolbox': 7,
  'lucky-apple': 10,
} as const

export const INITIAL_INVENTORY = {
  'travel-basic': 1,
  'travel-apple': 0,
  'signal-headphones': 0,
  'trend-toolbox': 0,
  'lucky-apple': 0,
} as const

export const ACTIVITY_APPLE_REWARDS = {
  travel: { min: 4, max: 8 },
  stream: { min: 1, max: 3 },
  trend: { min: 2, max: 4 },
} as const

export const APPLE_LUNCHBOX_BONUS = { min: 2, max: 4 } as const

export const COLLECTION_DROP_CHANCES = {
  stream: 0.4,
  trend: 0.125,
} as const

export const PITY_THRESHOLDS = {
  stream: 3,
  trend: 8,
} as const

export const DUPLICATE_APPLE_COMPENSATION = {
  postcard: 2,
  'million-shot': 5,
  'site-first': 12,
} as const

export const FRIEND_EVENT_CHANCE = 0.2

export const FRIEND_EVENT_IDS = [
  'class-representative-bing',
  'san-hao-rabbit',
  'xin-hao-rabbit',
  'signal-dog',
  'bili-bing',
] as const

export const NEW_COLLECTION_WEIGHT = 8
export const LUCKY_NEW_COLLECTION_WEIGHT = 16
export const DUPLICATE_COLLECTION_WEIGHT = 1

export const MAX_APPLES = 9_999_999
export const MAX_ITEM_STACK = 9_999
export const MAX_DEBUG_ACTIVITY_DURATION_MS = 30 * 24 * 60 * 60 * 1_000
