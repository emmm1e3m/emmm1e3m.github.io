import type { WardrobeElement } from '@/domain/game/types'

import {
  downloadWardrobeLook,
  renderWardrobeLook,
  WARDROBE_LOOK_DOWNLOAD_SIZE,
} from './renderWardrobeLook'

const elements: WardrobeElement[] = [
  {
    placementId: 'behind',
    assetId: 'apple-cuffs',
    x: 0.2,
    y: 0.3,
    scaleX: 0.25,
    scaleY: 0.5,
    rotation: -15,
    z: -1,
  },
  {
    placementId: 'front',
    assetId: 'round-glasses',
    x: 0.75,
    y: 0.7,
    scaleX: 0.5,
    scaleY: 0.25,
    rotation: 30,
    z: 2,
  },
]

function canvasHarness() {
  const context = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
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

function drawable(url: string, width = 512, height = 512) {
  return { url, width, height } as unknown as CanvasImageSource & {
    width: number
    height: number
  }
}

describe('透明角色 PNG 重建', () => {
  it('保持 2048 方形透明背景，按负层、角色底图、非负层绘制非等比元素', async () => {
    const harness = canvasHarness()
    const loadImage = vi.fn(async (url: string) => {
      if (url.endsWith('/characters/bingo.webp')) return drawable(url, 768, 384)
      return drawable(url)
    })

    const canvas = await renderWardrobeLook('bingo', elements, {
      createCanvas: harness.createCanvas,
      loadImage,
    })

    expect(canvas).toBe(harness.canvas)
    expect(harness.createCanvas).toHaveBeenCalledWith(
      WARDROBE_LOOK_DOWNLOAD_SIZE,
      WARDROBE_LOOK_DOWNLOAD_SIZE,
    )
    expect(harness.context.clearRect).toHaveBeenCalledWith(0, 0, 2048, 2048)
    expect(harness.context.fillRect).not.toHaveBeenCalled()

    const drawOrder = harness.context.drawImage.mock.calls.map(
      ([image]) => (image as unknown as { url: string }).url,
    )
    expect(drawOrder[0]).toMatch(/apple-cuffs\.webp$/u)
    expect(drawOrder[1]).toMatch(/characters\/bingo\.webp$/u)
    expect(drawOrder[2]).toMatch(/round-glasses\.webp$/u)
    expect(harness.context.drawImage.mock.calls[0].slice(1)).toEqual([-256, -512, 512, 1024])
    expect(harness.context.drawImage.mock.calls[1].slice(1)).toEqual([0, 512, 2048, 1024])
    expect(harness.context.drawImage.mock.calls[2].slice(1)).toEqual([-512, -256, 1024, 512])
    expect(harness.context.translate).toHaveBeenNthCalledWith(1, 409.6, 614.4)
    expect(harness.context.translate).toHaveBeenNthCalledWith(2, 1536, 1433.6)
    expect(harness.context.rotate).toHaveBeenNthCalledWith(1, (-15 * Math.PI) / 180)
    expect(harness.context.rotate).toHaveBeenNthCalledWith(2, (30 * Math.PI) / 180)
  })

  it('下载 PNG 使用角色中文名，并在点击后撤销临时 object URL', async () => {
    const harness = canvasHarness()
    const loadImage = vi.fn(async (url: string) => drawable(url))
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob
      return 'blob:wardrobe-look'
    })
    const revokeObjectURL = vi.fn()
    const link = document.createElement('a')
    const click = vi.spyOn(link, 'click').mockImplementation(() => undefined)
    const scheduledRevoke: { callback: (() => void) | null } = { callback: null }

    await downloadWardrobeLook('bingo', [], {
      createCanvas: harness.createCanvas,
      loadImage,
      createObjectURL,
      revokeObjectURL,
      createDownloadLink: () => link,
      scheduleRevoke: (callback) => {
        scheduledRevoke.callback = callback
      },
    })

    expect(harness.canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(link.href).toBe('blob:wardrobe-look')
    expect(link.download).toBe('奇迹饼狗-饼狗-透明造型.png')
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(scheduledRevoke.callback).not.toBeNull()
    scheduledRevoke.callback?.()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:wardrobe-look')
  })
})
