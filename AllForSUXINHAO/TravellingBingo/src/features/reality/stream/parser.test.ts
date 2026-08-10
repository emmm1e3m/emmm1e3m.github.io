import {
  buildStreamQueue,
  buildStreamVideoUrl,
  buildVisitorStreamUrl,
  parseStreamSelfTestInput,
} from './parser'

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
    'BV1xx411c7mD\nBV1B7411m7LV',
    'https://www.bilibili.com/video/BV1xx411c7mD/',
    'https://b23.tv/abcdef',
    '随便写点什么',
    'XX1xx411c7mD',
  ])('拒绝非单个裸 BV 的输入：%s', (input) => {
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

describe('buildStreamQueue', () => {
  it('把自测视频放在静态快照前面，并按首次出现顺序去重', () => {
    expect(
      buildStreamQueue('BV1xx411c7mD', ['BV1At3j6EE6w', 'BV1xx411c7mD', 'BV1mkuN6HEFC']),
    ).toEqual(['BV1xx411c7mD', 'BV1At3j6EE6w', 'BV1mkuN6HEFC'])
  })

  it('留空时完整保留静态快照顺序', () => {
    expect(buildStreamQueue(null, ['BV1At3j6EE6w', 'BV1mkuN6HEFC'])).toEqual([
      'BV1At3j6EE6w',
      'BV1mkuN6HEFC',
    ])
  })
})

describe('刷播 URL', () => {
  it('登录刷播只构造从 0 秒自动播放的公开播放页', () => {
    expect(buildStreamVideoUrl('BV1xx411c7mD')).toBe(
      'https://www.bilibili.com/video/BV1xx411c7mD/?autoplay=1&t=0',
    )
  })

  it('游客刷播只构造静音、不可交互的官方播放器地址', () => {
    const url = new URL(buildVisitorStreamUrl('BV1xx411c7mD'))
    expect(url.origin).toBe('https://player.bilibili.com')
    expect(url.pathname).toBe('/player.html')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      bvid: 'BV1xx411c7mD',
      p: '1',
      autoplay: '1',
      danmaku: '0',
      t: '0',
      muted: '1',
    })
  })
})
