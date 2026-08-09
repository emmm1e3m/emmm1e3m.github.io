import { expect, test, type Page, type Request } from '@playwright/test'

import { enterReality, openDebugPanel, startGame } from './support/game'

const TEST_BVIDS = ['BV1xx411c7mD', 'BV1yy411c7mE'] as const
const BROWSER_SAVE_KEY = 'travelling-bingo:browser-save:v1'
const DEBUG_ROUND_DURATION_SECONDS = 5
const DEBUG_ROUND_DURATION_MS = DEBUG_ROUND_DURATION_SECONDS * 1_000

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

  test('按调试时长完成轮次，且网络只访问规范视频页', async ({ context, page }, testInfo) => {
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
    const durationInput = page.getByRole('spinbutton', { name: '刷播轮次时长（秒）' })
    await durationInput.fill(String(DEBUG_ROUND_DURATION_SECONDS))
    await page.getByRole('button', { name: '应用刷播时长' }).click()
    await expect(page.getByText(`当前为 ${DEBUG_ROUND_DURATION_SECONDS} 秒`)).toBeVisible()

    await enterReality(page)
    await page.getByRole('button', { name: '刷播', exact: true }).click()
    const panel = page.locator('.context-panel--reality-stream')
    await panel.getByRole('textbox', { name: '视频BV号或链接列表' }).fill(TEST_BVIDS.join('\n'))

    const firstRoundStartedAt = await page.evaluate(() => Date.now())
    await panel.getByRole('button', { name: '开始刷播' }).click()
    await expect.poll(() => openedPages.length).toBe(TEST_BVIDS.length)
    await expect(panel).toContainText('本轮播放中')
    await expect(panel).toContainText('已经打开2')

    await expect
      .poll(() => openedPages.map((openedPage) => openedPage.url()).sort())
      .toEqual([...canonicalUrls].sort())
    expect(unexpectedRequests).toEqual([])

    const firstRoundPages = [...openedPages]
    await expect
      .poll(() => firstRoundPages.every((openedPage) => openedPage.isClosed()), {
        timeout: DEBUG_ROUND_DURATION_MS + 10_000,
      })
      .toBe(true)
    await expect
      .poll(() => openedPages.length, { timeout: DEBUG_ROUND_DURATION_MS + 10_000 })
      .toBe(TEST_BVIDS.length * 2)
    const secondRoundPages = openedPages.slice(TEST_BVIDS.length)
    await expect
      .poll(() => secondRoundPages.map((openedPage) => openedPage.url()).sort())
      .toEqual([...canonicalUrls].sort())
    await expect(panel.locator('.reality-stream-status')).toContainText(/下一动作00:0[45]/u)
    await expect(panel.getByText('第 1 轮', { exact: true })).toBeVisible()
    await expect(panel.locator('.reality-stream-status')).toContainText('完成轮次1')

    const persistedHistory = await page.evaluate((key) => {
      const serialized = localStorage.getItem(key)
      if (serialized === null) return null
      const cache = JSON.parse(serialized) as {
        payload?: {
          schemaVersion?: number
          reality?: {
            streamHistory?: {
              completedRounds?: number
              recentRounds?: Array<{ round?: number; completedAt?: number }>
            }
          }
        }
      }
      return {
        serialized,
        now: Date.now(),
        schemaVersion: cache.payload?.schemaVersion,
        completedRounds: cache.payload?.reality?.streamHistory?.completedRounds,
        recentRounds: cache.payload?.reality?.streamHistory?.recentRounds,
      }
    }, BROWSER_SAVE_KEY)
    expect(persistedHistory?.schemaVersion).toBe(6)
    expect(persistedHistory?.completedRounds).toBe(1)
    expect(persistedHistory?.recentRounds).toHaveLength(1)
    expect(persistedHistory?.recentRounds?.[0]?.round).toBe(1)
    expect(persistedHistory?.recentRounds?.[0]?.completedAt).toBeGreaterThanOrEqual(
      firstRoundStartedAt + DEBUG_ROUND_DURATION_MS - 250,
    )
    expect(persistedHistory?.recentRounds?.[0]?.completedAt).toBeLessThanOrEqual(
      persistedHistory?.now ?? 0,
    )
    expect(persistedHistory?.serialized).not.toContain('streamRoundDurationMs')
    expect(unexpectedRequests).toEqual([])

    await panel.getByRole('button', { name: '停止刷播' }).click()
    await expect
      .poll(() => secondRoundPages.filter((openedPage) => !openedPage.isClosed()).length)
      .toBe(0)
    await expect(panel).toContainText('已停止')
  })
})
