const BILIBILI_PLAYER_ORIGIN = 'https://player.bilibili.com'

const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/u

export type BilibiliPlaybackMode = 'list' | 'single' | 'shuffle'

export interface BilibiliPlayerTrack {
  readonly bvid: string
  readonly title: string
  /** 收藏目录提供的界面短标题；完整视频标题始终保留在 title。 */
  readonly displayTitle?: string
  readonly sourceUrl: string
  readonly authorName?: string
  readonly publishedAt?: string
  /** 静态目录中的实际视频时长，是播放进度与续播计时的共同来源。 */
  readonly durationSeconds: number
}

export function displayTitleForTrack(
  track: Pick<BilibiliPlayerTrack, 'title' | 'displayTitle'>,
): string {
  return track.displayTitle ?? track.title
}

interface BilibiliPlayerUrlOptions {
  readonly bvid: string
  readonly page?: number
  readonly danmaku?: boolean
  /** 暂停后继续播放时使用的易失起点，不进入存档。 */
  readonly startAtSeconds?: number
}

export function buildBilibiliPlayerUrl({
  bvid,
  page = 1,
  danmaku = false,
  startAtSeconds = 0,
}: BilibiliPlayerUrlOptions) {
  if (!BVID_PATTERN.test(bvid)) throw new Error(`无效 BV 号：${bvid}`)

  const url = new URL('/player.html', BILIBILI_PLAYER_ORIGIN)
  url.searchParams.set('bvid', bvid)
  const normalizedPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1
  const normalizedStart = Number.isFinite(startAtSeconds)
    ? Math.max(0, Math.floor(startAtSeconds))
    : 0
  url.searchParams.set('p', String(normalizedPage))
  url.searchParams.set('autoplay', '1')
  url.searchParams.set('danmaku', danmaku ? '1' : '0')
  url.searchParams.set('t', String(normalizedStart))
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
  if (currentIndex === null || currentIndex < 0 || currentIndex >= trackCount) {
    if (mode !== 'shuffle') return 0
    const boundedRandom = Number.isFinite(randomValue)
      ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
      : 0
    return Math.floor(boundedRandom * trackCount)
  }
  if (mode === 'single' || trackCount === 1) return currentIndex
  return adjacentTrackIndex(mode, currentIndex, trackCount, 1, randomValue)
}
