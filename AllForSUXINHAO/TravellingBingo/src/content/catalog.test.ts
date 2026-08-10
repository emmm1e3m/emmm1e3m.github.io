import millionShotCatalogJson from '../../public/data/million-shot-posters.json'
import friendCatalogJson from '../../public/data/friends.json'
import videoCatalogJson from '../../public/data/video-catalog.json'
import postcardCatalogJson from '../../public/data/postcards.json'
import siteFirstCatalogJson from '../../public/data/site-firsts.json'

import {
  calculateCollectionProgress,
  collectibleItemSchema,
  ContentCatalogLoadError,
  getCollectibleById,
  getFriendById,
  friendCatalogSchema,
  bilibiliVideoCatalogSchema,
  loadContentCatalog,
  mergeContentCatalogs,
  millionShotCatalogSchema,
  postcardCatalogSchema,
  resolvePublicUrl,
  siteFirstCatalogSchema,
} from '.'

const millionShotCatalog = millionShotCatalogSchema.parse(millionShotCatalogJson)
const siteFirstCatalog = siteFirstCatalogSchema.parse(siteFirstCatalogJson)
const postcardCatalog = postcardCatalogSchema.parse(postcardCatalogJson)
const friendCatalog = friendCatalogSchema.parse(friendCatalogJson)
const videoCatalog = bilibiliVideoCatalogSchema.parse(videoCatalogJson)
const STREAM_BVIDS = ['BV1At3j6EE6w', 'BV1mkuN6HEFC', 'BV1UZ3D6REhZ']

describe('收藏目录契约', () => {
  it('校验公开海报目录与真实来源明信片契约', () => {
    expect(millionShotCatalog.items).toHaveLength(millionShotCatalog.itemCount)
    expect(siteFirstCatalog.items).toHaveLength(siteFirstCatalog.itemCount)
    expect(postcardCatalog.items).toHaveLength(postcardCatalog.itemCount)
    expect(friendCatalog.items).toHaveLength(friendCatalog.itemCount)
    expect(millionShotCatalog.itemCount).toBeGreaterThan(0)
    expect(siteFirstCatalog.itemCount).toBeGreaterThan(0)
    expect(postcardCatalog.itemCount).toBeGreaterThan(0)
    expect(postcardCatalog.items[0]?.source.platform).toBe('bilibilitoy')
    expect(postcardCatalog.items[0]?.images[0]?.path).toMatch(
      /^assets\/collectibles\/postcards\/.+\.webp$/,
    )
    expect(collectibleItemSchema.parse(postcardCatalog.items[0]).category).toBe('postcard')
  })

  it('公开至少 100 张人工策展明信片，同时保留旧存档使用的稳定 ID 与标题', () => {
    const legacyTitles = {
      'postcard-2025-01-0002': '蓝天下的涂鸦墙',
      'postcard-2025-05-0014': '水边小城',
      'postcard-2025-07-0005': '收藏一场落日',
      'postcard-2025-09-0019': '锦鲤池',
      'postcard-2025-10-0032': '自由的风',
      'postcard-2025-12-0005': '苹果小画',
      'postcard-2025-12-0021': '雪林小径',
      'postcard-2026-02-0020': '蓝天下的街角',
      'postcard-2026-03-0010': '梦里片场',
      'postcard-2026-03-0020': '旅途小憩',
      'postcard-2026-04-0015': '阳光下的小狗',
      'postcard-2026-06-0023': '山间缆车',
    }

    expect(postcardCatalog.itemCount).toBeGreaterThanOrEqual(100)
    expect(new Set(postcardCatalog.items.map((item) => item.metadata.original.sha256)).size).toBe(
      postcardCatalog.itemCount,
    )
    expect(
      postcardCatalog.items.every(
        (item) => item.metadata.original.width >= 960 && item.metadata.original.height >= 960,
      ),
    ).toBe(true)
    for (const [id, title] of Object.entries(legacyTitles)) {
      expect(postcardCatalog.items.find((item) => item.id === id)?.title).toBe(title)
    }
  })

  it('拒绝数量声明与 items 不一致的目录', () => {
    const invalid = {
      ...millionShotCatalogJson,
      itemCount: millionShotCatalogJson.items.length - 1,
    }
    expect(millionShotCatalogSchema.safeParse(invalid).success).toBe(false)
  })

  it('放宽来源版本后仍拒绝跨类别的 generatedFrom', () => {
    expect(
      siteFirstCatalogSchema.safeParse({
        ...siteFirstCatalogJson,
        generatedFrom: postcardCatalogJson.generatedFrom,
      }).success,
    ).toBe(false)
  })

  it('全站第一 chronology 连续唯一，明确从 Dynamite 到 Power', () => {
    const chronology = [...siteFirstCatalog.items]
      .sort((left, right) => left.metadata.chronology - right.metadata.chronology)
      .map((item) => item.id)
    expect(chronology[0]).toBe('site-first-dynamite')
    expect(chronology.at(-1)).toBe('site-first-power')
    expect(
      [...siteFirstCatalog.items]
        .sort((left, right) => left.metadata.chronology - right.metadata.chronology)
        .map((item) => item.metadata.chronology),
    ).toEqual(Array.from({ length: siteFirstCatalog.itemCount }, (_, index) => index + 1))

    const invalid = structuredClone(siteFirstCatalogJson)
    invalid.items[0]!.metadata.chronology = invalid.items[1]!.metadata.chronology
    expect(siteFirstCatalogSchema.safeParse(invalid).success).toBe(false)
  })

  it('目录数量可扩充，仍严格要求 itemCount、chronology 与唯一 ID 对应', () => {
    const expanded = structuredClone(millionShotCatalogJson)
    const extra = structuredClone(expanded.items[0]!)
    extra.id = 'million-shot-future'
    extra.metadata.sequence = Math.max(...expanded.items.map((item) => item.metadata.sequence)) + 1
    expanded.items.push(extra)
    expanded.itemCount = expanded.items.length

    expect(millionShotCatalogSchema.safeParse(expanded).success).toBe(true)

    const expandedSiteFirst = structuredClone(siteFirstCatalogJson)
    const futureSiteFirst = structuredClone(expandedSiteFirst.items.at(-1)!)
    futureSiteFirst.id = 'site-first-future'
    futureSiteFirst.title = '未来的新舞台'
    futureSiteFirst.metadata.chronology = expandedSiteFirst.items.length + 1
    expandedSiteFirst.items.push(futureSiteFirst)
    expandedSiteFirst.itemCount = expandedSiteFirst.items.length

    const parsed = siteFirstCatalogSchema.parse(expandedSiteFirst)
    expect(parsed.items).toHaveLength(siteFirstCatalog.itemCount + 1)
  })

  it('拒绝重复曲目或悬空海报视频映射', () => {
    const duplicateTrack = structuredClone(videoCatalogJson)
    duplicateTrack.recordPlayer.items[1] = structuredClone(duplicateTrack.recordPlayer.items[0]!)
    expect(bilibiliVideoCatalogSchema.safeParse(duplicateTrack).success).toBe(false)

    const unknownVideo = structuredClone(videoCatalogJson)
    unknownVideo.posterMappings.millionShots[0]!.bvid = 'BV0000000000'
    expect(bilibiliVideoCatalogSchema.safeParse(unknownVideo).success).toBe(false)

    const tooShort = structuredClone(videoCatalogJson)
    tooShort.recordPlayer.items = tooShort.recordPlayer.items.slice(0, 1)
    expect(bilibiliVideoCatalogSchema.safeParse(tooShort).success).toBe(false)

    const reversed = structuredClone(videoCatalogJson)
    reversed.recordPlayer.items.reverse()
    expect(bilibiliVideoCatalogSchema.safeParse(reversed).success).toBe(false)
  })

  it('刷播目录固定收藏夹并拒绝缺项、重复和首页乱序', () => {
    expect(videoCatalog.folders.streaming.favoriteId).toBe(3963921644)
    expect(videoCatalog.streamPlaylist.sourceFavoriteId).toBe(3963921644)
    expect(videoCatalog.streamPlaylist.items.map((video) => video.bvid)).toEqual(STREAM_BVIDS)

    const wrongFavorite = structuredClone(videoCatalogJson)
    wrongFavorite.folders.streaming.favoriteId = 1
    expect(bilibiliVideoCatalogSchema.safeParse(wrongFavorite).success).toBe(false)

    const missingItem = structuredClone(videoCatalogJson)
    missingItem.streamPlaylist.items.pop()
    expect(bilibiliVideoCatalogSchema.safeParse(missingItem).success).toBe(false)

    const duplicateItem = structuredClone(videoCatalogJson)
    duplicateItem.streamPlaylist.items[1] = {
      ...structuredClone(duplicateItem.streamPlaylist.items[0]!),
      favoriteOrder: 2,
    }
    expect(bilibiliVideoCatalogSchema.safeParse(duplicateItem).success).toBe(false)

    const wrongOrder = structuredClone(videoCatalogJson)
    const first = structuredClone(wrongOrder.streamPlaylist.items[0]!)
    const second = structuredClone(wrongOrder.streamPlaylist.items[1]!)
    wrongOrder.streamPlaylist.items[0] = { ...second, favoriteOrder: 1 }
    wrongOrder.streamPlaylist.items[1] = { ...first, favoriteOrder: 2 }
    expect(bilibiliVideoCatalogSchema.safeParse(wrongOrder).success).toBe(false)

    const incompleteLatestPage = structuredClone(videoCatalogJson)
    incompleteLatestPage.folders.streaming.latestPage.items.pop()
    expect(bilibiliVideoCatalogSchema.safeParse(incompleteLatestPage).success).toBe(false)
  })

  it('拒绝越过公开目录的图片路径', () => {
    const invalid = structuredClone(postcardCatalogJson)
    invalid.items[0]!.images[0]!.path = '../private/original.webp'
    expect(postcardCatalogSchema.safeParse(invalid).success).toBe(false)
  })

  it('拒绝 selection 与实际明信片不一致', () => {
    const invalid = structuredClone(postcardCatalogJson)
    invalid.selection.selectedSourceIds = ['2026-01-0001']
    expect(postcardCatalogSchema.safeParse(invalid).success).toBe(false)
  })
})

describe('目录合并与收藏进度', () => {
  it('合并真实明信片、百万直拍与全站第一', () => {
    const catalog = mergeContentCatalogs(
      millionShotCatalog,
      siteFirstCatalog,
      postcardCatalog,
      friendCatalog,
      videoCatalog,
    )

    expect(catalog.items).toHaveLength(
      postcardCatalog.itemCount + millionShotCatalog.itemCount + siteFirstCatalog.itemCount,
    )
    expect(catalog.categoryCounts).toEqual({
      postcard: postcardCatalog.itemCount,
      'million-shot': millionShotCatalog.itemCount,
      'site-first': siteFirstCatalog.itemCount,
    })
    expect(catalog.siteFirstChronology[0]).toBe('site-first-dynamite')
    expect(catalog.siteFirstChronology.at(-1)).toBe('site-first-power')
    expect(getCollectibleById(catalog, 'postcard-2025-01-0002')?.category).toBe('postcard')
    expect(getCollectibleById(catalog, 'million-shot-152')?.title).toBe('POWER')
    expect(getCollectibleById(catalog, 'missing')).toBeUndefined()
    expect(getFriendById(catalog, 'signal-dog')?.name).toBe('信号狗')
    expect(catalog.recordPlayerVideos).toHaveLength(videoCatalog.recordPlayer.items.length)
    expect(catalog.recordPlayerVideos.map((video) => video.durationSeconds)).toEqual([
      183, 542, 100, 237, 301, 610, 198, 240,
    ])
    const siteFirstDisplayTitles = [...siteFirstCatalog.items]
      .sort((left, right) => left.metadata.chronology - right.metadata.chronology)
      .map((item) => item.title)
    expect(catalog.recordPlayerVideos.map((video) => video.displayTitle)).toEqual(
      siteFirstDisplayTitles,
    )
    expect(catalog.streamVideos.map((video) => video.bvid)).toEqual(STREAM_BVIDS)
  })

  it('拒绝海报内嵌视频与集中视频目录发生漂移', () => {
    const driftedMillionShots = structuredClone(millionShotCatalog)
    driftedMillionShots.items[0]!.metadata.video.title = '被篡改的视频标题'
    expect(() =>
      mergeContentCatalogs(
        driftedMillionShots,
        siteFirstCatalog,
        postcardCatalog,
        friendCatalog,
        videoCatalog,
      ),
    ).toThrow('视频元数据与视频目录不一致')
  })

  it('去重已收藏 ID，并单独报告旧存档中的未知 ID', () => {
    const catalog = mergeContentCatalogs(
      millionShotCatalog,
      siteFirstCatalog,
      postcardCatalog,
      friendCatalog,
      videoCatalog,
    )
    const progress = calculateCollectionProgress(catalog, [
      'postcard-2025-01-0002',
      'million-shot-152',
      'million-shot-152',
      'site-first-power',
      'old-save-item',
    ])

    expect(progress.collected).toBe(3)
    expect(progress.total).toBe(catalog.items.length)
    expect(progress.byCategory.postcard.collected).toBe(1)
    expect(progress.byCategory['million-shot'].collected).toBe(1)
    expect(progress.byCategory['site-first'].collected).toBe(1)
    expect(progress.unknownIds).toEqual(['old-save-item'])
  })
})

describe('运行时目录加载', () => {
  it('只在 Vite 应用基路径下拼接资源地址', () => {
    expect(resolvePublicUrl('data/postcards.json', '/AllForSUXINHAO/TravellingBingo/')).toBe(
      '/AllForSUXINHAO/TravellingBingo/data/postcards.json',
    )
    expect(() => resolvePublicUrl('../secrets.json', '/AllForSUXINHAO/TravellingBingo/')).toThrow(
      '安全的相对路径',
    )
    expect(() =>
      resolvePublicUrl('data/%2e%2e/secrets.json', '/AllForSUXINHAO/TravellingBingo/'),
    ).toThrow('安全的相对路径')
    expect(() => resolvePublicUrl('data/items.json', 'https://evil.example/app/')).toThrow(
      '同源绝对路径',
    )
  })

  it('并行加载收藏与好友目录并返回 ID 索引', async () => {
    const requests: string[] = []
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      const body = url.endsWith('million-shot-posters.json')
        ? millionShotCatalogJson
        : url.endsWith('site-firsts.json')
          ? siteFirstCatalogJson
          : url.endsWith('postcards.json')
            ? postcardCatalogJson
            : url.endsWith('friends.json')
              ? friendCatalogJson
              : videoCatalogJson
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const catalog = await loadContentCatalog({
      baseUrl: '/AllForSUXINHAO/TravellingBingo/',
      fetch: mockFetch,
    })

    expect(requests).toEqual([
      '/AllForSUXINHAO/TravellingBingo/data/million-shot-posters.json',
      '/AllForSUXINHAO/TravellingBingo/data/site-firsts.json',
      '/AllForSUXINHAO/TravellingBingo/data/postcards.json',
      '/AllForSUXINHAO/TravellingBingo/data/friends.json',
      '/AllForSUXINHAO/TravellingBingo/data/video-catalog.json',
    ])
    expect(catalog.byId['postcard-2025-01-0002']?.category).toBe('postcard')
    expect(catalog.friendById['bili-bing']?.name).toBe('饼哩饼哩')
  })

  it('为网络错误保留目录 URL 与原始原因', async () => {
    const originalError = new TypeError('offline')
    const failingFetch = vi.fn(async () => {
      throw originalError
    })

    await expect(
      loadContentCatalog({
        baseUrl: '/AllForSUXINHAO/TravellingBingo/',
        fetch: failingFetch,
      }),
    ).rejects.toMatchObject({
      name: 'ContentCatalogLoadError',
      url: '/AllForSUXINHAO/TravellingBingo/data/million-shot-posters.json',
      cause: originalError,
    } satisfies Partial<ContentCatalogLoadError>)
  })
})
