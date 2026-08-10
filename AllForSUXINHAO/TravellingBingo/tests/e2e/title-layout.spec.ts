import { expect, test, type Page } from '@playwright/test'

import { saveScreenshot, startGame } from './support/game'

async function readHorizontalMetrics(page: Page) {
  return page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    title: document.querySelector<HTMLElement>('.title-page')?.scrollWidth ?? 0,
  }))
}

async function expectNoTitleOverflow(page: Page) {
  const metrics = await readHorizontalMetrics(page)
  expect(metrics.document).toBeLessThanOrEqual(metrics.viewport)
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport)
  expect(metrics.title).toBeLessThanOrEqual(metrics.viewport)
}

async function expectDesktopControlsInOneRow(page: Page) {
  const entryButtons = page
    .getByRole('navigation', { name: '存档入口' })
    .locator(':scope > .landing-button')
  await expect(entryButtons).toHaveCount(3)
  const updateButton = page
    .getByRole('region', { name: '检查游戏更新' })
    .getByRole('button', { name: '检查更新' })
  await expect(updateButton).toBeVisible()

  const boxes = await Promise.all([
    entryButtons.nth(0).boundingBox(),
    entryButtons.nth(1).boundingBox(),
    entryButtons.nth(2).boundingBox(),
    updateButton.boundingBox(),
  ])
  expect(boxes.every(Boolean)).toBe(true)
  const tops = boxes.map((box) => box?.y ?? 0)
  const heights = boxes.map((box) => box?.height ?? 0)
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1)
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)

  const cacheBox = await page.getByRole('region', { name: '缓存存档摘要' }).boundingBox()
  const updateBox = await updateButton.boundingBox()
  expect(cacheBox).not.toBeNull()
  expect(updateBox).not.toBeNull()
  expect(
    Math.abs(
      (cacheBox?.x ?? 0) + (cacheBox?.width ?? 0) - ((updateBox?.x ?? 0) + (updateBox?.width ?? 0)),
    ),
  ).toBeLessThanOrEqual(1)
  await expectNoTitleOverflow(page)
}

test.describe('标题页布局与选择契约', () => {
  test('桌面缓存入口与检查更新严格同排，且不靠裁切隐藏横向溢出', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', '桌面标题页只在 Desktop Chromium 验证')
    await page.setViewportSize({ width: 1440, height: 900 })
    await startGame(page, { seed: 'title-layout-cache', displayName: '标题页验收' })
    await page.getByRole('button', { name: '离开铲铲饼屋' }).click()
    await page.evaluate(() => document.fonts.ready)

    await expectDesktopControlsInOneRow(page)
    await saveScreenshot(page, 'title-layout-desktop.png', false)

    await page.setViewportSize({ width: 1024, height: 768 })
    await expectDesktopControlsInOneRow(page)
    await saveScreenshot(page, 'title-layout-desktop-1024.png', false)
  })

  test('移动端可合理换行，普通文字不可选择而输入框仍可编辑选择', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '移动标题页只在 Pixel 7 Chromium 验证')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('./')
    await page.evaluate(() => document.fonts.ready)

    await expectNoTitleOverflow(page)

    await expect(page.getByRole('navigation', { name: '存档入口' })).toBeVisible()
    await expect(page.getByRole('region', { name: '检查游戏更新' })).toBeVisible()
    expect(
      await page
        .locator('.landing-intro')
        .evaluate((element) => getComputedStyle(element).userSelect),
    ).toBe('none')
    await saveScreenshot(page, 'title-layout-mobile.png', false)

    await page.getByRole('button', { name: '全新旅程' }).click()
    const input = page.getByRole('textbox', { name: '如何称呼你？' })
    await expect(input).toBeVisible()
    expect(await input.evaluate((element) => getComputedStyle(element).userSelect)).toBe('text')

    const glow = page.locator('.landing-glow')
    expect(await glow.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      'landing-glow-drift',
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await glow.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  })
})
