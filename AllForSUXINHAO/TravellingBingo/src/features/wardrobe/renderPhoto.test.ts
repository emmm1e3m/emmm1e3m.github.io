import type { ContentCatalog } from '@/content'
import type { WardrobePhoto } from '@/domain/game/types'

import { downloadWardrobePhoto, renderWardrobePhoto } from './renderPhoto'

const postcard = {
  id: 'postcard-photo-test',
  category: 'postcard',
  title: '测试明信片',
  alt: '测试明信片图片',
  images: [
    {
      width: 480,
      height: 640,
      path: 'assets/collectibles/postcards/photo-test-480.webp',
      byteLength: 1,
      mime: 'image/webp',
    },
    {
      width: 960,
      height: 1280,
      path: 'assets/collectibles/postcards/photo-test-960.webp',
      byteLength: 1,
      mime: 'image/webp',
    },
  ],
  tags: ['测试'],
  source: { url: 'https://example.com/postcard' },
} as const

const catalog = {
  items: [postcard],
  byId: { [postcard.id]: postcard },
  categoryCounts: { postcard: 1, 'million-shot': 0, 'site-first': 0 },
  siteFirstChronology: [],
  friends: [],
  friendById: {},
  videosByBvid: {},
  recordPlayerVideos: [],
} as unknown as ContentCatalog

const photo: WardrobePhoto = {
  photoId: 'photo-test',
  postcardId: postcard.id,
  createdAt: new Date('2026-08-11T12:00:00+08:00').getTime(),
  participants: [
    {
      targetId: 'bingo',
      sourceLookId: null,
      x: 0.5,
      y: 0.58,
      scale: 0.32,
      rotation: 0,
      z: 1,
      elements: [
        {
          placementId: 'behind',
          assetId: 'apple-cuffs',
          x: 0.5,
          y: 0.6,
          scale: 0.7,
          rotation: 0,
          z: -1,
        },
        {
          placementId: 'front',
          assetId: 'round-glasses',
          x: 0.5,
          y: 0.4,
          scale: 0.45,
          rotation: 0,
          z: 2,
        },
      ],
    },
  ],
}

function canvasHarness() {
  const context = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }))),
  } as unknown as HTMLCanvasElement
  return { context, canvas, createCanvas: vi.fn(() => canvas) }
}

function drawable(url: string, width = 1024, height = 1024) {
  return { url, width, height } as unknown as CanvasImageSource & { width: number; height: number }
}

describe('合拍 PNG 重建', () => {
  it('优先尝试 960 明信片，失败后回退 480，并按稳定 z 顺序绘制人物快照', async () => {
    const harness = canvasHarness()
    const loadedUrls: string[] = []
    const loadImage = vi.fn(async (url: string) => {
      loadedUrls.push(url)
      if (url.endsWith('photo-test-960.webp')) throw new Error('大图暂时不可用')
      return drawable(url, url.endsWith('photo-test-480.webp') ? 480 : 1024, 640)
    })

    await renderWardrobePhoto(photo, catalog, {
      createCanvas: harness.createCanvas,
      loadImage,
    })

    expect(harness.createCanvas).toHaveBeenCalledWith(1800, 2400)
    expect(harness.context.rect).toHaveBeenCalledWith(0, 0, 1800, 2400)
    expect(harness.context.clip).toHaveBeenCalledOnce()
    expect(loadedUrls[0]).toMatch(/photo-test-960\.webp$/u)
    expect(loadedUrls[1]).toMatch(/photo-test-480\.webp$/u)
    const drawOrder = harness.context.drawImage.mock.calls.map(
      ([image]) => (image as unknown as { url: string }).url,
    )
    expect(drawOrder).toHaveLength(4)
    expect(drawOrder[0]).toMatch(/photo-test-480\.webp$/u)
    expect(harness.context.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1800, 2400])
    expect(drawOrder[1]).toMatch(/apple-cuffs\.webp$/u)
    expect(drawOrder[2]).toMatch(/characters\/bingo\.webp$/u)
    expect(drawOrder[3]).toMatch(/round-glasses\.webp$/u)
  })

  it('失效明信片保留暖白背景和人物，下载只创建短期 object URL 并及时 revoke', async () => {
    const harness = canvasHarness()
    const loadImage = vi.fn(async (url: string) => drawable(url))
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob
      return 'blob:miracle-photo'
    })
    const revokeObjectURL = vi.fn()
    const link = document.createElement('a')
    const click = vi.spyOn(link, 'click').mockImplementation(() => undefined)
    const scheduledRevoke: { callback: (() => void) | null } = { callback: null }

    await downloadWardrobePhoto({ ...photo, postcardId: null }, catalog, {
      width: 1200,
      height: 900,
      createCanvas: harness.createCanvas,
      loadImage,
      createObjectURL,
      revokeObjectURL,
      createDownloadLink: () => link,
      scheduleRevoke: (callback) => {
        scheduledRevoke.callback = callback
      },
    })

    expect(harness.context.fillRect).toHaveBeenCalledWith(0, 0, 1200, 900)
    expect(loadImage).not.toHaveBeenCalledWith(expect.stringContaining('postcard'))
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(link.href).toBe('blob:miracle-photo')
    expect(link.download).toMatch(/^奇迹饼狗-2026-08-11-photo-test\.png$/u)
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(scheduledRevoke.callback).not.toBeNull()
    scheduledRevoke.callback?.()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:miracle-photo')
  })
})
