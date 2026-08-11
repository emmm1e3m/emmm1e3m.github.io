import { expect, test, type BrowserContext } from '@playwright/test'

import { enterReality, startGame } from './support/game'

const FAVORITE_BVID = 'BV1sBgr69E9j'
const SELF_TEST_BVID = 'BV1xx411c7mD'

async function guardStreamRequests(context: BrowserContext, appOrigin: string) {
  const favoriteRequests: string[] = []
  const playerRequests: string[] = []
  const unexpectedRequests: string[] = []

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === appOrigin) {
      if (url.pathname.endsWith('/favourites/3986840044.txt')) {
        favoriteRequests.push(url.toString())
        await route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          body: `${FAVORITE_BVID}\n`,
        })
        return
      }
      await route.continue()
      return
    }

    if (
      request.method() === 'GET' &&
      request.resourceType() === 'document' &&
      url.origin === 'https://player.bilibili.com' &&
      url.pathname === '/player.html'
    ) {
      playerRequests.push(url.toString())
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>拦截的官方播放器</title>',
      })
      return
    }

    unexpectedRequests.push(`${request.method()} ${request.resourceType()} ${request.url()}`)
    await route.abort()
  })

  return { favoriteRequests, playerRequests, unexpectedRequests }
}

async function openStreamPanel(page: Parameters<typeof enterReality>[0]) {
  await enterReality(page)
  await page.getByRole('button', { name: '刷播', exact: true }).click()
  return page.locator('.context-panel--reality-stream')
}

function isOfficialPlayerUrl(value: string | null, bvid: string) {
  if (value === null) return false
  const url = new URL(value)
  return (
    url.origin === 'https://player.bilibili.com' &&
    url.pathname === '/player.html' &&
    url.searchParams.get('bvid') === bvid &&
    url.searchParams.get('autoplay') === '1' &&
    url.searchParams.get('muted') === '1' &&
    url.searchParams.get('t') === '0'
  )
}

test.describe('独立刷播页真实流程', () => {
  test.use({ serviceWorkers: 'block' })

  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      browserName !== 'chromium' || testInfo.project.name !== 'chromium',
      '独立刷播窗口只在桌面 Chromium 跑一次完整流程',
    )
  })

  test('主游戏配置后自动启动，按5秒建播放器，DEBUG轮末统一重建', async ({
    context,
    page,
  }, testInfo) => {
    const appOrigin = new URL(testInfo.project.use.baseURL as string).origin
    const requests = await guardStreamRequests(context, appOrigin)

    await startGame(page, {
      displayName: '刷播测试',
      seed: 'stream-player-v10-e2e',
    })
    const panel = await openStreamPanel(page)
    await panel.getByRole('radio', { name: '测试' }).check()
    await panel.getByRole('textbox', { name: '自测视频BV号或链接' }).fill(SELF_TEST_BVID)

    const popupPromise = context.waitForEvent('page')
    await panel.getByRole('button', { name: '开始刷播' }).click()
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')
    await expect(popup.getByRole('heading', { name: '在线刷播工具' })).toBeVisible()

    const playerFrames = popup.locator('[data-testid="player-host"] iframe')
    await expect.poll(() => requests.favoriteRequests.length).toBe(1)
    await expect(playerFrames).toHaveCount(1)
    expect(isOfficialPlayerUrl(await playerFrames.first().getAttribute('src'), FAVORITE_BVID)).toBe(
      true,
    )

    await expect(playerFrames).toHaveCount(2, { timeout: 7_000 })
    expect(isOfficialPlayerUrl(await playerFrames.nth(1).getAttribute('src'), SELF_TEST_BVID)).toBe(
      true,
    )
    expect(requests.playerRequests).toHaveLength(2)

    const title = popup.getByRole('heading', { name: '在线刷播工具' })
    for (let click = 0; click < 5; click += 1) await title.click()
    await popup.getByRole('textbox', { name: 'DEBUG密码' }).fill('SUperView')
    await popup.getByRole('button', { name: '解锁DEBUG' }).click()
    await popup.getByRole('checkbox', { name: '显示播放器' }).check()
    await expect(popup.locator('[data-testid="player-host"]')).toHaveClass(
      /stream-frames--visible/u,
    )

    await playerFrames.first().evaluate((frame) => frame.setAttribute('data-first-round', 'true'))
    await popup.getByRole('spinbutton', { name: '轮次间隔（秒）' }).fill('1')
    await popup.getByRole('button', { name: '应用到当前轮' }).click()

    await expect(popup.locator('[data-first-round="true"]')).toHaveCount(0, { timeout: 3_000 })
    await expect(playerFrames).toHaveCount(1)
    await expect(popup.locator('[data-status]')).toHaveAttribute('data-round', '2')

    await popup.getByRole('button', { name: '停止刷播' }).click()
    await expect(popup.locator('.stream-history')).toContainText('1 轮')
    await page.bringToFront()
    await expect(panel.getByRole('heading', { name: '最近任务' })).toHaveCount(0)
    expect(requests.unexpectedRequests).toEqual([])
  })
})
