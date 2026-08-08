import { expect, test } from '@playwright/test'

interface ImageVariant {
  path: string
  width: number
  height: number
  byteLength: number
  mime: string
}

interface VideoMetadata {
  bvid: string
  title: string
  authorName: string
  publishedAt: string
  sourceUrl: string
}

interface CollectibleItem {
  id: string
  images: ImageVariant[]
  metadata: {
    sequence?: number
    video?: VideoMetadata
  }
}

interface CollectibleManifest {
  itemCount: number
  items: CollectibleItem[]
}

interface VideoCatalog {
  videos: Record<string, VideoMetadata>
  posterMappings: {
    millionShots: Array<{ posterId: string; bvid: string }>
    siteFirsts: Array<{ posterId: string; bvid: string }>
  }
}

test('发布目录包含 100 张明信片、正确 Survivors 与统一 BV 映射', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '静态发布契约只需在桌面项目读取一次')

  const [postcardsResponse, millionResponse, siteFirstResponse, videoResponse] = await Promise.all([
    request.get('data/postcards.json'),
    request.get('data/million-shot-posters.json'),
    request.get('data/site-firsts.json'),
    request.get('data/video-catalog.json'),
  ])
  for (const response of [postcardsResponse, millionResponse, siteFirstResponse, videoResponse]) {
    expect(response.ok()).toBe(true)
  }

  const postcards = (await postcardsResponse.json()) as CollectibleManifest
  const million = (await millionResponse.json()) as CollectibleManifest
  const siteFirsts = (await siteFirstResponse.json()) as CollectibleManifest
  const videos = (await videoResponse.json()) as VideoCatalog

  expect(postcards.itemCount).toBe(100)
  expect(postcards.items).toHaveLength(100)
  expect(new Set(postcards.items.map((item) => item.id)).size).toBe(100)
  expect(million.itemCount).toBe(million.items.length)
  expect(siteFirsts.itemCount).toBe(siteFirsts.items.length)
  expect(
    new Set([...postcards.items, ...million.items, ...siteFirsts.items].map((item) => item.id))
      .size,
  ).toBe(postcards.items.length + million.items.length + siteFirsts.items.length)

  for (const item of [...postcards.items, ...million.items, ...siteFirsts.items]) {
    const fallback = [...item.images].sort((left, right) => left.width - right.width)[0]
    expect(fallback.width, `${item.id} fallback width`).toBe(480)
    expect(fallback.path, `${item.id} fallback path`).toMatch(/-480\.webp$/u)
  }

  const survivors = million.items.find((item) => item.id === 'million-shot-108')
  expect(survivors).toBeDefined()
  expect(survivors).toMatchObject({
    metadata: {
      sequence: 108,
      video: { bvid: 'BV198411R74Z' },
    },
    images: [
      {
        path: 'assets/collectibles/million-shots/million-shot-108-480.webp',
        width: 480,
        height: 720,
        mime: 'image/webp',
      },
      {
        path: 'assets/collectibles/million-shots/million-shot-108-800.webp',
        width: 800,
        height: 1200,
        mime: 'image/webp',
      },
    ],
  })

  for (const image of survivors!.images) {
    const response = await request.get(image.path)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/webp')
    expect((await response.body()).byteLength).toBe(image.byteLength)
  }

  for (const item of [...million.items, ...siteFirsts.items]) {
    const metadata = item.metadata.video
    expect(metadata, `${item.id} 应有视频元数据`).toBeDefined()
    expect(videos.videos[metadata!.bvid]).toMatchObject({
      bvid: metadata!.bvid,
      title: metadata!.title,
      authorName: metadata!.authorName,
      publishedAt: metadata!.publishedAt,
      sourceUrl: metadata!.sourceUrl,
    })
    const mappings = item.id.startsWith('million-shot-')
      ? videos.posterMappings.millionShots
      : videos.posterMappings.siteFirsts
    expect(mappings.find((mapping) => mapping.posterId === item.id)?.bvid).toBe(metadata!.bvid)
  }
})
