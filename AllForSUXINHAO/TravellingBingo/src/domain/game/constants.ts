/** V2/V3 已发布存档创建未来活动时使用的历史默认值。 */
export const LEGACY_ACTIVITY_DURATION_MS = 112_000

/** V4 起的默认读条时长。进行中活动仍以自身 startedAt/endsAt 为准。 */
export const BASE_ACTIVITY_DURATION_MS = 72_000
export const BASE_ACTIVITY_DURATION_MINUTES = BASE_ACTIVITY_DURATION_MS / 60_000

export const INITIAL_APPLES = 18

export const LEGACY_ITEM_IDS = [
  'travel-basic',
  'travel-apple',
  'signal-headphones',
  'trend-toolbox',
  'lucky-apple',
] as const

export const ITEM_IDS = [
  ...LEGACY_ITEM_IDS,
  'bottled-speed-magic',
  'bottled-vitality-magic',
] as const

export const ITEM_PRICES = {
  'travel-basic': 3,
  'travel-apple': 5,
  'signal-headphones': 4,
  'trend-toolbox': 7,
  'lucky-apple': 6,
  'bottled-speed-magic': 8,
  'bottled-vitality-magic': 12,
} as const

export const INITIAL_INVENTORY = {
  'travel-basic': 1,
  'travel-apple': 0,
  'signal-headphones': 0,
  'trend-toolbox': 0,
  'lucky-apple': 0,
  'bottled-speed-magic': 0,
  'bottled-vitality-magic': 0,
} as const

/** 三排琴键固定为 C4–B6；中排 C 为 C5。 */
export const PIANO_NOTE_IDS = [
  'C4',
  'C#4',
  'D4',
  'D#4',
  'E4',
  'F4',
  'F#4',
  'G4',
  'G#4',
  'A4',
  'A#4',
  'B4',
  'C5',
  'C#5',
  'D5',
  'D#5',
  'E5',
  'F5',
  'F#5',
  'G5',
  'G#5',
  'A5',
  'A#5',
  'B5',
  'C6',
  'C#6',
  'D6',
  'D#6',
  'E6',
  'F6',
  'F#6',
  'G6',
  'G#6',
  'A6',
  'A#6',
  'B6',
] as const

/** 三类收藏活动不直接奖励苹果；睡觉与音乐好友奖励由各自计划单独定义。 */
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

/** V1 已开始活动的历史重复收藏补偿；只由带 legacySource 的迁移活动结算。 */
export const LEGACY_V1_DUPLICATE_APPLE_COMPENSATION = {
  postcard: 2,
  'million-shot': 5,
  'site-first': 12,
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
export const VITALITY_MAGIC_COMPANION_DAYS = 7
export const REALITY_REWARD_INTERVAL_MS = 10 * 60 * 1_000
export const DEFAULT_POMODORO_DURATION_MS = 25 * 60 * 1_000
export const MIN_POMODORO_DURATION_MS = 1_000
export const MAX_POMODORO_DURATION_MS = 24 * 60 * 60 * 1_000
export const MAX_TODOS = 200
export const MAX_TODO_ID_LENGTH = 64
export const MAX_TODO_TITLE_LENGTH = 120
export const MAX_PLAYLISTS = 20
export const MAX_PLAYLIST_ID_LENGTH = 64
export const MAX_PLAYLIST_NAME_LENGTH = 60
export const MAX_PLAYLIST_TRACKS = 100
export const BILIBILI_BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/
