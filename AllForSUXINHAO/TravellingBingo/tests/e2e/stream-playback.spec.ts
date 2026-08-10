import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test'

import { enterReality, openDebugPanel, startGame } from './support/game'

const STATIC_BVIDS = ['BV1At3j6EE6w', 'BV1mkuN6HEFC', 'BV1UZ3D6REhZ'] as const
const SELF_TEST_BVID = 'BV1xx411c7mD'
const BROWSER_SAVE_KEY = 'travelling-bingo:browser-save:v1'
const DEBUG_ROUND_DURATION_SECONDS = 5

function isCanonicalVideoDocument(request: Request, canonicalUrls: ReadonlySet<string>) {
  return (
    request.method() === 'GET' &&
    request.resourceType() === 'document' &&
    canonicalUrls.has(request.url())
  )
}

async function guardExternalRequests(
  context: BrowserContext,
  appOrigin: string,
  allowedLoginUrls: ReadonlySet<string> = new Set(),
) {
  const unexpectedRequests: string[] = []
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === appOrigin) {
      await route.continue()
      return
    }
    if (isCanonicalVideoDocument(request, allowedLoginUrls)) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>测试视频页</title>',
      })
      return
    }
    if (
      request.method() === 'GET' &&
      request.resourceType() === 'document' &&
      url.origin === 'https://player.bilibili.com' &&
      url.pathname === '/player.html'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>测试游客播放器</title>',
      })
      return
    }

    unexpectedRequests.push(`${request.method()} ${request.resourceType()} ${request.url()}`)
    await route.abort()
  })

  return unexpectedRequests
}

async function setStreamRoundDuration(page: Page) {
  await openDebugPanel(page)
  await page
    .getByRole('spinbutton', { name: '刷播轮次时长（秒）' })
    .fill(String(DEBUG_ROUND_DURATION_SECONDS))
  await page.getByRole('button', { name: '应用刷播时长' }).click()
}

async function openStreamPanel(page: Page) {
  await enterReality(page)
  await page.getByRole('button', { name: '刷播', exact: true }).click()
  return page.locator('.context-panel--reality-stream')
}

test.describe('现实刷播浏览器契约', () => {
  test.use({ serviceWorkers: 'block' })

  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      browserName !== 'chromium' || testInfo.project.name !== 'chromium',
      '刷播窗口与游客 iframe 只在桌面 Chromium 验证',
    )
  })

  test('登录刷播使用静态快照，并把多轮汇总为一次任务', async ({ context, page }, testInfo) => {
    const appOrigin = new URL(testInfo.project.use.baseURL as string).origin
    const canonicalUrls = new Set(
      STATIC_BVIDS.map((bvid) => `https://www.bilibili.com/video/${bvid}/?autoplay=1&t=0`),
    )
    const unexpectedRequests = await guardExternalRequests(context, appOrigin, canonicalUrls)
    const openedPages: Page[] = []
    context.on('page', (openedPage) => {
      if (openedPage !== page) openedPages.push(openedPage)
    })

    await startGame(page, {
      displayName: '刷播测试',
      seed: 'stream-playback-e2e',
      debug: true,
    })
    await setStreamRoundDuration(page)
    const panel = await openStreamPanel(page)
    await expect(panel.getByRole('textbox', { name: '自测视频BV号' })).toHaveValue('')
    await panel.getByRole('spinbutton', { name: '视频间隔（秒）' }).fill('1')
    await panel.getByRole('spinbutton', { name: '定时停止（小时）' }).fill('0.003')

    const sessionStartedAt = await page.evaluate(() => Date.now())
    await panel.getByRole('button', { name: '开始登录刷播' }).click()
    await expect.poll(() => openedPages.length).toBeGreaterThanOrEqual(STATIC_BVIDS.length)
    await expect(panel).toContainText('本轮播放中')
    await expect
      .poll(() => openedPages.slice(0, STATIC_BVIDS.length).map((item) => item.url()))
      .toEqual([...canonicalUrls])
    expect(unexpectedRequests).toEqual([])

    await expect(panel).toContainText('本次完成轮次1', { timeout: 10_000 })
    await expect(panel).toContainText('已按时完成', { timeout: 12_000 })
    await expect(panel.getByText('按时完成 · 1 轮')).toBeVisible()
    await expect.poll(() => openedPages.every((openedPage) => openedPage.isClosed())).toBe(true)

    const readPersistedHistory = () =>
      page.evaluate((key) => {
        const serialized = localStorage.getItem(key)
        if (serialized === null) return null
        const cache = JSON.parse(serialized) as {
          payload?: {
            schemaVersion?: number
            reality?: {
              streamSettings?: {
                selfTestBvid?: string | null
                dimensionPenetrationEnabled?: boolean
              }
              streamHistory?: {
                completedRounds?: number
                recentSessions?: Array<{
                  startedAt?: number
                  endedAt?: number
                  roundsCompleted?: number
                  outcome?: string
                }>
              }
            }
          }
        }
        return {
          serialized,
          now: Date.now(),
          schemaVersion: cache.payload?.schemaVersion,
          streamSettings: cache.payload?.reality?.streamSettings,
          completedRounds: cache.payload?.reality?.streamHistory?.completedRounds,
          recentSessions: cache.payload?.reality?.streamHistory?.recentSessions,
        }
      }, BROWSER_SAVE_KEY)
    await expect.poll(readPersistedHistory).toMatchObject({
      schemaVersion: 8,
      streamSettings: { selfTestBvid: null, dimensionPenetrationEnabled: false },
      completedRounds: 1,
      recentSessions: [expect.objectContaining({ roundsCompleted: 1, outcome: 'completed' })],
    })
    const persistedHistory = await readPersistedHistory()
    const record = persistedHistory?.recentSessions?.[0]
    expect(record?.startedAt).toBeGreaterThanOrEqual(sessionStartedAt)
    expect(record?.endedAt).toBeLessThanOrEqual(persistedHistory?.now ?? 0)
    expect(persistedHistory?.recentSessions).toHaveLength(1)
    expect(persistedHistory?.serialized).not.toContain('streamRoundDurationMs')
    expect(persistedHistory?.serialized).not.toContain('openDelayMs')
    expect(unexpectedRequests).toEqual([])
  })

  test('游客刷播跨维度保留同一节点，并在整轮结束后统一重建', async ({
    context,
    page,
  }, testInfo) => {
    const appOrigin = new URL(testInfo.project.use.baseURL as string).origin
    const unexpectedRequests = await guardExternalRequests(context, appOrigin)

    await startGame(page, {
      displayName: '游客刷播测试',
      seed: 'visitor-stream-cross-dimension',
      debug: true,
    })
    await setStreamRoundDuration(page)
    const panel = await openStreamPanel(page)
    await panel.getByRole('textbox', { name: '自测视频BV号' }).fill(SELF_TEST_BVID)
    await panel.getByRole('spinbutton', { name: '视频间隔（秒）' }).fill('1')
    await panel.getByRole('checkbox', { name: /维度穿透/u }).check()

    const guestFrames = page.locator('.visitor-stream-layer iframe')
    await expect(guestFrames).toHaveCount(STATIC_BVIDS.length + 1, { timeout: 6_000 })
    const firstFrame = guestFrames.first()
    await firstFrame.evaluate((element) => {
      element.setAttribute('data-e2e-guest-node', 'first-round')
    })
    await expect(firstFrame).toHaveAttribute('src', /autoplay=1.*danmaku=0.*t=0.*muted=1/u)
    await expect(page.getByRole('timer', { name: /游客刷播已运行/u })).toContainText('第 1 轮')

    await page.getByRole('button', { name: '回到旅行饼狗游戏' }).click()
    await page
      .getByRole('dialog', { name: '回到饼屋？' })
      .getByRole('button', { name: '回到饼屋' })
      .click()
    await expect(page.locator('.game-page')).toHaveAttribute('data-world', 'game')
    await expect(page.locator('[data-e2e-guest-node="first-round"]')).toHaveCount(1)
    await expect(page.getByRole('timer', { name: /游客刷播已运行/u })).toBeVisible()

    await expect(page.locator('[data-e2e-guest-node="first-round"]')).toHaveCount(0, {
      timeout: 8_000,
    })
    await expect(guestFrames).toHaveCount(1)
    await expect(page.getByRole('timer', { name: /游客刷播已运行/u })).toContainText('第 2 轮')
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const cache = JSON.parse(localStorage.getItem(key) ?? 'null') as {
            payload?: { reality?: { streamSettings?: unknown } }
          } | null
          return cache?.payload?.reality?.streamSettings
        }, BROWSER_SAVE_KEY),
      )
      .toEqual({ selfTestBvid: SELF_TEST_BVID, dimensionPenetrationEnabled: true })
    expect(unexpectedRequests).toEqual([])
  })

  test('登录刷播占用时卸载游客 iframe，停止后按开关自动接棒', async ({
    context,
    page,
  }, testInfo) => {
    const appOrigin = new URL(testInfo.project.use.baseURL as string).origin
    const canonicalUrls = new Set(
      STATIC_BVIDS.map((bvid) => `https://www.bilibili.com/video/${bvid}/?autoplay=1&t=0`),
    )
    const unexpectedRequests = await guardExternalRequests(context, appOrigin, canonicalUrls)

    await startGame(page, {
      displayName: '互斥刷播测试',
      seed: 'visitor-login-exclusive',
    })
    const panel = await openStreamPanel(page)
    await panel.getByRole('checkbox', { name: /维度穿透/u }).check()
    const guestFrames = page.locator('.visitor-stream-layer iframe')
    await expect(guestFrames).toHaveCount(1)

    const loginPagePromise = context.waitForEvent('page')
    await panel.getByRole('button', { name: '开始登录刷播' }).click()
    const loginPage = await loginPagePromise
    await expect(guestFrames).toHaveCount(0)
    await expect(loginPage).toHaveURL([...canonicalUrls][0]!)

    await panel.getByRole('button', { name: '停止登录刷播' }).click()
    await expect.poll(() => loginPage.isClosed()).toBe(true)
    await expect(guestFrames).toHaveCount(1)
    await expect(page.getByRole('timer', { name: /游客刷播已运行/u })).toContainText('第 1 轮')
    expect(unexpectedRequests).toEqual([])
  })
})
