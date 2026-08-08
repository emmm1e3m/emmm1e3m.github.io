import { expect, test } from '@playwright/test'

test.describe('375 × 667 移动端可访问性', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: '开始新旅程' }).click()
  })

  test('冰箱抽屉保留内部滚动并能抵达最后一项', async ({ page }) => {
    const dock = page.getByRole('navigation', { name: '快捷操作' })
    await dock.getByRole('button', { name: /冰箱/u }).click()

    const panel = page.locator('.context-panel--fridge')
    const scroller = panel.locator('.context-content')
    await expect(panel).toBeVisible()

    const before = await scroller.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }))
    expect(before.scrollHeight).toBeGreaterThanOrEqual(before.clientHeight)

    const after = await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      }
    })
    expect(after.scrollTop).toBe(Math.max(0, after.scrollHeight - after.clientHeight))
    await expect(panel.getByText('幸运苹果', { exact: true })).toBeVisible()

    console.log(`375x667 context-panel metrics: ${JSON.stringify({ before, after })}`)
  })

  test('空收藏墙圈定焦点、屏蔽背景并在 Escape 后恢复入口焦点', async ({ page }) => {
    const gameHeader = page.locator('.game-hud')
    const opener = gameHeader.getByRole('button', { name: '打开收藏墙' })
    await opener.click()

    const dialog = page.getByRole('dialog', { name: '一路珍藏的风景' })
    const close = dialog.getByRole('button', { name: '关闭收藏墙' })
    await expect(dialog).toBeVisible()
    await expect(close).toBeFocused()
    await expect(gameHeader).toHaveAttribute('inert', '')
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    await expect(dialog).toContainText('第一份惊喜还在路上')

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
