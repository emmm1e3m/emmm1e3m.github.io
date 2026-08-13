import {
  BILIBILI_BVID_PATTERN,
  DEFAULT_STREAM_FAVORITE_ID as DOMAIN_DEFAULT_STREAM_FAVORITE_ID,
  STREAM_FAVORITE_IDS as DOMAIN_STREAM_FAVORITE_IDS,
} from '@/domain/game/constants'

type DomainStreamFavoriteId = (typeof DOMAIN_STREAM_FAVORITE_IDS)[number]
export type StreamFavoriteId = `${DomainStreamFavoriteId}`

export const STREAM_FAVORITE_IDS = DOMAIN_STREAM_FAVORITE_IDS.map(
  String,
) as readonly StreamFavoriteId[]

export const STREAM_FAVORITE_LABELS: Readonly<Record<StreamFavoriteId, string>> = {
  '3682220021': '刷播',
  '3986840044': '测试',
}

export const STREAM_VIDEO_INTERVAL_MS = 5_000
export const DEFAULT_STREAM_ROUND_INTERVAL_MS = 310_000

export const STREAM_PLAYBACK_MODES = ['silent', 'tab', 'popup'] as const
export type StreamPlaybackMode = (typeof STREAM_PLAYBACK_MODES)[number]

export const STREAM_PLAYBACK_MODE_LABELS: Readonly<Record<StreamPlaybackMode, string>> = {
  silent: '静默播放',
  tab: '新标签页',
  popup: '弹出窗口',
}

const DEFAULT_STREAM_FAVORITE_ID = String(DOMAIN_DEFAULT_STREAM_FAVORITE_ID) as StreamFavoriteId

export interface StreamPlayerQuery {
  readonly favoriteId: StreamFavoriteId
  readonly selfTestBvid: string | null
  readonly stopHours: number | null
  readonly sessionId: string
  readonly autostart: boolean
  readonly playbackMode: StreamPlaybackMode
}

export class StreamPlayerConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StreamPlayerConfigError'
  }
}

export function isStreamFavoriteId(value: string): value is StreamFavoriteId {
  return STREAM_FAVORITE_IDS.some((favoriteId) => favoriteId === value)
}

export function isStreamPlaybackMode(value: string): value is StreamPlaybackMode {
  return STREAM_PLAYBACK_MODES.some((mode) => mode === value)
}

function normalizeBvid(value: string) {
  return `BV${value.slice(2)}`
}

export function parseSelfTestInput(input: string) {
  const value = input.trim()
  if (!value) return null
  const direct = value.slice(0, 2).toUpperCase() === 'BV' ? normalizeBvid(value) : null
  if (direct !== null && BILIBILI_BVID_PATTERN.test(direct)) return direct

  try {
    const url = new URL(value)
    const isBilibiliHost = url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com')
    if (!isBilibiliHost || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
      throw new Error()
    }
    const segments = url.pathname.split('/').filter(Boolean)
    const videoIndex = segments.findIndex((segment) => segment.toLowerCase() === 'video')
    const candidate = videoIndex >= 0 ? segments[videoIndex + 1] : undefined
    if (candidate !== undefined && candidate.slice(0, 2).toUpperCase() === 'BV') {
      const bvid = normalizeBvid(candidate)
      if (BILIBILI_BVID_PATTERN.test(bvid)) return bvid
    }
  } catch {
    // 统一在下方给出页面内的输入提示。
  }
  throw new StreamPlayerConfigError('自测视频请填写一个 BV 号或完整哔哩哔哩视频链接。')
}

export function parseStopHoursInput(input: string) {
  const value = input.trim()
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
    throw new StreamPlayerConfigError('定时停止请填写 0–24 小时。')
  }
  if (parsed === 0) return null
  return parsed
}

/** 无参数直达使用默认配置；主游戏可以携带参数并自动开始。 */
export function parseStreamPlayerQuery(
  search: string,
  createSessionId: () => string = () => crypto.randomUUID(),
): StreamPlayerQuery {
  const params = new URLSearchParams(search)
  const favoriteId = params.get('favoriteId') ?? DEFAULT_STREAM_FAVORITE_ID
  if (!isStreamFavoriteId(favoriteId)) {
    throw new StreamPlayerConfigError('请从游戏里选择刷播收藏夹后重新打开。')
  }

  const rawSelfTest = params.get('selfTest') ?? ''
  const selfTestBvid = parseSelfTestInput(rawSelfTest)

  const stopHours = parseStopHoursInput(params.get('stopHours') ?? '')

  const sessionId = params.get('sessionId')?.trim() || createSessionId()
  const rawPlaybackMode = params.get('mode') ?? 'silent'
  if (!isStreamPlaybackMode(rawPlaybackMode)) {
    throw new StreamPlayerConfigError('请选择静默播放、新标签页或弹出窗口。')
  }

  return {
    favoriteId,
    selfTestBvid,
    stopHours,
    sessionId,
    autostart: params.get('autostart') === '1',
    playbackMode: rawPlaybackMode,
  }
}

/** 收藏夹文件每行一个 BV 号，顺序去重。 */
export function parseFavoriteCatalog(text: string) {
  const bvids: string[] = []
  const seen = new Set<string>()
  const lines = text.replace(/^\uFEFF/u, '').split(/\r?\n/u)

  lines.forEach((line, index) => {
    const bvid = line.trim()
    if (!bvid) return
    if (!BILIBILI_BVID_PATTERN.test(bvid)) {
      throw new StreamPlayerConfigError(`收藏夹第 ${index + 1} 行不是有效的 BV 号。`)
    }
    if (!seen.has(bvid)) {
      seen.add(bvid)
      bvids.push(bvid)
    }
  })

  if (bvids.length === 0) {
    throw new StreamPlayerConfigError('这个刷播收藏夹暂时没有视频。')
  }
  return bvids
}

/** 每轮 Fisher–Yates 重新洗牌；自测视频去重后固定放在末尾。 */
export function buildStreamRound(
  catalogBvids: readonly string[],
  selfTestBvid: string | null,
  random: () => number = Math.random,
) {
  const queue = [...new Set(catalogBvids)].filter((bvid) => bvid !== selfTestBvid)
  for (let index = queue.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[queue[index], queue[target]] = [queue[target]!, queue[index]!]
  }
  if (selfTestBvid !== null) queue.push(selfTestBvid)
  return queue
}

export function buildOfficialPlayerUrl(bvid: string) {
  const query = new URLSearchParams({
    bvid,
    p: '1',
    autoplay: '1',
    muted: '1',
    danmaku: '0',
    t: '0',
  })
  return `https://player.bilibili.com/player.html?${query.toString()}`
}

/** 新标签页与弹出窗口共用完整视频页地址。 */
export function buildFullVideoUrl(bvid: string) {
  return `https://www.bilibili.com/video/${bvid}/?autoplay=1&t=0`
}

export async function fetchFavoriteCatalog(favoriteId: StreamFavoriteId, signal?: AbortSignal) {
  const catalogUrl = new URL(`favourites/${favoriteId}.txt`, document.baseURI)
  const response = await fetch(catalogUrl, {
    credentials: 'same-origin',
    signal,
  })
  if (!response.ok) {
    throw new StreamPlayerConfigError('未能读取刷播收藏夹，请稍后重试。')
  }
  return parseFavoriteCatalog(await response.text())
}
