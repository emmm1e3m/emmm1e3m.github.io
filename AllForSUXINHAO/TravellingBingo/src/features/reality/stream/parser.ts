export type StreamInputErrorCode = 'empty-input' | 'short-link' | 'invalid-line' | 'multiple-bvids'

export interface StreamInputError {
  readonly line: number
  readonly input: string
  readonly code: StreamInputErrorCode
  readonly message: string
}

export type StreamParseResult =
  | { readonly ok: true; readonly bvids: readonly string[]; readonly errors: readonly [] }
  | {
      readonly ok: false
      readonly bvids: readonly []
      readonly errors: readonly StreamInputError[]
    }

const ALL_BVIDS_PATTERN = /\bBV[0-9A-Za-z]{10}\b/giu
const BARE_BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/iu
const BILIBILI_HOST_PATTERN = /(^|\.)bilibili\.com$/iu
const BILIBILI_SHORT_HOST_PATTERN = /(^|\.)b23\.tv$/iu

function normalizeBvid(value: string) {
  return `BV${value.slice(2)}`
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

function invalidLine(line: number, input: string): StreamInputError {
  return {
    line,
    input,
    code: 'invalid-line',
    message: `第 ${line} 行不是 BV 号或包含 BV 号的哔哩哔哩视频长链接。`,
  }
}

/** 仅在本地解析显式 BV 号；短链不会发起网络请求来展开。 */
export function parseStreamInput(input: string): StreamParseResult {
  const lines = input.split(/\r?\n/u)
  const errors: StreamInputError[] = []
  const uniqueBvids = new Set<string>()

  lines.forEach((sourceLine, index) => {
    const value = sourceLine.trim()
    if (!value) return

    const line = index + 1
    if (BARE_BVID_PATTERN.test(value)) {
      uniqueBvids.add(normalizeBvid(value))
      return
    }

    const url = parseHttpUrl(value)
    if (!url) {
      errors.push(invalidLine(line, value))
      return
    }

    if (BILIBILI_SHORT_HOST_PATTERN.test(url.hostname)) {
      errors.push({
        line,
        input: value,
        code: 'short-link',
        message: `第 ${line} 行是哔哩哔哩短链，无法在本地可靠解析。请粘贴展开后包含 BV 号的长链接。`,
      })
      return
    }

    if (!BILIBILI_HOST_PATTERN.test(url.hostname)) {
      errors.push(invalidLine(line, value))
      return
    }

    const matches = [...url.href.matchAll(ALL_BVIDS_PATTERN)].map((match) =>
      normalizeBvid(match[0]),
    )
    const lineBvids = [...new Set(matches)]
    if (lineBvids.length === 0) {
      errors.push(invalidLine(line, value))
      return
    }
    if (lineBvids.length > 1) {
      errors.push({
        line,
        input: value,
        code: 'multiple-bvids',
        message: `第 ${line} 行包含多个不同的 BV 号，请每行只填写一个视频。`,
      })
      return
    }

    uniqueBvids.add(lineBvids[0]!)
  })

  if (errors.length > 0) return { ok: false, bvids: [], errors }

  const bvids = [...uniqueBvids]
  if (bvids.length === 0) {
    return {
      ok: false,
      bvids: [],
      errors: [
        {
          line: 0,
          input: '',
          code: 'empty-input',
          message: '请至少输入一个 BV 号或哔哩哔哩视频长链接。',
        },
      ],
    }
  }

  return { ok: true, bvids, errors: [] }
}

export function buildStreamVideoUrl(bvid: string) {
  return `https://www.bilibili.com/video/${bvid}/?autoplay=1&t=0`
}
