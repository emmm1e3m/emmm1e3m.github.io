import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { startGame } from './support/game'

const BROWSER_SAVE_KEY = 'travelling-bingo:browser-save:v1'
const POSTCARD_ID = 'postcard-2025-01-0002'
const LOCAL_PORTRAIT_PATH = fileURLToPath(
  new URL(
    '../../public/assets/collectibles/postcards/postcard-2025-05-0014-480.webp',
    import.meta.url,
  ),
)

async function unlockPostcard(page: import('@playwright/test').Page) {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, BROWSER_SAVE_KEY))
    .toBe(true)
  await page.evaluate(
    ({ key, postcardId }) => {
      return fetch(new URL('data/miracle-wardrobe.json', location.href))
        .then((response) => response.json())
        .then(
          (manifest: { outfits: Array<{ id: string }>; accessories: Array<{ id: string }> }) => {
            const cache = JSON.parse(localStorage.getItem(key)!) as {
              payload: {
                collections: Record<string, unknown>
                wardrobe: { ownedAssetIds: string[] }
              }
            }
            cache.payload.collections[postcardId] = {
              id: postcardId,
              firstObtainedAt: Date.now(),
              duplicateCount: 0,
            }
            cache.payload.wardrobe.ownedAssetIds = [
              ...manifest.outfits.map((item) => item.id),
              ...manifest.accessories.map((item) => item.id),
            ]
            localStorage.setItem(key, JSON.stringify(cache))
          },
        )
    },
    { key: BROWSER_SAVE_KEY, postcardId: POSTCARD_ID },
  )
  await page.reload()
  await page.getByRole('button', { name: '继续' }).click()
  await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
}

test('本地图片合拍保持天然比例、仅下载，并能切回明信片保存路径', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '本地文件合拍只需在桌面 Chromium 验收')
  await page.setViewportSize({ width: 1440, height: 900 })
  await startGame(page, { seed: 'local-photo-e2e', displayName: '本地合拍验收' })
  await unlockPostcard(page)

  await page.locator('[data-hotspot="衣架"]').click()
  await page.getByRole('button', { name: '进入奇迹饼狗' }).click()
  const wardrobe = page.getByRole('dialog', { name: '奇迹饼狗' })
  await wardrobe.getByRole('tab', { name: '合拍' }).click()

  await wardrobe.getByLabel('上传本地图片').setInputFiles(LOCAL_PORTRAIT_PATH)
  await expect(wardrobe.getByRole('button', { name: '下载当前合拍' })).toBeVisible()
  await expect(wardrobe.getByRole('button', { name: '保存这张合拍' })).toHaveCount(0)
  const localBackground = wardrobe.locator('.photo-composition__postcard')
  await expect
    .poll(() =>
      localBackground.evaluate(
        (image) =>
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0 &&
          (image as HTMLImageElement).naturalHeight > 0,
      ),
    )
    .toBe(true)
  await wardrobe.getByRole('button', { name: '奶油苹果斗篷', exact: true }).click()
  await expect(wardrobe.getByRole('button', { name: /选择照片图层：奶油苹果斗篷/u })).toBeVisible()

  const localGeometry = await wardrobe.locator('.miracle-photo-canvas').evaluate((canvas) => {
    const frame = canvas.getBoundingClientRect()
    const preview = canvas.querySelector<HTMLElement>('.photo-composition')!.getBoundingClientRect()
    const image = canvas.querySelector<HTMLImageElement>('.photo-composition__postcard')!
    const imageFrame = image.getBoundingClientRect()
    const stage = canvas.closest<HTMLElement>('.miracle-photo-stage')!.getBoundingClientRect()
    return {
      canvasWidth: frame.width,
      canvasHeight: frame.height,
      previewWidth: preview.width,
      previewHeight: preview.height,
      imageWidth: imageFrame.width,
      imageHeight: imageFrame.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      stageBottom: stage.bottom,
      viewportHeight: window.innerHeight,
    }
  })
  expect(localGeometry.naturalWidth).toBe(480)
  expect(localGeometry.naturalHeight).toBe(720)
  expect(localGeometry.canvasWidth / localGeometry.canvasHeight).toBeCloseTo(2 / 3, 2)
  expect(localGeometry.previewWidth).toBeCloseTo(localGeometry.canvasWidth, 1)
  expect(localGeometry.previewHeight).toBeCloseTo(localGeometry.canvasHeight, 1)
  expect(localGeometry.imageWidth).toBeCloseTo(localGeometry.canvasWidth, 1)
  expect(localGeometry.imageHeight).toBeCloseTo(localGeometry.canvasHeight, 1)
  expect(localGeometry.stageBottom).toBeLessThanOrEqual(localGeometry.viewportHeight)

  const layoutGeometry = await wardrobe.locator('#miracle-panel-photo').evaluate((layout) => {
    const panes = [...layout.children].map((pane) => {
      const target = pane as HTMLElement
      const frame = target.getBoundingClientRect()
      return {
        left: frame.left,
        right: frame.right,
        top: frame.top,
        bottom: frame.bottom,
        clientHeight: target.clientHeight,
        scrollHeight: target.scrollHeight,
      }
    })
    const controls = [
      ...layout.querySelectorAll<HTMLElement>('.miracle-photo-save-row button'),
    ].map((button) => {
      const frame = button.getBoundingClientRect()
      return { top: frame.top, bottom: frame.bottom }
    })
    return {
      panes,
      controls,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      clientHeight: (layout as HTMLElement).clientHeight,
      scrollHeight: (layout as HTMLElement).scrollHeight,
    }
  })
  expect(layoutGeometry.panes).toHaveLength(3)
  for (const pane of layoutGeometry.panes) {
    expect(pane.left).toBeGreaterThanOrEqual(0)
    expect(pane.right).toBeLessThanOrEqual(layoutGeometry.viewportWidth)
    expect(pane.top).toBeGreaterThanOrEqual(0)
    expect(pane.bottom).toBeLessThanOrEqual(layoutGeometry.viewportHeight)
    expect(pane.scrollHeight).toBeLessThanOrEqual(pane.clientHeight + 1)
  }
  expect(layoutGeometry.scrollHeight).toBeLessThanOrEqual(layoutGeometry.clientHeight + 1)
  for (const control of layoutGeometry.controls) {
    expect(control.top).toBeGreaterThanOrEqual(0)
    expect(control.bottom).toBeLessThanOrEqual(layoutGeometry.viewportHeight)
  }

  const downloadPromise = page.waitForEvent('download')
  await wardrobe.getByRole('button', { name: '下载当前合拍' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('奇迹饼狗-本地合拍.png')
  await download.delete()

  await wardrobe.getByRole('button', { name: '改回明信片' }).click()
  await expect(wardrobe.getByRole('button', { name: '保存这张合拍' })).toBeVisible()
  await expect(wardrobe.getByRole('button', { name: '下载当前合拍' })).toHaveCount(0)
  const postcardRatio = await wardrobe.locator('.miracle-photo-canvas').evaluate((canvas) => {
    const frame = canvas.getBoundingClientRect()
    return frame.width / frame.height
  })
  expect(postcardRatio).toBeCloseTo(4 / 3, 2)

  await wardrobe.getByRole('tab', { name: '衣服收藏' }).click()
  const collectionThumbs = wardrobe.locator('.miracle-collection-thumb')
  await expect(collectionThumbs).toHaveCount(24)
  await expect
    .poll(() =>
      collectionThumbs.locator('img').evaluateAll(
        (images) =>
          images.length === 24 &&
          images.every((image) => {
            const target = image as HTMLImageElement
            return target.complete && target.naturalWidth > 0 && target.naturalHeight > 0
          }),
      ),
    )
    .toBe(true)
  const thumbnailGeometry = await collectionThumbs.evaluateAll((thumbs) =>
    thumbs.map((thumb) => {
      const frame = thumb.getBoundingClientRect()
      const image = thumb.querySelector<HTMLImageElement>('img')!.getBoundingClientRect()
      return {
        frame: {
          left: frame.left,
          top: frame.top,
          right: frame.right,
          bottom: frame.bottom,
        },
        image: {
          left: image.left,
          top: image.top,
          right: image.right,
          bottom: image.bottom,
        },
        centerDeltaX: Math.abs(image.left + image.width / 2 - (frame.left + frame.width / 2)),
        centerDeltaY: Math.abs(image.top + image.height / 2 - (frame.top + frame.height / 2)),
      }
    }),
  )
  expect(thumbnailGeometry).toHaveLength(24)
  for (const { frame, image, centerDeltaX, centerDeltaY } of thumbnailGeometry) {
    expect(image.left).toBeGreaterThanOrEqual(frame.left - 1)
    expect(image.top).toBeGreaterThanOrEqual(frame.top - 1)
    expect(image.right).toBeLessThanOrEqual(frame.right + 1)
    expect(image.bottom).toBeLessThanOrEqual(frame.bottom + 1)
    expect(centerDeltaX).toBeLessThanOrEqual(1)
    expect(centerDeltaY).toBeLessThanOrEqual(1)
  }
})
