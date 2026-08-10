import { expect, test, type Page } from '@playwright/test'

const FIRST_BVID = 'BV1xx411c7mD'
const SECOND_BVID = 'BV1At3j6EE6w'

async function stubOfficialPlayers(page: Page) {
  await page.route('https://player.bilibili.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>测试官方播放器</title>',
    })
  })
}

test.describe('独立 B站多播放器生成器', () => {
  test.use({ serviceWorkers: 'block' })

  test('生成指定数量的官方自动播放 iframe，且只在重建时替换', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', '主流程只在桌面 Chromium 验证一次')
    await stubOfficialPlayers(page)
    await page.goto('bilibili-multi-player.html')

    await page
      .getByRole('textbox', { name: '视频 BV 号或链接' })
      .fill(`https://www.bilibili.com/video/${FIRST_BVID}/?from=search`)
    await page.getByRole('spinbutton', { name: '播放器数量' }).fill('3')
    await page.getByRole('button', { name: '生成 / 重建' }).click()

    const frames = page.locator('#player-grid iframe')
    await expect(frames).toHaveCount(3)
    for (let index = 0; index < 3; index += 1) {
      const url = new URL((await frames.nth(index).getAttribute('src'))!)
      expect(url.origin).toBe('https://player.bilibili.com')
      expect(url.pathname).toBe('/player.html')
      expect(url.searchParams.get('bvid')).toBe(FIRST_BVID)
      expect(url.searchParams.get('autoplay')).toBe('1')
      expect(url.searchParams.get('muted')).toBe('1')
      expect(url.searchParams.get('t')).toBe('0')
    }
    await expect(page.getByRole('button', { name: /暂停|停止/u })).toHaveCount(0)

    const originalFirstFrame = await frames.first().elementHandle()
    await page.getByRole('textbox', { name: '视频 BV 号或链接' }).fill('不是视频')
    await page.getByRole('button', { name: '生成 / 重建' }).click()
    await expect(frames).toHaveCount(3)
    expect(await originalFirstFrame!.evaluate((element) => element.isConnected)).toBe(true)

    await page.getByRole('textbox', { name: '视频 BV 号或链接' }).fill(SECOND_BVID)
    await page.getByRole('spinbutton', { name: '播放器数量' }).fill('2')
    await page.getByRole('button', { name: '生成 / 重建' }).click()
    await expect(frames).toHaveCount(2)
    expect(await originalFirstFrame!.evaluate((element) => element.isConnected)).toBe(false)
  })

  test('移动端单列布局不产生横向溢出', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '移动布局只在移动 Chromium 验证')
    await stubOfficialPlayers(page)
    await page.goto('bilibili-multi-player.html')
    await page.getByRole('textbox', { name: '视频 BV 号或链接' }).fill(FIRST_BVID)
    await page.getByRole('spinbutton', { name: '播放器数量' }).fill('2')
    await page.getByRole('button', { name: '生成 / 重建' }).click()

    await expect(page.locator('#player-grid iframe')).toHaveCount(2)
    const layout = await page.evaluate(() => {
      const card = document.querySelector('.player-card')
      const bounds = card?.getBoundingClientRect()
      return {
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        cardLeft: bounds?.left ?? -1,
        cardRight: bounds?.right ?? Number.POSITIVE_INFINITY,
      }
    })
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth)
    expect(layout.cardLeft).toBeGreaterThanOrEqual(0)
    expect(layout.cardRight).toBeLessThanOrEqual(layout.viewportWidth)
  })
})
