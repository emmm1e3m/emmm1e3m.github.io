import { BILIBILI_BVID_PATTERN } from '@/domain'

export type StreamInputErrorCode = 'invalid-bvid' | 'empty-catalog'

export interface StreamInputError {
  readonly line: 0 | 1
  readonly input: string
  readonly code: StreamInputErrorCode
  readonly message: string
}

export type StreamParseResult =
  | { readonly ok: true; readonly bvid: string | null; readonly errors: readonly [] }
  | { readonly ok: false; readonly bvid: null; readonly errors: readonly StreamInputError[] }

function normalizeBvid(value: string) {
  return `BV${value.slice(2)}`
}

function parseBilibiliVideoUrl(value: string) {
  try {
    const url = new URL(value)
    const isBilibiliHost = url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com')
    if (!isBilibiliHost || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null

    const segments = url.pathname.split('/').filter(Boolean)
    const videoIndex = segments.findIndex((segment) => segment.toLowerCase() === 'video')
    const candidate = videoIndex < 0 ? undefined : segments[videoIndex + 1]
    if (candidate === undefined || candidate.slice(0, 2).toUpperCase() !== 'BV') return null
    const normalized = normalizeBvid(candidate)
    return BILIBILI_BVID_PATTERN.test(normalized) ? normalized : null
  } catch {
    return null
  }
}

/** 自测视频接受一个裸 BV 号或完整视频链接；留空表示只使用静态收藏夹。 */
export function parseStreamSelfTestInput(input: string): StreamParseResult {
  const value = input.trim()
  if (!value) return { ok: true, bvid: null, errors: [] }
  const hasBvidPrefix = value.slice(0, 2).toUpperCase() === 'BV'
  const bareBvid = hasBvidPrefix ? normalizeBvid(value) : null
  const bvid =
    bareBvid !== null && BILIBILI_BVID_PATTERN.test(bareBvid)
      ? bareBvid
      : parseBilibiliVideoUrl(value)
  if (bvid !== null) {
    return { ok: true, bvid, errors: [] }
  }
  return {
    ok: false,
    bvid: null,
    errors: [
      {
        line: 1,
        input: value,
        code: 'invalid-bvid',
        message: '自测视频请填写一个 BV 号或完整的哔哩哔哩视频链接，或者留空。',
      },
    ],
  }
}

export function buildStreamQueue(
  selfTestBvid: string | null,
  catalogBvids: readonly string[],
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

export function emptyStreamCatalogResult(): StreamParseResult {
  return {
    ok: false,
    bvid: null,
    errors: [
      {
        line: 0,
        input: '',
        code: 'empty-catalog',
        message: '静态刷播收藏夹里暂时没有视频。',
      },
    ],
  }
}

export function buildStreamVideoUrl(bvid: string) {
  return `https://www.bilibili.com/video/${bvid}/?autoplay=1&t=0`
}

/** 官方跨站播放器仅作为实验性游客刷播载体，父页面不读取其内部状态。 */
export function buildVisitorStreamUrl(bvid: string) {
  const query = new URLSearchParams({
    bvid,
    p: '1',
    autoplay: '1',
    danmaku: '0',
    t: '0',
    muted: '1',
  })
  return `https://player.bilibili.com/player.html?${query.toString()}`
}
