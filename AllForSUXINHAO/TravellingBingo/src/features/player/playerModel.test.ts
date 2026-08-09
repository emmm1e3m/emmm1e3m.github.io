import {
  adjacentTrackIndex,
  buildBilibiliPlayerUrl,
  createNamedBilibiliPlaylist,
  endedTrackIndex,
  parseBilibiliPlaylistInput,
  parseBilibiliTrackReference,
} from './playerModel'

describe('Bilibili 播放列表输入', () => {
  it('逐行识别 BV、主站、移动端与外链播放器 URL，并按首次出现去重', () => {
    const result = parseBilibiliPlaylistInput(
      [
        '\uFEFFBV1xx411c7mD',
        'https://www.bilibili.com/video/BV1B7411m7LV/?spm_id_from=333',
        'https://m.bilibili.com/video/BV17x411w7KC',
        'https://player.bilibili.com/player.html?bvid=BV1B7411m7LV&p=1',
        '',
      ].join('\r\n'),
    )

    expect(result.entries.map((entry) => [entry.lineNumber, entry.track.bvid])).toEqual([
      [1, 'BV1xx411c7mD'],
      [2, 'BV1B7411m7LV'],
      [3, 'BV17x411w7KC'],
    ])
    expect(result.duplicates).toEqual([
      {
        lineNumber: 4,
        firstLineNumber: 2,
        input: 'https://player.bilibili.com/player.html?bvid=BV1B7411m7LV&p=1',
        bvid: 'BV1B7411m7LV',
      },
    ])
    expect(result.rejected).toEqual([])
    expect(result.entries[0]?.track.sourceUrl).toBe('https://www.bilibili.com/video/BV1xx411c7mD/')
  })

  it('拒绝伪装域名、凭据 URL、非 HTTP URL 与无法离线展开的短链接', () => {
    const values = [
      'https://bilibili.com.evil.example/video/BV1xx411c7mD',
      'https://name:secret@www.bilibili.com/video/BV1xx411c7mD',
      'ftp://www.bilibili.com/video/BV1xx411c7mD',
      'https://b23.tv/abcdef',
      'BV1-too-short',
    ]
    const result = parseBilibiliPlaylistInput(values.join('\n'))

    expect(result.entries).toHaveLength(0)
    expect(result.rejected).toHaveLength(values.length)
    expect(result.rejected[3]?.reason).toContain('短链接')
    expect(parseBilibiliTrackReference('www.bilibili.com/video/BV1xx411c7mD')?.bvid).toBe(
      'BV1xx411c7mD',
    )
  })

  it('整理名称与曲目时保留首项并丢弃重复或非法 BV', () => {
    const valid = parseBilibiliTrackReference('BV1xx411c7mD')!
    const duplicate = { ...valid, title: '重复标题' }
    const invalid = { ...valid, bvid: 'not-a-bvid' }
    const playlist = createNamedBilibiliPlaylist('  周末   舞台  ', [valid, duplicate, invalid])

    expect(playlist.name).toBe('周末 舞台')
    expect(playlist.tracks).toEqual([valid])
    expect(() => createNamedBilibiliPlaylist('   ', [valid])).toThrow('取一个名字')
  })
})

describe('Bilibili 外链播放器请求', () => {
  it('只生成官方 iframe URL，并表达自动播放、分 P 与弹幕请求', () => {
    const url = new URL(
      buildBilibiliPlayerUrl({
        bvid: 'BV1xx411c7mD',
        page: 2,
      }),
    )

    expect(url.origin).toBe('https://player.bilibili.com')
    expect(url.pathname).toBe('/player.html')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      bvid: 'BV1xx411c7mD',
      p: '2',
      autoplay: '1',
      danmaku: '0',
    })
    expect(() => buildBilibiliPlayerUrl({ bvid: 'BV-invalid' })).toThrow('无效 BV')
  })

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
    expect(endedTrackIndex('list', null, 0)).toBeNull()
  })
})
