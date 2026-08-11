/** V2/V3 已发布存档创建未来活动时使用的历史默认值。 */
export const LEGACY_ACTIVITY_DURATION_MS = 112_000

/** V4 起的默认读条时长。进行中活动仍以自身 startedAt/endsAt 为准。 */
export const BASE_ACTIVITY_DURATION_MS = 10_000
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
  'bottled-speed-magic': 2,
  'bottled-vitality-magic': 7,
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

export const PIANO_NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const
export const PIANO_OCTAVES = [3, 4, 5, 6] as const

export type PianoNoteName = (typeof PIANO_NOTE_NAMES)[number]
export type PianoOctave = (typeof PIANO_OCTAVES)[number]
export type PianoNoteId = `${PianoNoteName}${PianoOctave}`

/** C3–B6 四个完整八度的唯一琴键 ID 来源；界面按相反顺序从高到低展示。 */
export const PIANO_NOTE_IDS: readonly PianoNoteId[] = PIANO_OCTAVES.flatMap((octave) =>
  PIANO_NOTE_NAMES.map((name) => `${name}${octave}` as PianoNoteId),
)

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
export const POMODORO_PRESETS = [
  {
    id: 'classic',
    focusDurationMs: 25 * 60 * 1_000,
    breakDurationMs: 5 * 60 * 1_000,
    label: '25 分钟',
    description: '专注 25 分钟，休息 5 分钟',
  },
  {
    id: 'deep',
    focusDurationMs: 50 * 60 * 1_000,
    breakDurationMs: 10 * 60 * 1_000,
    label: '50 分钟',
    description: '专注 50 分钟，休息 10 分钟',
  },
  {
    id: 'long',
    focusDurationMs: 90 * 60 * 1_000,
    breakDurationMs: 15 * 60 * 1_000,
    label: '90 分钟',
    description: '专注 90 分钟，休息 15 分钟',
  },
] as const
export type PomodoroPreset = (typeof POMODORO_PRESETS)[number]
export const DEFAULT_POMODORO_BREAK_DURATION_MS = POMODORO_PRESETS[0].breakDurationMs
/** V4 严格导入仍需接受历史任意时长；V5 新会话只接受 POMODORO_PRESETS。 */
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

/** 刷播只允许选择随版本发布的两个本地收藏夹快照。 */
export const STREAM_FAVORITE_IDS = [3682220021, 3986840044] as const
export const DEFAULT_STREAM_FAVORITE_ID = STREAM_FAVORITE_IDS[0]
