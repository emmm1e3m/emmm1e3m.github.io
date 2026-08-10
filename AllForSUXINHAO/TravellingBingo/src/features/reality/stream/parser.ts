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

/** 自测视频只接受一个裸 BV 号；留空表示只使用已发布的静态收藏夹。 */
export function parseStreamSelfTestInput(input: string): StreamParseResult {
  const value = input.trim()
  if (!value) return { ok: true, bvid: null, errors: [] }
  const hasBvidPrefix = value.slice(0, 2).toUpperCase() === 'BV'
  const normalized = hasBvidPrefix ? normalizeBvid(value) : value
  if (hasBvidPrefix && BILIBILI_BVID_PATTERN.test(normalized)) {
    return { ok: true, bvid: normalized, errors: [] }
  }
  return {
    ok: false,
    bvid: null,
    errors: [
      {
        line: 1,
        input: value,
        code: 'invalid-bvid',
        message: '自测视频请填写一个完整的 BV 号，或者留空。',
      },
    ],
  }
}

export function buildStreamQueue(selfTestBvid: string | null, catalogBvids: readonly string[]) {
  return [...new Set(selfTestBvid === null ? catalogBvids : [selfTestBvid, ...catalogBvids])]
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
