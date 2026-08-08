import { expect, test } from '@playwright/test'

import {
  expectElementWithinViewport,
  expectNoHorizontalOverflow,
  openAlbum,
  saveScreenshot,
  startGame,
} from './support/game'

test.describe('375 × 667 移动端可访问性', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '只在移动 Chromium 项目验证')
    await startGame(page, { displayName: '手机测试' })
  })

  test('冰箱面板可以滚到最后一项且页面没有横向溢出', async ({ page }) => {
    await page.locator('[data-hotspot="冰箱"]').click()
    const panel = page.locator('.context-panel--fridge')
    const scroller = panel.locator('.context-content')
    const lastShopItem = panel.locator('.shop-item').last()
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
    await expect(lastShopItem.getByText('幸运苹果', { exact: true })).toBeVisible()
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
})
