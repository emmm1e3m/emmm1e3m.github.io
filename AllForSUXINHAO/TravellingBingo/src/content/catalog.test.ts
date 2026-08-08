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
    expect(millionShotCatalog.items).toHaveLength(30)
    expect(siteFirstCatalog.items).toHaveLength(8)
    expect(postcardCatalog.items).toHaveLength(12)
    expect(postcardCatalog.items[0]?.source.platform).toBe('bilibilitoy')
    expect(postcardCatalog.items[0]?.images[0]?.path).toMatch(
      /^assets\/collectibles\/postcards\/.+\.webp$/,
    )
    expect(collectibleItemSchema.parse(postcardCatalog.items[0]).category).toBe('postcard')
  })

  it('拒绝数量声明与 items 不一致的目录', () => {
    const invalid = { ...millionShotCatalogJson, itemCount: 29 }
    expect(millionShotCatalogSchema.safeParse(invalid).success).toBe(false)
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

    expect(catalog.items).toHaveLength(50)
    expect(catalog.categoryCounts).toEqual({
      postcard: 12,
      'million-shot': 30,
      'site-first': 8,
    })
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
    expect(progress.total).toBe(50)
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
