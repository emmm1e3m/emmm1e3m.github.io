import { adjacentTrackIndex, buildBilibiliPlayerUrl, endedTrackIndex } from './playerModel'

describe('Bilibili 播放 URL', () => {
  it('新曲显式从 0 秒自动播放，暂停后继续才写入运行时秒数', () => {
    const fresh = new URL(buildBilibiliPlayerUrl({ bvid: 'BV1xx411c7mD' }))
    expect(Object.fromEntries(fresh.searchParams)).toEqual({
      bvid: 'BV1xx411c7mD',
      p: '1',
      autoplay: '1',
      danmaku: '0',
      t: '0',
    })

    const resumed = new URL(buildBilibiliPlayerUrl({ bvid: 'BV1xx411c7mD', startAtSeconds: 12.9 }))
    expect(resumed.searchParams.get('t')).toBe('12')
    expect(() => buildBilibiliPlayerUrl({ bvid: 'BV-invalid' })).toThrow('无效 BV')
  })
})

describe('播放顺序', () => {
  it('用户主动切歌时，单曲模式也会切到相邻曲目', () => {
    expect(adjacentTrackIndex('list', 2, 3, 1)).toBe(0)
    expect(adjacentTrackIndex('list', 0, 3, -1)).toBe(2)
    expect(adjacentTrackIndex('single', 1, 3, 1)).toBe(2)
    expect(adjacentTrackIndex('shuffle', 1, 4, 1, 0)).toBe(2)
    expect(adjacentTrackIndex('shuffle', 1, 4, 1, 0.999)).toBe(0)
    expect(adjacentTrackIndex('shuffle', 1, 4, 1, 0.5)).not.toBe(1)
    expect(adjacentTrackIndex('list', null, 3, 1)).toBe(0)
    expect(adjacentTrackIndex('list', null, 0, 1)).toBeNull()
  })

  it('自然播完时，单曲重播、列表下一首、随机避开当前曲目', () => {
    expect(endedTrackIndex('single', 1, 3)).toBe(1)
    expect(endedTrackIndex('list', 2, 3)).toBe(0)
    expect(endedTrackIndex('shuffle', 1, 4, 0)).toBe(2)
    expect(endedTrackIndex('shuffle', 1, 4, 0.999)).toBe(0)
    expect(endedTrackIndex('list', null, 3)).toBe(0)
    expect(endedTrackIndex('shuffle', null, 4, 0.5)).toBe(2)
    expect(endedTrackIndex('shuffle', null, 4, 0.999)).toBe(3)
    expect(endedTrackIndex('list', null, 0)).toBeNull()
  })
})
