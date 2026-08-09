import { expect, test } from '@playwright/test'

import { startGame } from './support/game'

test('跨标签新 Service Worker 接管前自动下载缓存，刷新后可继续旅程', async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '真实 Service Worker 更新只在桌面 Chromium 验证')
  test.setTimeout(120_000)

  await page.goto('./')
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration()
          return registration?.active?.state ?? null
        }),
      { timeout: 60_000 },
    )
    .toBe('activated')
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)

  const peer = await context.newPage()
  await peer.goto('./')
  await expect
    .poll(() => peer.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)

  await startGame(page, { displayName: '更新保护', seed: 'pwa-update-e2e' })
  await page.evaluate(() => {
    const value = crypto.randomUUID()
    Reflect.set(globalThis, '__travellingBingoE2eBoot', value)
    return value
  })
  let navigations = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1
  })

  const automaticBackup = page.waitForEvent('download')
  const externalWorker = await peer.evaluate(async () => {
    const scriptUrl = new URL(`sw.js?external-e2e=${Date.now()}`, location.href).href
    const registration = await navigator.serviceWorker.register(scriptUrl, { scope: './' })
    const worker = registration.installing ?? registration.waiting
    if (!worker) throw new Error('外部 Service Worker 没有进入安装或等待状态')
    if (worker.state !== 'installed') {
      await new Promise<void>((resolve, reject) => {
        const timeout = globalThis.setTimeout(
          () => reject(new Error(`等待外部 Service Worker 超时：${worker.state}`)),
          30_000,
        )
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            globalThis.clearTimeout(timeout)
            resolve()
          }
        })
      })
    }
    return {
      waiting: Boolean(registration.waiting),
      scriptUrl: registration.waiting?.scriptURL ?? worker.scriptURL,
    }
  })
  expect(externalWorker.waiting).toBe(true)
  expect(externalWorker.scriptUrl).toContain('external-e2e=')

  const prompt = page.locator('.pwa-update-prompt')
  await expect(prompt).toContainText('铲铲饼屋有新布置啦')
  await expect(prompt).toContainText('打开新布置前会自动备份')
  await expect(prompt.getByRole('button', { name: '看看新布置' })).toBeVisible()
  await automaticBackup

  const navigationPromise = page.waitForEvent('framenavigated', {
    predicate: (frame) => frame === page.mainFrame(),
  })
  await peer.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration?.waiting) throw new Error('没有等待中的 Service Worker')
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  })
  await navigationPromise
  await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
  expect(navigations).toBe(1)
  expect(
    await page.evaluate(() => Reflect.get(globalThis, '__travellingBingoE2eBoot')),
  ).toBeUndefined()
  await expect(page.getByRole('button', { name: '继续' })).toBeEnabled()
  await page.getByRole('button', { name: '继续' }).click()
  await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
  await expect(page.locator('.hud-companion')).toContainText('更新保护陪伴饼狗已经')
})
