import millionShotCatalogJson from '../../public/data/million-shot-posters.json'
import postcardCatalogJson from '../../public/data/postcards.json'
import siteFirstCatalogJson from '../../public/data/site-firsts.json'

import {
  calculateCollectionProgress,
  collectibleItemSchema,
  ContentCatalogLoadError,
  getCollectibleById,
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

describe('收藏目录契约', () => {
  it('校验公开海报目录与真实来源明信片契约', () => {
    expect(millionShotCatalog.items).toHaveLength(millionShotCatalog.itemCount)
    expect(siteFirstCatalog.items).toHaveLength(siteFirstCatalog.itemCount)
    expect(postcardCatalog.items).toHaveLength(postcardCatalog.itemCount)
    expect(millionShotCatalog.itemCount).toBeGreaterThan(0)
    expect(siteFirstCatalog.itemCount).toBeGreaterThan(0)
    expect(postcardCatalog.itemCount).toBeGreaterThan(0)
    expect(postcardCatalog.items[0]?.source.platform).toBe('bilibilitoy')
    expect(postcardCatalog.items[0]?.images[0]?.path).toMatch(
      /^assets\/collectibles\/postcards\/.+\.webp$/,
    )
    expect(collectibleItemSchema.parse(postcardCatalog.items[0]).category).toBe('postcard')
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
    const catalog = mergeContentCatalogs(millionShotCatalog, siteFirstCatalog, postcardCatalog)

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
  })

  it('去重已收藏 ID，并单独报告旧存档中的未知 ID', () => {
    const catalog = mergeContentCatalogs(millionShotCatalog, siteFirstCatalog, postcardCatalog)
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

  it('并行加载三个真实资源目录并返回 ID 索引', async () => {
    const requests: string[] = []
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      const body = url.endsWith('million-shot-posters.json')
        ? millionShotCatalogJson
        : url.endsWith('site-firsts.json')
          ? siteFirstCatalogJson
          : postcardCatalogJson
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
    ])
    expect(catalog.byId['postcard-2025-01-0002']?.category).toBe('postcard')
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
