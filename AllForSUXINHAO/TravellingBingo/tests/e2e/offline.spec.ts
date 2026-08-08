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
    await expect(page.getByRole('img', { name: '阳光下的两层铲铲饼屋' })).toHaveJSProperty(
      'complete',
      true,
    )

    await page.getByRole('button', { name: '开始新旅程' }).click()
    await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
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
