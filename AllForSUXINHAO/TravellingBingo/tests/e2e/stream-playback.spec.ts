import { expect, test, type Page, type Request } from '@playwright/test'

import { enterReality, openDebugPanel, startGame } from './support/game'

const TEST_BVIDS = ['BV1xx411c7mD', 'BV1yy411c7mE'] as const
const BROWSER_SAVE_KEY = 'travelling-bingo:browser-save:v1'
const DEBUG_ROUND_DURATION_SECONDS = 5
const TIMED_STOP_HOURS = 0.003

function isCanonicalVideoDocument(request: Request, canonicalUrls: ReadonlySet<string>) {
  return (
    request.method() === 'GET' &&
    request.resourceType() === 'document' &&
    canonicalUrls.has(request.url())
  )
}

test.describe('现实刷播浏览器契约', () => {
  test.use({ serviceWorkers: 'block' })

  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      browserName !== 'chromium' || testInfo.project.name !== 'chromium',
      '刷播弹窗只在桌面 Chromium 验证',
    )
  })

  test('依次打开规范视频页，并把定时结束前的多轮汇总为一次任务', async ({
    context,
    page,
  }, testInfo) => {
    const appOrigin = new URL(testInfo.project.use.baseURL as string).origin
    const canonicalUrls = new Set(
      TEST_BVIDS.map((bvid) => `https://www.bilibili.com/video/${bvid}/?autoplay=1&t=0`),
    )
    const unexpectedRequests: string[] = []
    const openedPages: Page[] = []
    context.on('page', (openedPage) => {
      if (openedPage !== page) openedPages.push(openedPage)
    })
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === appOrigin) {
        await route.continue()
        return
      }
      if (isCanonicalVideoDocument(request, canonicalUrls)) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><title>测试视频页</title><p>测试中不访问真实哔哩哔哩</p>',
        })
        return
      }

      unexpectedRequests.push(`${request.method()} ${request.resourceType()} ${request.url()}`)
      await route.abort()
    })

    await startGame(page, {
      displayName: '刷播测试',
      seed: 'stream-playback-e2e',
      debug: true,
    })
    await openDebugPanel(page)
    await page
      .getByRole('spinbutton', { name: '刷播轮次时长（秒）' })
      .fill(String(DEBUG_ROUND_DURATION_SECONDS))
    await page.getByRole('button', { name: '应用刷播时长' }).click()

    await enterReality(page)
    await page.getByRole('button', { name: '刷播', exact: true }).click()
    const panel = page.locator('.context-panel--reality-stream')
    await panel.getByRole('textbox', { name: '视频BV号或链接列表' }).fill(TEST_BVIDS.join('\n'))
    await expect(panel.getByRole('spinbutton', { name: '打开间隔（秒）' })).toHaveValue('8')
    await panel.getByRole('spinbutton', { name: '打开间隔（秒）' }).fill('1')
    await panel.getByRole('spinbutton', { name: '定时停止（小时）' }).fill(String(TIMED_STOP_HOURS))

    const sessionStartedAt = await page.evaluate(() => Date.now())
    await panel.getByRole('button', { name: '开始刷播' }).click()
    await expect.poll(() => openedPages.length).toBe(TEST_BVIDS.length)
    await expect(panel).toContainText('本轮播放中')
    await expect(panel).toContainText('已经打开2')
    await expect
      .poll(() => openedPages.map((openedPage) => openedPage.url()).sort())
      .toEqual([...canonicalUrls].sort())
    expect(unexpectedRequests).toEqual([])

    await expect(panel).toContainText('本次完成轮次1', { timeout: 9_000 })
    await expect(panel).toContainText('已按时完成', { timeout: 9_000 })
    await expect(panel.getByText('按时完成 · 1 轮')).toBeVisible()
    await expect.poll(() => openedPages.every((openedPage) => openedPage.isClosed())).toBe(true)
    expect(openedPages).toHaveLength(TEST_BVIDS.length * 2)

    const readPersistedHistory = () =>
      page.evaluate((key) => {
        const serialized = localStorage.getItem(key)
        if (serialized === null) return null
        const cache = JSON.parse(serialized) as {
          payload?: {
            schemaVersion?: number
            reality?: {
              streamHistory?: {
                completedRounds?: number
                recentSessions?: Array<{
                  sessionId?: string
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
          completedRounds: cache.payload?.reality?.streamHistory?.completedRounds,
          recentSessions: cache.payload?.reality?.streamHistory?.recentSessions,
        }
      }, BROWSER_SAVE_KEY)
    await expect.poll(readPersistedHistory).toMatchObject({
      schemaVersion: 7,
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
    expect(persistedHistory?.serialized).not.toContain('stopAfterMs')
    expect(unexpectedRequests).toEqual([])
  })
})
