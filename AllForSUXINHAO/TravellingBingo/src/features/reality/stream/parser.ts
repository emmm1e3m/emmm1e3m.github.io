import { BILIBILI_BVID_PATTERN } from '@/domain'

export type StreamInputErrorCode = 'invalid-bvid'

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
