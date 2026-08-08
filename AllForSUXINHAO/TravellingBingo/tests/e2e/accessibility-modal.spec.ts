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
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight)

    const after = await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      }
    })
    expect(after.scrollTop).toBeGreaterThan(0)
    await expect(panel.getByText('幸运苹果', { exact: true })).toBeVisible()

    console.log(`375x667 context-panel metrics: ${JSON.stringify({ before, after })}`)
  })

  test('收藏墙圈定焦点、屏蔽背景并在 Escape 后恢复入口焦点', async ({ page }) => {
    const gameHeader = page.locator('.game-hud')
    const opener = gameHeader.getByRole('button', { name: '打开收藏墙' })
    await opener.click()

    const dialog = page.getByRole('dialog', { name: '一路捡到的喜欢' })
    const close = dialog.getByRole('button', { name: '关闭收藏墙' })
    const activeTab = dialog.getByRole('tab', { selected: true })
    await expect(dialog).toBeVisible()
    await expect(close).toBeFocused()
    await expect(gameHeader).toHaveAttribute('inert', '')

    await page.keyboard.press('Shift+Tab')
    await expect(activeTab).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
    await expect(gameHeader).not.toHaveAttribute('inert', '')
  })
})
