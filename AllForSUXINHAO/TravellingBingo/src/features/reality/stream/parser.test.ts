import { buildStreamVideoUrl, parseStreamInput } from './parser'

describe('parseStreamInput', () => {
  afterEach(() => vi.restoreAllMocks())

  it('按行解析裸 BV 与哔哩哔哩长链接，并按首次出现顺序去重', () => {
    expect(
      parseStreamInput(`
        BV1xx411c7mD
        https://www.bilibili.com/video/BV1B7411m7LV/?spm_id_from=333.1007
        https://m.bilibili.com/video/BV1xx411c7mD
      `),
    ).toEqual({
      ok: true,
      bvids: ['BV1xx411c7mD', 'BV1B7411m7LV'],
      errors: [],
    })
  })

  it('只规范化 BV 前缀，不破坏区分大小写的主体', () => {
    expect(parseStreamInput('bv1AbCdEf234')).toEqual({
      ok: true,
      bvids: ['BV1AbCdEf234'],
      errors: [],
    })
  })

  it('短链明确报错，且不尝试联网展开', () => {
    const fetchRequest = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const xhrRequest = vi
      .spyOn(XMLHttpRequest.prototype, 'open')
      .mockImplementation(() => undefined)
    const result = parseStreamInput('https://b23.tv/abcdef')
    expect(result).toMatchObject({
      ok: false,
      bvids: [],
      errors: [{ line: 1, code: 'short-link' }],
    })
    if (!result.ok) expect(result.errors[0]!.message).toContain('无法在本地可靠解析')
    expect(fetchRequest).not.toHaveBeenCalled()
    expect(xhrRequest).not.toHaveBeenCalled()
  })

  it('有效长链接也只在本地解析，不发起 fetch 或 XHR', () => {
    const fetchRequest = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const xhrRequest = vi
      .spyOn(XMLHttpRequest.prototype, 'open')
      .mockImplementation(() => undefined)

    expect(parseStreamInput('https://www.bilibili.com/video/BV1xx411c7mD/')).toMatchObject({
      ok: true,
      bvids: ['BV1xx411c7mD'],
    })
    expect(fetchRequest).not.toHaveBeenCalled()
    expect(xhrRequest).not.toHaveBeenCalled()
  })

  it('任一行无效时整体返回可展示的逐行错误，不运行有效的部分', () => {
    const result = parseStreamInput(
      ['BV1xx411c7mD', 'https://example.com/video/BV1B7411m7LV', '随便写点什么'].join('\n'),
    )
    expect(result).toMatchObject({
      ok: false,
      bvids: [],
      errors: [
        { line: 2, code: 'invalid-line' },
        { line: 3, code: 'invalid-line' },
      ],
    })
  })

  it('同一行出现多个不同 BV 时拒绝静默取第一个', () => {
    const result = parseStreamInput(
      'https://www.bilibili.com/video/BV1xx411c7mD/?next=BV1B7411m7LV',
    )
    expect(result).toMatchObject({
      ok: false,
      bvids: [],
      errors: [{ line: 1, code: 'multiple-bvids' }],
    })
  })

  it('空输入给出明确错误', () => {
    expect(parseStreamInput('\n  \n')).toMatchObject({
      ok: false,
      errors: [{ line: 0, code: 'empty-input' }],
    })
  })
})

describe('buildStreamVideoUrl', () => {
  it('只构造从 0 秒自动播放的公开播放页 URL', () => {
    expect(buildStreamVideoUrl('BV1xx411c7mD')).toBe(
      'https://www.bilibili.com/video/BV1xx411c7mD/?autoplay=1&t=0',
    )
  })
})
