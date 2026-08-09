export const BILIBILI_PLAYER_ORIGIN = 'https://player.bilibili.com'
export const PLAYLIST_NAME_MAX_LENGTH = 60

const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/u

export type BilibiliPlaybackMode = 'list' | 'single' | 'shuffle'

export interface BilibiliPlayerTrack {
  readonly bvid: string
  readonly title: string
  readonly sourceUrl: string
  readonly authorName?: string
  readonly publishedAt?: string
  /** 只有静态目录已收录的曲目才有可靠时长。 */
  readonly durationSeconds?: number
}

export interface NamedBilibiliPlaylist {
  readonly name: string
  readonly tracks: readonly BilibiliPlayerTrack[]
}

export interface ParsedBilibiliLine {
  readonly lineNumber: number
  readonly input: string
  readonly track: BilibiliPlayerTrack
}

export interface DuplicateBilibiliLine {
  readonly lineNumber: number
  readonly firstLineNumber: number
  readonly input: string
  readonly bvid: string
}

export interface RejectedBilibiliLine {
  readonly lineNumber: number
  readonly input: string
  readonly reason: string
}

export interface ParsedBilibiliPlaylistInput {
  readonly entries: readonly ParsedBilibiliLine[]
  readonly duplicates: readonly DuplicateBilibiliLine[]
  readonly rejected: readonly RejectedBilibiliLine[]
}

export interface BilibiliPlayerUrlOptions {
  readonly bvid: string
  readonly page?: number
  readonly danmaku?: boolean
}

function isBilibiliHostname(hostname: string) {
  const normalized = hostname.toLowerCase()
  return normalized === 'bilibili.com' || normalized.endsWith('.bilibili.com')
}

function bvidFromBilibiliUrl(input: string) {
  let url: URL
  try {
    const candidate = /^(?:www\.|m\.|player\.)bilibili\.com\//iu.test(input)
      ? `https://${input}`
      : input
    url = new URL(candidate)
  } catch {
    return null
  }

  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username !== '' ||
    url.password !== '' ||
    !isBilibiliHostname(url.hostname)
  ) {
    return null
  }

  const queryBvid = url.searchParams.get('bvid')
  if (queryBvid && BVID_PATTERN.test(queryBvid)) return queryBvid

  for (const segment of url.pathname.split('/')) {
    if (BVID_PATTERN.test(segment)) return segment
  }
  return null
}

export function isBilibiliBvid(value: string) {
  return BVID_PATTERN.test(value)
}

export function canonicalBilibiliVideoUrl(bvid: string) {
  if (!isBilibiliBvid(bvid)) throw new Error(`无效 BV 号：${bvid}`)
  return `https://www.bilibili.com/video/${bvid}/`
}

export function parseBilibiliTrackReference(input: string): BilibiliPlayerTrack | null {
  const trimmed = input.trim()
  const bvid = isBilibiliBvid(trimmed) ? trimmed : bvidFromBilibiliUrl(trimmed)
  if (!bvid) return null
  return {
    bvid,
    title: bvid,
    sourceUrl: canonicalBilibiliVideoUrl(bvid),
  }
}

export function parseBilibiliPlaylistInput(input: string): ParsedBilibiliPlaylistInput {
  const entries: ParsedBilibiliLine[] = []
  const duplicates: DuplicateBilibiliLine[] = []
  const rejected: RejectedBilibiliLine[] = []
  const firstLineByBvid = new Map<string, number>()

  input.split(/\r?\n/u).forEach((rawLine, index) => {
    const lineNumber = index + 1
    const trimmed = rawLine.trim()
    if (!trimmed) return

    const track = parseBilibiliTrackReference(trimmed)
    if (!track) {
      rejected.push({
        lineNumber,
        input: trimmed,
        reason: trimmed.includes('b23.tv')
          ? '短链接不含 BV 号，请先展开为完整视频链接'
          : '没有识别到有效的 Bilibili BV 号或视频链接',
      })
      return
    }
    const firstLineNumber = firstLineByBvid.get(track.bvid)
    if (firstLineNumber !== undefined) {
      duplicates.push({ lineNumber, firstLineNumber, input: trimmed, bvid: track.bvid })
      return
    }
    firstLineByBvid.set(track.bvid, lineNumber)
    entries.push({ lineNumber, input: trimmed, track })
  })

  return { entries, duplicates, rejected }
}

export function normalizePlaylistName(name: string) {
  const normalized = name.trim().replace(/\s+/gu, ' ')
  if (!normalized) throw new Error('请为播放列表取一个名字')
  if (normalized.length > PLAYLIST_NAME_MAX_LENGTH) {
    throw new Error(`播放列表名称不能超过 ${PLAYLIST_NAME_MAX_LENGTH} 个字符`)
  }
  return normalized
}

export function deduplicateTracks(tracks: readonly BilibiliPlayerTrack[]) {
  const seen = new Set<string>()
  return tracks.filter((track) => {
    if (!isBilibiliBvid(track.bvid) || seen.has(track.bvid)) return false
    seen.add(track.bvid)
    return true
  })
}

export function createNamedBilibiliPlaylist(
  name: string,
  tracks: readonly BilibiliPlayerTrack[],
): NamedBilibiliPlaylist {
  return {
    name: normalizePlaylistName(name),
    tracks: deduplicateTracks(tracks),
  }
}

export function buildBilibiliPlayerUrl({
  bvid,
  page = 1,
  danmaku = false,
}: BilibiliPlayerUrlOptions) {
  if (!isBilibiliBvid(bvid)) throw new Error(`无效 BV 号：${bvid}`)

  const url = new URL('/player.html', BILIBILI_PLAYER_ORIGIN)
  url.searchParams.set('bvid', bvid)
  const normalizedPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1
  url.searchParams.set('p', String(normalizedPage))
  // 产品契约要求每次选曲都立即向外链播放器请求自动播放。
  url.searchParams.set('autoplay', '1')
  url.searchParams.set('danmaku', danmaku ? '1' : '0')
  return url.toString()
}

export function adjacentTrackIndex(
  mode: BilibiliPlaybackMode,
  currentIndex: number | null,
  trackCount: number,
  direction: 1 | -1,
  randomValue = Math.random(),
) {
  if (trackCount <= 0) return null
  if (currentIndex === null || currentIndex < 0 || currentIndex >= trackCount) return 0
  if (trackCount === 1) return currentIndex
  // “单曲循环”只影响自然播完后的动作，用户点上一首/下一首仍应正常切歌。
  if (mode === 'list' || mode === 'single') {
    return (currentIndex + direction + trackCount) % trackCount
  }

  const boundedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
    : 0
  const offset = 1 + Math.floor(boundedRandom * (trackCount - 1))
  return (currentIndex + offset) % trackCount
}

/** 根据自然播完事件计算目标；与用户主动切歌严格分开。 */
export function endedTrackIndex(
  mode: BilibiliPlaybackMode,
  currentIndex: number | null,
  trackCount: number,
  randomValue = Math.random(),
) {
  if (trackCount <= 0) return null
  if (currentIndex === null || currentIndex < 0 || currentIndex >= trackCount) return 0
  if (mode === 'single' || trackCount === 1) return currentIndex
  return adjacentTrackIndex(mode, currentIndex, trackCount, 1, randomValue)
}
