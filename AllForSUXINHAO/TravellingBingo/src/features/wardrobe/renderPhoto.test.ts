import type { ContentCatalog } from '@/content'
import type { WardrobePhoto } from '@/domain/game/types'

import {
  downloadWardrobePhoto,
  readPhotoBackgroundDimensions,
  renderWardrobePhoto,
} from './renderPhoto'

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
      scaleX: 0.32,
      scaleY: 0.24,
      rotation: 0,
      z: 1,
      elements: [
        {
          placementId: 'behind',
          assetId: 'apple-cuffs',
          x: 0.5,
          y: 0.6,
          scaleX: 0.7,
          scaleY: 0.35,
          rotation: 0,
          z: -1,
        },
        {
          placementId: 'front',
          assetId: 'round-glasses',
          x: 0.5,
          y: 0.4,
          scaleX: 0.45,
          scaleY: 0.2,
          rotation: 0,
          z: 2,
        },
      ],
    },
  ],
  decorations: [
    {
      placementId: 'photo-behind',
      assetId: 'signal-sign',
      x: 0.2,
      y: 0.25,
      scaleX: 0.2,
      scaleY: 0.1,
      rotation: -8,
      z: 0,
    },
    {
      placementId: 'photo-front',
      assetId: 'apple-badge',
      x: 0.8,
      y: 0.75,
      scaleX: 0.1,
      scaleY: 0.2,
      rotation: 12,
      z: 2,
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
    scale: vi.fn(),
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
  it('本地背景覆盖明信片并按天然比例导出，载入失败时不会静默生成白底', async () => {
    const harness = canvasHarness()
    const localBackground = drawable('blob:local-background', 1600, 900)
    const loadImage = vi.fn(async (url: string) => {
      if (url === 'blob:local-background') return localBackground
      return drawable(url, 512, 512)
    })

    await renderWardrobePhoto(photo, catalog, {
      createCanvas: harness.createCanvas,
      loadImage,
      backgroundOverride: {
        url: 'blob:local-background',
        width: 1600,
        height: 900,
      },
    })

    expect(harness.createCanvas).toHaveBeenCalledWith(2400, 1350)
    expect(loadImage.mock.calls[0][0]).toBe('blob:local-background')
    expect(loadImage).not.toHaveBeenCalledWith(expect.stringContaining('photo-test'))
    expect(harness.context.drawImage.mock.calls[0]).toEqual([localBackground, 0, 0, 2400, 1350])
    const drawOrder = harness.context.drawImage.mock.calls.map(
      ([image]) => (image as unknown as { url: string }).url,
    )
    expect(drawOrder).toHaveLength(6)
    expect(drawOrder[0]).toBe('blob:local-background')
    expect(drawOrder[1]).toMatch(/signal-sign\.webp$/u)
    expect(drawOrder[2]).toMatch(/apple-cuffs\.webp$/u)
    expect(drawOrder[3]).toMatch(/characters\/bingo\.webp$/u)
    expect(drawOrder[4]).toMatch(/round-glasses\.webp$/u)
    expect(drawOrder[5]).toMatch(/apple-badge\.webp$/u)

    await expect(
      renderWardrobePhoto(photo, catalog, {
        createCanvas: harness.createCanvas,
        loadImage: vi.fn(async () => {
          throw new Error('blob 已失效')
        }),
        backgroundOverride: {
          url: 'blob:expired-background',
          width: 1600,
          height: 900,
        },
      }),
    ).rejects.toThrow('blob 已失效')
  })

  it('读取本地图片天然尺寸并拒绝无效尺寸', async () => {
    await expect(
      readPhotoBackgroundDimensions('blob:portrait', async (url) => drawable(url, 900, 1600)),
    ).resolves.toEqual({ width: 900, height: 1600 })
    await expect(
      readPhotoBackgroundDimensions('blob:invalid', async (url) => drawable(url, 0, 0)),
    ).rejects.toThrow('图片尺寸无效')
  })

  it('优先回退明信片，并按全局 z 交错绘制非等比装饰与人物快照', async () => {
    const harness = canvasHarness()
    const loadedUrls: string[] = []
    const loadImage = vi.fn(async (url: string) => {
      loadedUrls.push(url)
      if (url.endsWith('photo-test-960.webp')) throw new Error('大图暂时不可用')
      if (url.endsWith('photo-test-480.webp')) return drawable(url, 480, 640)
      if (url.endsWith('round-glasses.webp')) return drawable(url, 1_000, 500)
      return drawable(url, 512, 512)
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
    expect(drawOrder).toHaveLength(6)
    expect(drawOrder[0]).toMatch(/photo-test-480\.webp$/u)
    expect(harness.context.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1800, 2400])
    expect(drawOrder[1]).toMatch(/signal-sign\.webp$/u)
    expect(harness.context.drawImage.mock.calls[1].slice(1)).toEqual([-180, -90, 360, 180])
    expect(drawOrder[2]).toMatch(/apple-cuffs\.webp$/u)
    expect(drawOrder[3]).toMatch(/characters\/bingo\.webp$/u)
    expect(drawOrder[4]).toMatch(/round-glasses\.webp$/u)
    expect(drawOrder[5]).toMatch(/apple-badge\.webp$/u)
    expect(harness.context.drawImage.mock.calls[5].slice(1)).toEqual([-90, -180, 180, 360])
    expect(harness.context.scale).toHaveBeenCalledWith(1, 0.75)
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
