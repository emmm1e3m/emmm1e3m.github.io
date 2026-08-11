import { parseStreamSelfTestInput } from './parser'

describe('parseStreamSelfTestInput', () => {
  afterEach(() => vi.restoreAllMocks())

  it('接受一个裸 BV 号或留空，并规范化 BV 前缀', () => {
    expect(parseStreamSelfTestInput('  ')).toEqual({ ok: true, bvid: null, errors: [] })
    expect(parseStreamSelfTestInput('bv1AbCdEf234')).toEqual({
      ok: true,
      bvid: 'BV1AbCdEf234',
      errors: [],
    })
  })

  it.each([
    'https://www.bilibili.com/video/BV1xx411c7mD/',
    'https://www.bilibili.com/video/bv1xx411c7mD/?spm_id_from=333.1007',
    'https://m.bilibili.com/video/BV1xx411c7mD',
  ])('从完整的哔哩哔哩视频链接中提取并规范化 BV：%s', (input) => {
    expect(parseStreamSelfTestInput(input)).toEqual({
      ok: true,
      bvid: 'BV1xx411c7mD',
      errors: [],
    })
  })

  it.each([
    'BV1xx411c7mD\nBV1B7411m7LV',
    'https://b23.tv/abcdef',
    'https://example.com/video/BV1xx411c7mD/',
    'https://www.bilibili.com/read/BV1xx411c7mD/',
    '随便写点什么',
    'XX1xx411c7mD',
  ])('拒绝无法本地解析为单个 BV 的输入：%s', (input) => {
    const fetchRequest = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const xhrRequest = vi
      .spyOn(XMLHttpRequest.prototype, 'open')
      .mockImplementation(() => undefined)

    expect(parseStreamSelfTestInput(input)).toMatchObject({
      ok: false,
      bvid: null,
      errors: [{ line: 1, code: 'invalid-bvid' }],
    })
    expect(fetchRequest).not.toHaveBeenCalled()
    expect(xhrRequest).not.toHaveBeenCalled()
  })
})
