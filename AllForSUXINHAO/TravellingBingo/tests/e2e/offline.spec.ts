import { expect, test } from '@playwright/test'

test('安装后可断网重开并进入铲铲饼屋', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '离线安装只在桌面项目重复验证一次')

  await page.goto('./')
  await expect(page.getByRole('button', { name: '开始新旅程' })).toBeEnabled()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)

  await context.setOffline(true)
  try {
    await page.reload()
    await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
    await expect(page.getByRole('button', { name: '开始新旅程' })).toBeEnabled()
    const titleRoom = page.getByRole('img', { name: '阳光下温暖的两层铲铲饼屋' })
    await expect(titleRoom).toHaveJSProperty('complete', true)
    const titleImage = await titleRoom.evaluate((image: HTMLImageElement) => ({
      currentSrc: image.currentSrc,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }))
    expect(titleImage.currentSrc).toMatch(/chan-chan-house-v2-(?:768|1098)\.webp$/u)
    expect(titleImage.naturalWidth / titleImage.naturalHeight).toBeCloseTo(1098 / 1433, 2)

    await expect
      .poll(() =>
        page.evaluate(async () => {
          await document.fonts.ready
          return {
            display: document.fonts.check('16px "TravellingBingo Display"', '旅行饼狗'),
            ui: document.fonts.check('16px "TravellingBingo UI"', '开始新旅程'),
            bodyFamily: getComputedStyle(document.body).fontFamily,
            titleFamily: getComputedStyle(document.querySelector('.landing-logo')!).fontFamily,
          }
        }),
      )
      .toMatchObject({
        display: true,
        ui: true,
        bodyFamily: expect.stringContaining('TravellingBingo UI'),
        titleFamily: expect.stringContaining('TravellingBingo Display'),
      })

    await page.getByRole('button', { name: '开始新旅程' }).click()
    await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
    const gameRoom = page.getByRole('img', { name: /纵向展开的两层铲铲饼屋/u })
    await expect(gameRoom).toHaveJSProperty('complete', true)
    const gameImage = await gameRoom.evaluate((image: HTMLImageElement) => ({
      currentSrc: image.currentSrc,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }))
    expect(gameImage.currentSrc).toMatch(/chan-chan-house-v2-(?:768|1098)\.webp$/u)
    expect(gameImage.naturalWidth / gameImage.naturalHeight).toBeCloseTo(1098 / 1433, 2)

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
