import {
  buildOfficialPlayerUrl,
  buildStreamRound,
  parseFavoriteCatalog,
  parseSelfTestInput,
  parseStopHoursInput,
  parseStreamPlayerQuery,
} from './catalog'

const CATALOG = ['BV1xx411c7mD', 'BV1Q541167Qg', 'BV1mK4y1C7Bz'] as const

describe('stream player catalog', () => {
  it('无参数直达使用默认收藏夹和本地会话', () => {
    expect(parseStreamPlayerQuery('', () => 'local-session')).toEqual({
      favoriteId: '3682220021',
      selfTestBvid: null,
      stopHours: null,
      sessionId: 'local-session',
      autostart: false,
    })
  })

  it('解析主游戏传入的自动开始参数', () => {
    expect(
      parseStreamPlayerQuery(
        '?favoriteId=3986840044&selfTest=BV1xx411c7mD&stopHours=4.5&sessionId=s-1&autostart=1',
      ),
    ).toEqual({
      favoriteId: '3986840044',
      selfTestBvid: 'BV1xx411c7mD',
      stopHours: 4.5,
      sessionId: 's-1',
      autostart: true,
    })
  })

  it('自测输入同时接受 BV 号与完整视频链接', () => {
    expect(parseSelfTestInput('bv1xx411c7mD')).toBe('BV1xx411c7mD')
    expect(
      parseSelfTestInput('https://www.bilibili.com/video/BV1Q541167Qg/?spm_id_from=test'),
    ).toBe('BV1Q541167Qg')
    expect(parseSelfTestInput('  ')).toBeNull()
    expect(() => parseSelfTestInput('https://example.com/video/BV1xx411c7mD')).toThrow('自测视频')
  })

  it('0 或留空表示不限时', () => {
    expect(parseStopHoursInput('')).toBeNull()
    expect(parseStopHoursInput('0')).toBeNull()
    expect(parseStopHoursInput('0.0')).toBeNull()
    expect(parseStopHoursInput('00')).toBeNull()
    expect(parseStopHoursInput('-0')).toBeNull()
    expect(parseStopHoursInput('2.5')).toBe(2.5)
    expect(() => parseStopHoursInput('-1')).toThrow('定时停止')
    expect(() => parseStopHoursInput('24.5')).toThrow('0–24')
  })

  it('从同源 TXT 按行解析并保留首次出现顺序', () => {
    expect(
      parseFavoriteCatalog(
        `\uFEFF${CATALOG[0]}\r\n${CATALOG[1]}\n${CATALOG[0]}\n\n${CATALOG[2]}\n`,
      ),
    ).toEqual(CATALOG)
    expect(() => parseFavoriteCatalog(`${CATALOG[0]}\nnot-a-bvid`)).toThrow('第 2 行')
  })

  it('每轮重新 Fisher–Yates 洗牌，自测去重后固定在末尾', () => {
    expect(buildStreamRound([...CATALOG, CATALOG[1]], CATALOG[1], () => 0)).toEqual([
      CATALOG[2],
      CATALOG[0],
      CATALOG[1],
    ])
  })

  it('只创建官方静音自动播放 iframe 地址', () => {
    const url = new URL(buildOfficialPlayerUrl(CATALOG[0]))
    expect(url.origin).toBe('https://player.bilibili.com')
    expect(url.searchParams.get('bvid')).toBe(CATALOG[0])
    expect(url.searchParams.get('autoplay')).toBe('1')
    expect(url.searchParams.get('muted')).toBe('1')
    expect(url.searchParams.get('t')).toBe('0')
  })
})
