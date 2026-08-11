import { expect, test, type Locator, type Page } from '@playwright/test'

import { expectElementWithinViewport, openAlbum, startGame } from './support/game'

const BROWSER_SAVE_KEY = 'travelling-bingo:browser-save:v1'

async function waitForLoadedPreviewImages(scope: Locator) {
  await expect
    .poll(() =>
      scope.locator('img').evaluateAll(
        (images) =>
          images.length > 0 &&
          images.every((image) => {
            const target = image as HTMLImageElement
            return target.complete && target.naturalWidth > 0 && target.naturalHeight > 0
          }),
      ),
    )
    .toBe(true)
}

async function injectAlbumPhotos(page: Page) {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, BROWSER_SAVE_KEY))
    .toBe(true)

  await page.evaluate((key) => {
    const cache = JSON.parse(localStorage.getItem(key)!) as {
      payload: {
        collections: Record<string, unknown>
        wardrobe: {
          nextPhotoSequence: number
          photos: Record<string, unknown>
        }
      }
    }
    cache.payload.collections['postcard-2025-01-0002'] = {
      id: 'postcard-2025-01-0002',
      firstObtainedAt: Date.UTC(2026, 7, 10, 10),
      duplicateCount: 0,
    }
    cache.payload.collections['postcard-2025-05-0014'] = {
      id: 'postcard-2025-05-0014',
      firstObtainedAt: Date.UTC(2026, 7, 11, 10),
      duplicateCount: 0,
    }
    cache.payload.wardrobe.nextPhotoSequence = 3
    cache.payload.wardrobe.photos = {
      'photo-1-e2eland': {
        photoId: 'photo-1-e2eland',
        postcardId: 'postcard-2025-01-0002',
        createdAt: Date.UTC(2026, 7, 10, 12),
        participants: [
          {
            targetId: 'bingo',
            sourceLookId: null,
            x: 0.5,
            y: 0.58,
            scaleX: 0.32,
            scaleY: 0.32,
            rotation: 0,
            z: 1,
            elements: [],
          },
        ],
        decorations: [],
      },
      'photo-2-e2eport': {
        photoId: 'photo-2-e2eport',
        postcardId: 'postcard-2025-05-0014',
        createdAt: Date.UTC(2026, 7, 11, 12),
        participants: [
          {
            targetId: 'bingo',
            sourceLookId: null,
            x: 0.5,
            y: 0.58,
            scaleX: 0.32,
            scaleY: 0.32,
            rotation: 0,
            z: 1,
            elements: [],
          },
        ],
        decorations: [],
      },
    }
    localStorage.setItem(key, JSON.stringify(cache))
  }, BROWSER_SAVE_KEY)

  await page.reload()
  await page.getByRole('button', { name: '继续' }).click()
  await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
}

test('合拍相册网格统一裁切，详情按原照片比例自适应', async ({ page }) => {
  await startGame(page, { seed: 'album-photo-layout-e2e', displayName: '合拍验收' })
  await injectAlbumPhotos(page)

  const album = await openAlbum(page)
  await album.getByRole('tab', { name: /合拍相册\s*【2】/u }).click()

  const cards = album.locator('.wardrobe-photo-card')
  const previews = cards.locator('.wardrobe-photo-card__preview')
  await expect(cards).toHaveCount(2)
  await expect(previews).toHaveCount(2)
  await expect(previews.nth(0)).toHaveClass(/photo-composition--cover/u)
  await expect(previews.nth(1)).toHaveClass(/photo-composition--cover/u)
  await waitForLoadedPreviewImages(previews)

  const [firstCardBox, secondCardBox, firstBox, secondBox] = await Promise.all([
    cards.nth(0).boundingBox(),
    cards.nth(1).boundingBox(),
    previews.nth(0).boundingBox(),
    previews.nth(1).boundingBox(),
  ])
  expect(firstCardBox).not.toBeNull()
  expect(secondCardBox).not.toBeNull()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  expect(Math.abs(firstCardBox!.width - secondCardBox!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(firstCardBox!.height - secondCardBox!.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(firstBox!.width - secondBox!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(firstBox!.height - secondBox!.height)).toBeLessThanOrEqual(1)
  expect(firstBox!.width / firstBox!.height).toBeCloseTo(4 / 3, 2)

  const portraitCard = cards.filter({ has: page.locator('[data-photo-id="photo-2-e2eport"]') })
  const portraitPreview = portraitCard.locator('.wardrobe-photo-card__preview')
  const [portraitFrameBox, portraitCanvasBox] = await Promise.all([
    portraitPreview.boundingBox(),
    portraitPreview.locator('.photo-composition__canvas').boundingBox(),
  ])
  expect(portraitFrameBox).not.toBeNull()
  expect(portraitCanvasBox).not.toBeNull()
  expect(portraitCanvasBox!.height).toBeGreaterThan(portraitFrameBox!.height)
  await portraitCard.click()
  const detail = page.getByRole('dialog', { name: '奇迹合拍' })
  const detailPreview = detail.locator('.wardrobe-photo-detail__preview')
  await expect(detailPreview).toHaveClass(/photo-composition--natural/u)
  await waitForLoadedPreviewImages(detailPreview)
  await expectElementWithinViewport(detail.locator('.wardrobe-photo-detail'))

  const detailGeometry = await detailPreview.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const canvasBox = element.querySelector('.photo-composition__canvas')?.getBoundingClientRect()
    const panel = element.closest<HTMLElement>('.wardrobe-photo-detail')
    return {
      width: box.width,
      height: box.height,
      canvasWidth: canvasBox?.width ?? 0,
      canvasHeight: canvasBox?.height ?? 0,
      sourceWidth: Number(panel?.style.getPropertyValue('--wardrobe-photo-width')),
      sourceHeight: Number(panel?.style.getPropertyValue('--wardrobe-photo-height')),
    }
  })
  expect(detailGeometry.sourceWidth).toBe(960)
  expect(detailGeometry.sourceHeight).toBe(1440)
  expect(detailGeometry.width / detailGeometry.height).toBeCloseTo(
    detailGeometry.sourceWidth / detailGeometry.sourceHeight,
    2,
  )
  expect(Math.abs(detailGeometry.canvasWidth - detailGeometry.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(detailGeometry.canvasHeight - detailGeometry.height)).toBeLessThanOrEqual(1)
})
