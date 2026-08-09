import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  expectElementWithinViewport,
  expectMinimumTouchTarget,
  expectNoHorizontalOverflow,
  openAlbum,
  openDebugPanel,
  saveScreenshot,
  startGame,
} from './support/game'

async function expectV4PortalDialog(
  page: Page,
  dialog: Locator,
  title: string,
  safeButtonName: string,
  confirmButtonName: string,
) {
  const backdrop = page.locator('body > .reality-dialog-backdrop--v4')
  await expect(backdrop).toHaveCount(1)
  await expect(backdrop).toHaveCSS('position', 'fixed')
  await expect(backdrop).toHaveCSS('font-family', /TravellingBingo UI/u)
  await expect(dialog).toHaveAttribute('aria-modal', 'true')

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
  expect(geometry.parentTag).toBe('BODY')
  expect(Math.abs(geometry.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.width - geometry.viewportWidth)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.height - geometry.viewportHeight)).toBeLessThanOrEqual(1)

  const heading = dialog.getByRole('heading', { name: title })
  const safeButton = dialog.getByRole('button', { name: safeButtonName })
  const confirmButton = dialog.getByRole('button', { name: confirmButtonName })
  await expectElementWithinViewport(dialog)
  await expectElementWithinViewport(heading)
  await expectElementWithinViewport(safeButton)
  await expect(safeButton).toBeFocused()
  await expectMinimumTouchTarget(safeButton, `${title}安全按钮`)
  await expectMinimumTouchTarget(confirmButton, `${title}确认按钮`)

  const typography = await dialog.evaluate((element) => ({
    titleSize: Number.parseFloat(getComputedStyle(element.querySelector('h2')!).fontSize),
    bodySize: Number.parseFloat(getComputedStyle(element.querySelector('p')!).fontSize),
    buttonSize: Number.parseFloat(getComputedStyle(element.querySelector('button')!).fontSize),
  }))
  expect(typography.titleSize).toBeGreaterThanOrEqual(21)
  expect(typography.bodySize).toBeGreaterThanOrEqual(14)
  expect(typography.buttonSize).toBeGreaterThanOrEqual(14)

  await page.keyboard.press('Shift+Tab')
  await expect(confirmButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(safeButton).toBeFocused()
}

async function installDefaultNotificationPermission(page: Page) {
  await page.addInitScript(() => {
    if (!('Notification' in globalThis)) return
    Object.defineProperty(globalThis.Notification, 'permission', {
      configurable: true,
      get: () => 'default',
    })
  })
}

async function exerciseWorkPortalFlow(page: Page, screenshotName: string) {
  const hud = page.locator('.game-hud--v4')
  await expectMinimumTouchTarget(hud.locator('.apple-counter'), 'HUD 苹果按钮')
  await expectMinimumTouchTarget(hud.locator('.hud-icon--album'), 'HUD 收藏墙按钮')
  const debugButton = hud.locator('.debug-chip')
  if ((await debugButton.count()) > 0) {
    await expectMinimumTouchTarget(debugButton, 'HUD DEBUG 按钮')
  }

  const closePanel = page.getByRole('button', { name: '收起信息栏' })
  if (await closePanel.isVisible()) {
    await closePanel.click()
    await expect(closePanel).toBeHidden()
  }

  const dimensionButton = page.getByRole('button', { name: '切换到现实生活维度' })
  await expect(async () => {
    const updatePrompt = page.locator('.pwa-update-prompt')
    if (await updatePrompt.isVisible()) {
      await updatePrompt.getByRole('button', { name: /^(收好啦|晚点再看)$/u }).click()
    }
    await dimensionButton.click({ timeout: 2_000 })
  }).toPass({ timeout: 10_000 })
  await page.locator('[data-hotspot="一楼电脑"]').click()
  const workPanel = page.locator('.context-panel--reality-work')
  await expect(workPanel).toBeVisible()

  const notificationButton = workPanel.getByRole('button', { name: '开启完成提醒' })
  await notificationButton.scrollIntoViewIfNeeded()
  await expectMinimumTouchTarget(notificationButton, '完成提醒按钮')

  const newTodo = workPanel.getByLabel('新待办')
  await newTodo.fill('移动端弹窗测试')
  await workPanel.getByRole('button', { name: '添加' }).click()
  const todo = workPanel.getByRole('list', { name: '现实生活待办' }).getByRole('listitem')
  await expect(todo).toContainText('移动端弹窗测试')

  const fiveMinutes = workPanel
    .getByRole('group', { name: '苹果钟时长' })
    .getByRole('button', { name: /^5 分钟/u })
  await fiveMinutes.click()
  const startButton = workPanel.getByRole('button', { name: '开始苹果钟' })
  await startButton.scrollIntoViewIfNeeded()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
  await startButton.click()

  const startDialog = page.getByRole('alertdialog', { name: '确认开始苹果钟？' })
  await expectV4PortalDialog(page, startDialog, '确认开始苹果钟？', '再想想', '确认开始')
  await page.keyboard.press('Escape')
  await expect(startDialog).toBeHidden()
  await expect(startButton).toBeFocused()

  await startButton.click()
  await page
    .getByRole('alertdialog', { name: '确认开始苹果钟？' })
    .getByRole('button', { name: '确认开始' })
    .click()
  const cancelButton = workPanel.getByRole('button', { name: '取消本次计时' })
  await cancelButton.scrollIntoViewIfNeeded()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
  await cancelButton.click()

  const cancelDialog = page.getByRole('alertdialog', { name: '确认取消苹果钟？' })
  await expectV4PortalDialog(page, cancelDialog, '确认取消苹果钟？', '继续专注', '确认取消')
  await page.keyboard.press('Escape')
  await expect(cancelDialog).toBeHidden()
  await expect(cancelButton).toBeFocused()

  await cancelButton.click()
  await page
    .getByRole('alertdialog', { name: '确认取消苹果钟？' })
    .getByRole('button', { name: '确认取消' })
    .click()
  await expect(cancelButton).toHaveCount(0)

  const deleteButton = todo.getByRole('button', { name: '删除' })
  await deleteButton.scrollIntoViewIfNeeded()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
  await deleteButton.click()
  const deleteDialog = page.getByRole('alertdialog', { name: '确认删除这条待办？' })
  await expectV4PortalDialog(page, deleteDialog, '确认删除这条待办？', '先不删除', '确认删除')
  await page.keyboard.press('Escape')
  await expect(deleteDialog).toBeHidden()
  await expect(deleteButton).toBeFocused()

  await deleteButton.click()
  await page
    .getByRole('alertdialog', { name: '确认删除这条待办？' })
    .getByRole('button', { name: '确认删除' })
    .click()
  await expect(todo).toHaveCount(0)
  await expect(newTodo).toBeFocused()
  await expectNoHorizontalOverflow(page)
  await saveScreenshot(page, screenshotName, false)
}

test.describe('375 × 667 移动端可访问性', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '只在移动 Chromium 项目验证')
    await installDefaultNotificationPermission(page)
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
    await exerciseWorkPortalFlow(page, 'mobile-375x667-work-portals.png')
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
  test(`${viewport.label} 下滚后的苹果钟开始、取消与待办删除弹窗覆盖视口`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '只在移动 Chromium 项目验证')
    test.setTimeout(90_000)
    await page.setViewportSize(viewport)
    await page.addInitScript(() => {
      if (!('Notification' in globalThis)) return
      Object.defineProperty(globalThis.Notification, 'permission', {
        configurable: true,
        get: () => 'default',
      })
    })
    await startGame(page, {
      debug: true,
      displayName: `Portal${viewport.width}`,
      seed: `portal-${viewport.width}`,
    })

    const hud = page.locator('.game-hud--v4')
    await expectMinimumTouchTarget(hud.locator('.apple-counter'), 'HUD 苹果按钮')
    await expectMinimumTouchTarget(hud.locator('.hud-icon--album'), 'HUD 收藏墙按钮')
    await expectMinimumTouchTarget(hud.locator('.debug-chip'), 'HUD DEBUG 按钮')

    await page.getByRole('button', { name: '切换到现实生活维度' }).click()
    await page.locator('[data-hotspot="一楼电脑"]').click()
    const workPanel = page.locator('.context-panel--reality-work')
    await expect(workPanel).toBeVisible()

    const notificationButton = workPanel.getByRole('button', { name: '开启完成提醒' })
    await notificationButton.scrollIntoViewIfNeeded()
    await expectMinimumTouchTarget(notificationButton, '完成提醒按钮')

    const newTodo = workPanel.getByLabel('新待办')
    await newTodo.fill('移动端弹窗测试')
    await workPanel.getByRole('button', { name: '添加' }).click()
    const todo = workPanel.getByRole('list', { name: '现实生活待办' }).getByRole('listitem')
    await expect(todo).toContainText('移动端弹窗测试')

    const fiveMinutes = workPanel
      .getByRole('group', { name: '苹果钟时长' })
      .getByRole('button', { name: /^5 分钟/u })
    await fiveMinutes.click()
    const startButton = workPanel.getByRole('button', { name: '开始苹果钟' })
    await startButton.scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
    await startButton.click()

    const startDialog = page.getByRole('alertdialog', { name: '确认开始苹果钟？' })
    await expectV4PortalDialog(page, startDialog, '确认开始苹果钟？', '再想想', '确认开始')
    await page.keyboard.press('Escape')
    await expect(startDialog).toBeHidden()
    await expect(startButton).toBeFocused()

    await startButton.click()
    await page
      .getByRole('alertdialog', { name: '确认开始苹果钟？' })
      .getByRole('button', { name: '确认开始' })
      .click()
    const cancelButton = workPanel.getByRole('button', { name: '取消本次计时' })
    await cancelButton.scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
    await cancelButton.click()

    const cancelDialog = page.getByRole('alertdialog', { name: '确认取消苹果钟？' })
    await expectV4PortalDialog(page, cancelDialog, '确认取消苹果钟？', '继续专注', '确认取消')
    await page.keyboard.press('Escape')
    await expect(cancelDialog).toBeHidden()
    await expect(cancelButton).toBeFocused()

    await cancelButton.click()
    await page
      .getByRole('alertdialog', { name: '确认取消苹果钟？' })
      .getByRole('button', { name: '确认取消' })
      .click()
    await expect(cancelButton).toHaveCount(0)

    const deleteButton = todo.getByRole('button', { name: '删除' })
    await deleteButton.scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
    await deleteButton.click()
    const deleteDialog = page.getByRole('alertdialog', { name: '确认删除这条待办？' })
    await expectV4PortalDialog(page, deleteDialog, '确认删除这条待办？', '先不删除', '确认删除')
    await page.keyboard.press('Escape')
    await expect(deleteDialog).toBeHidden()
    await expect(deleteButton).toBeFocused()

    await deleteButton.click()
    await page
      .getByRole('alertdialog', { name: '确认删除这条待办？' })
      .getByRole('button', { name: '确认删除' })
      .click()
    await expect(todo).toHaveCount(0)
    await expect(newTodo).toBeFocused()
    await expectNoHorizontalOverflow(page)
    await saveScreenshot(
      page,
      `mobile-${viewport.width}x${viewport.height}-work-portals.png`,
      false,
    )
  })
}

test.describe('390 × 844 移动端完整房间', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('标题、HUD、房屋帮助和侧栏均无横向溢出', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '只在移动 Chromium 项目验证')
    await page.goto('./')
    await page.getByRole('textbox', { name: '想让饼狗怎么称呼你？' }).fill('三九零')
    await expectNoHorizontalOverflow(page)
    await page.getByRole('button', { name: '开始新旅程' }).click()
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

  test('收藏详情为 9:16，图片铺满且完整预览使用 contain', async ({ page }, testInfo) => {
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

    const detail = page.getByRole('dialog', { name: 'Survivors' })
    const detailBox = await detail.boundingBox()
    expect(detailBox).not.toBeNull()
    expect(detailBox!.width / detailBox!.height).toBeCloseTo(9 / 16, 1)
    await expect(detail.locator('.collectible-detail__image img')).toHaveCSS('object-fit', 'cover')
    await expect(detail.locator('.collectible-detail__copy')).toHaveCSS('scrollbar-width', 'none')
    await expectNoHorizontalOverflow(page)

    await detail.getByRole('button', { name: '全屏查看Survivors' }).click()
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
