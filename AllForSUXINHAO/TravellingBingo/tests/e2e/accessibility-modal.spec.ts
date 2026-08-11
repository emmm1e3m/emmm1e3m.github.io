import { expect, test, type Page } from '@playwright/test'

import {
  expectElementWithinViewport,
  expectMinimumTouchTarget,
  expectNoHorizontalOverflow,
  openAlbum,
  openDebugPanel,
  saveScreenshot,
  startGame,
} from './support/game'

async function expectMobileRealityAndTrendRestriction(page: Page) {
  const toggle = page.getByRole('button', { name: '切换到现实生活维度' })
  await toggle.click()
  const dialog = page.getByRole('dialog', { name: '进入现实维度？' })
  const backdrop = page.locator('.dimension-dialog-backdrop')
  await expect(backdrop).toHaveCount(1)
  await expect(backdrop).toHaveCSS('position', 'fixed')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toContainText('也可以进行真正的刷播和冲热')
  await expect(dialog).not.toContainText(/鼠标|触控板|指针/u)

  const geometry = await backdrop.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      parentTag: element.parentElement?.tagName,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }
  })
  expect(geometry.parentTag).toBe('MAIN')
  expect(Math.abs(geometry.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.width - geometry.viewportWidth)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.height - geometry.viewportHeight)).toBeLessThanOrEqual(1)

  const heading = dialog.getByRole('heading', { name: '进入现实维度？' })
  const confirmButton = dialog.getByRole('button', { name: '进入现实维度' })
  await expectElementWithinViewport(dialog)
  await expectElementWithinViewport(heading)
  await expect(confirmButton).toBeFocused()
  await expectMinimumTouchTarget(confirmButton, '现实维度确认按钮')

  const typography = await dialog.evaluate((element) => ({
    titleSize: Number.parseFloat(getComputedStyle(element.querySelector('h2')!).fontSize),
    bodySize: Number.parseFloat(getComputedStyle(element.querySelector('p')!).fontSize),
    buttonSize: Number.parseFloat(getComputedStyle(element.querySelector('button')!).fontSize),
  }))
  expect(typography.titleSize).toBeGreaterThanOrEqual(20)
  expect(typography.bodySize).toBeGreaterThanOrEqual(14)
  expect(typography.buttonSize).toBeGreaterThanOrEqual(14)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(toggle).toBeFocused()

  await toggle.click()
  await page
    .getByRole('dialog', { name: '进入现实维度？' })
    .getByRole('button', { name: '进入现实维度' })
    .click()
  const trend = page.locator('[data-hotspot="二楼电脑·冲热"]')
  await expect(trend).toBeVisible()
  await trend.click()
  const trendDialog = page.getByRole('dialog', { name: '冲热请使用电脑端' })
  await expect(trendDialog).toContainText('可以先使用刷播，或为工作与学习计时')
  await expect(trendDialog).not.toContainText(/鼠标|触控板|指针/u)
  await trendDialog.getByRole('button', { name: '知道了' }).click()
}

test.describe('375 × 667 移动端可访问性', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '只在移动 Chromium 项目验证')
    await startGame(page, { debug: true, displayName: '手机测试', seed: 'portal-375' })
  })

  test('冰箱面板可以滚到两种瓶装魔法，且七种道具都有 emoji', async ({ page }) => {
    test.setTimeout(90_000)
    await page.locator('[data-hotspot="冰箱"]').click()
    const panel = page.locator('.context-panel--fridge')
    const scroller = panel.locator('.context-content')
    const lastShopItem = panel.locator('.shop-item').filter({ hasText: '瓶装活力魔法' })
    await expect(panel).toBeVisible()

    const before = await scroller.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }))
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight)
    await lastShopItem.scrollIntoViewIfNeeded()
    const after = await scroller.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }))
    expect(after.scrollTop).toBeGreaterThan(0)
    expect(after.scrollTop).toBeLessThanOrEqual(after.scrollHeight - after.clientHeight)
    await expect(lastShopItem).toBeInViewport()
    await expect(lastShopItem.getByText('瓶装活力魔法', { exact: true })).toBeVisible()
    await expect(lastShopItem.locator('.shop-item__emoji')).toHaveText('✨')
    const speedMagic = panel.locator('.shop-item').filter({ hasText: '瓶装速度魔法' })
    await expect(speedMagic.locator('.shop-item__emoji')).toHaveText('⚡')
    await expect(panel.locator('.shop-item')).toHaveCount(7)
    const itemEmojis = await panel.locator('.shop-item__emoji').allTextContents()
    expect(itemEmojis.every((emoji) => emoji.trim().length > 0)).toBe(true)
    await expectNoHorizontalOverflow(page)
    await saveScreenshot(page, 'mobile-375x667-fridge.png')
  })

  test('空收藏墙圈定焦点、屏蔽背景并在 Escape 后恢复入口焦点', async ({ page }) => {
    const gameHeader = page.locator('.game-hud')
    const opener = gameHeader.getByRole('button', { name: '打开收藏墙' })
    const dialog = await openAlbum(page)
    const close = dialog.getByRole('button', { name: '关闭收藏墙' })
    await expect(close).toBeFocused()
    await expect(gameHeader).toHaveAttribute('inert', '')
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    await expect(dialog).toContainText('收藏墙还空着')
    await expect(dialog).toContainText('惊喜会在相遇时悄悄出现。')

    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
    await expect(gameHeader).not.toHaveAttribute('inert', '')
  })
})

for (const viewport of [
  { width: 375, height: 667, label: '375 × 667' },
  { width: 390, height: 844, label: '390 × 844' },
] as const) {
  test(`${viewport.label} 移动浏览器可进入现实维度且冲热单独限制电脑端`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '只在移动 Chromium 项目验证')
    await page.setViewportSize(viewport)
    await startGame(page, {
      debug: true,
      displayName: `PC提示${viewport.width}`,
      seed: `pc-only-${viewport.width}`,
    })

    const hud = page.locator('.game-hud--v4')
    await expectMinimumTouchTarget(hud.locator('.apple-counter'), 'HUD 苹果按钮')
    await expectMinimumTouchTarget(hud.locator('.hud-icon--album'), 'HUD 收藏墙按钮')
    await expectMinimumTouchTarget(hud.locator('.debug-chip'), 'HUD DEBUG 按钮')
    await expectMobileRealityAndTrendRestriction(page)
    await expectNoHorizontalOverflow(page)
    await saveScreenshot(page, `mobile-${viewport.width}x${viewport.height}-pc-only.png`, false)
  })
}

test.describe('390 × 844 移动端完整房间', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('标题、HUD、房屋帮助和侧栏均无横向溢出', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '只在移动 Chromium 项目验证')
    await page.goto('./')
    await expectNoHorizontalOverflow(page)
    await page.getByRole('button', { name: '全新旅程' }).click()
    const newJourneyDialog = page.getByRole('dialog', { name: '开启一段全新的旅程' })
    await newJourneyDialog.getByLabel('如何称呼你？').fill('三九零')
    await newJourneyDialog.getByRole('button', { name: '开始全新旅程' }).click()
    await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const help = page.getByRole('button', { name: '查看房屋玩法说明' })
    await expectElementWithinViewport(help)
    await help.click()
    const helpDialog = page.getByRole('dialog', { name: '怎么陪饼狗玩' })
    await expect(helpDialog).toBeVisible()
    await expectElementWithinViewport(helpDialog)
    await helpDialog.getByRole('button', { name: '知道啦' }).click()

    await page.locator('[data-hotspot="电脑"]').click()
    await expect(page.locator('.context-panel--computer')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await saveScreenshot(page, 'mobile-390x844-computer.png')
  })

  test('收藏详情保持 9:16，详情与完整预览都留白完整显示', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '只在移动 Chromium 项目验证')
    await startGame(page, { debug: true, displayName: '移动收藏', seed: 'mobile-album-v4' })
    await openDebugPanel(page)
    await page.getByRole('button', { name: '一键全收集', exact: true }).click()
    await page
      .getByRole('group', { name: '确认一键全收集' })
      .getByRole('button', { name: '确认全收集' })
      .click()

    const album = await openAlbum(page)
    await album.getByRole('tab', { name: '百万直拍' }).click()
    const survivors = album.getByRole('button', {
      name: /Survivors，百万直拍，打开详情/u,
    })
    await survivors.scrollIntoViewIfNeeded()
    await page.route('https://player.bilibili.com/**', async (route) => route.abort())
    await survivors.click()

    const detailDialog = page.getByRole('dialog', { name: 'Survivors' })
    const viewport = page.viewportSize()
    const backdropBox = await detailDialog.boundingBox()
    expect(viewport).not.toBeNull()
    expect(backdropBox).not.toBeNull()
    expect(backdropBox!.x).toBeCloseTo(0, 0)
    expect(backdropBox!.y).toBeCloseTo(0, 0)
    expect(backdropBox!.width).toBeGreaterThanOrEqual(viewport!.width - 1)
    expect(backdropBox!.height).toBeGreaterThanOrEqual(viewport!.height - 1)

    const detail = detailDialog.locator('.collectible-detail--v4')
    const detailBox = await detail.boundingBox()
    expect(detailBox).not.toBeNull()
    expect(detailBox!.width / detailBox!.height).toBeCloseTo(9 / 16, 2)
    await expectElementWithinViewport(detail)
    await expect(detailDialog.getByRole('button', { name: '关闭详情' })).toBeInViewport()
    await expect(detail.locator('.collectible-detail__image img')).toHaveCSS(
      'object-fit',
      'contain',
    )
    await expect(detail.locator('.collectible-detail__copy')).toHaveCSS('scrollbar-width', 'none')
    await expectNoHorizontalOverflow(page)

    const player = page.getByTestId('persistent-bilibili-player')
    await expectElementWithinViewport(player)
    const expandedPlayerBox = await player.boundingBox()
    expect(expandedPlayerBox).not.toBeNull()
    await player.getByRole('button', { name: '隐藏画面' }).click()
    await expect(player).toHaveAttribute('data-dock-state', 'collapsed')
    const collapsedPlayerBox = await player.boundingBox()
    expect(collapsedPlayerBox).not.toBeNull()
    expect(Math.abs(collapsedPlayerBox!.width - expandedPlayerBox!.width)).toBeLessThan(0.5)
    await player.getByRole('button', { name: '显示画面' }).click()
    await expect(player).toHaveAttribute('data-dock-state', 'expanded')

    await detailDialog.getByRole('button', { name: '全屏查看Survivors' }).click()
    const fullscreen = page.getByRole('dialog', { name: 'Survivors完整图片' })
    await expect(fullscreen.locator('.collectible-fullscreen__image')).toHaveCSS(
      'object-fit',
      'contain',
    )
    await expect(fullscreen.getByRole('link', { name: '下载完整图片' })).toHaveAttribute(
      'download',
      /million-shot-108\.webp$/u,
    )
    await saveScreenshot(page, 'mobile-390x844-survivors-detail.png', false)
  })
})
