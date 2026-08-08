import { expect, test, type Locator } from '@playwright/test'

import { openAlbum, openDebugPanel, startGame } from './support/game'

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })

async function imageState(image: Locator) {
  return image.evaluate((element: HTMLImageElement) => ({
    complete: element.complete,
    currentPath: new URL(element.currentSrc).pathname,
    naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight,
    srcset: element.getAttribute('srcset'),
    sizes: element.getAttribute('sizes'),
  }))
}

test('高 DPR 安装后可断网重开，收藏卡片与详情回退到预缓存 480 图', async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '离线安装只在桌面 Chromium 重复验证一次')
  test.setTimeout(120_000)

  await page.goto('./')
  await page.getByRole('textbox', { name: '想让饼狗怎么称呼你？' }).fill('离线测试')
  await expect(page.getByRole('button', { name: '开始新旅程' })).toBeEnabled()
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration()
          return registration?.active?.state ?? null
        }),
      { timeout: 60_000 },
    )
    .toBe('activated')
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)

  const cached = await page.evaluate(async () => {
    const base = new URL('.', location.href)
    const hasMatch = async (path: string) =>
      Boolean(await caches.match(new URL(path, base).href, { ignoreSearch: true }))
    return {
      fallback480: await hasMatch('assets/collectibles/million-shots/million-shot-108-480.webp'),
      highResolution: await hasMatch('assets/collectibles/million-shots/million-shot-108-800.webp'),
    }
  })
  expect(cached).toEqual({ fallback480: true, highResolution: false })

  await context.setOffline(true)
  try {
    await page.reload()
    await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
    const titleRoom = page.getByRole('img', { name: '阳光下温暖的两层铲铲饼屋' })
    await expect(titleRoom).toHaveJSProperty('complete', true)
    await expect
      .poll(() => imageState(titleRoom))
      .toMatchObject({
        currentPath: '/AllForSUXINHAO/TravellingBingo/assets/game/chan-chan-house-v2-1098.webp',
        complete: true,
      })
    const titleImage = await imageState(titleRoom)
    expect(titleImage.naturalWidth).toBeGreaterThan(0)
    expect(titleImage.naturalHeight).toBeGreaterThan(0)
    expect(titleImage.naturalWidth / titleImage.naturalHeight).toBeCloseTo(1098 / 1433, 2)

    await startGame(page, { debug: true, displayName: '离线测试', seed: 'offline-hi-dpr' })
    const gameRoom = page.getByRole('img', { name: /纵向展开的两层铲铲饼屋/u })
    await expect
      .poll(() => imageState(gameRoom))
      .toMatchObject({
        currentPath: '/AllForSUXINHAO/TravellingBingo/assets/game/chan-chan-house-v2-1098.webp',
        complete: true,
      })
    const gameImage = await imageState(gameRoom)
    expect(gameImage.naturalWidth).toBeGreaterThan(0)
    expect(gameImage.naturalHeight).toBeGreaterThan(0)
    expect(gameImage.naturalWidth / gameImage.naturalHeight).toBeCloseTo(1098 / 1433, 2)

    await openDebugPanel(page)
    await page.getByRole('button', { name: '一键全收集', exact: true }).click()
    const collectAll = page.getByRole('group', { name: '确认一键全收集' })
    await collectAll.getByRole('button', { name: '确认全收集' }).click()

    const album = await openAlbum(page)
    await album.getByRole('tab', { name: '百万直拍' }).click()
    const survivorsCard = album.getByRole('button', {
      name: /Survivors，百万直拍，打开详情/u,
    })
    await survivorsCard.scrollIntoViewIfNeeded()
    const cardImage = survivorsCard.locator('img')
    await expect
      .poll(() => imageState(cardImage))
      .toMatchObject({
        complete: true,
        currentPath:
          '/AllForSUXINHAO/TravellingBingo/assets/collectibles/million-shots/million-shot-108-480.webp',
        srcset: null,
        sizes: null,
      })
    const cardImageState = await imageState(cardImage)
    expect(cardImageState.naturalWidth).toBeGreaterThan(0)
    expect(cardImageState.naturalHeight).toBeGreaterThan(0)
    expect(cardImageState.naturalWidth / cardImageState.naturalHeight).toBeCloseTo(2 / 3, 2)

    await survivorsCard.click()
    const detail = page.getByRole('dialog', { name: 'Survivors' })
    const detailImage = detail.getByRole('img', { name: /Survivors/u })
    await expect
      .poll(() => imageState(detailImage))
      .toMatchObject({
        complete: true,
        currentPath:
          '/AllForSUXINHAO/TravellingBingo/assets/collectibles/million-shots/million-shot-108-480.webp',
        srcset: null,
        sizes: null,
      })
    const detailImageState = await imageState(detailImage)
    expect(detailImageState.naturalWidth).toBeGreaterThan(0)
    expect(detailImageState.naturalHeight).toBeGreaterThan(0)
    expect(detailImageState.naturalWidth / detailImageState.naturalHeight).toBeCloseTo(2 / 3, 2)

    const brokenImages = await page
      .locator('img')
      .evaluateAll(
        (images) =>
          images.filter(
            (image) =>
              !(image as HTMLImageElement).complete ||
              (image as HTMLImageElement).naturalWidth === 0,
          ).length,
      )
    expect(brokenImages).toBe(0)
  } finally {
    await context.setOffline(false)
  }
})
