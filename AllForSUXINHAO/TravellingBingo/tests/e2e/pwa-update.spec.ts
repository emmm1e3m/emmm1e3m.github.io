import { expect, test } from '@playwright/test'

import { startGame } from './support/game'

test('跨标签新 Service Worker 接管 dirty 旅程时不自动刷新，明确保存后才刷新', async ({
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
  const bootId = await page.evaluate(() => {
    const value = crypto.randomUUID()
    Reflect.set(globalThis, '__travellingBingoE2eBoot', value)
    return value
  })
  let navigations = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1
  })

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
  await expect(prompt).toContainText('饼屋换上新布置啦')
  await expect(prompt).toContainText('先保存好这次旅程，再打开新布置。')
  await expect(prompt.getByRole('button', { name: '保存后更新' })).toBeVisible()

  await peer.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration?.waiting) throw new Error('没有等待中的 Service Worker')
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  })

  const updateDialog = page.getByRole('dialog', { name: '更新前先保存这次旅程' })
  await expect(updateDialog).toBeVisible()
  await expect(updateDialog.getByRole('button', { name: '请求下载存档' })).toBeFocused()
  await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(globalThis, '__travellingBingoE2eBoot'))).toBe(
    bootId,
  )
  expect(navigations).toBe(0)

  await updateDialog.getByRole('button', { name: '晚点更新' }).click()
  await expect(updateDialog).toBeHidden()
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => Reflect.get(globalThis, '__travellingBingoE2eBoot'))).toBe(
    bootId,
  )
  expect(navigations).toBe(0)

  await prompt.getByRole('button', { name: '保存后更新' }).click()
  await expect(updateDialog).toBeVisible()
  const requestDownload = updateDialog.getByRole('button', { name: '请求下载存档' })
  await expect(requestDownload).toBeFocused()
  expect(navigations).toBe(0)

  const downloadPromise = page.waitForEvent('download')
  await requestDownload.click()
  await downloadPromise
  const savedDialog = page.getByRole('dialog', { name: '存档保存好了吗？' })
  const installUpdate = savedDialog.getByRole('button', { name: '我已保存，安装更新' })
  await expect(installUpdate).toBeFocused()
  expect(await page.evaluate(() => Reflect.get(globalThis, '__travellingBingoE2eBoot'))).toBe(
    bootId,
  )
  expect(navigations).toBe(0)

  const navigationPromise = page.waitForEvent('framenavigated', {
    predicate: (frame) => frame === page.mainFrame(),
  })
  await Promise.all([navigationPromise, installUpdate.click()])
  await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
  expect(navigations).toBe(1)
  expect(
    await page.evaluate(() => Reflect.get(globalThis, '__travellingBingoE2eBoot')),
  ).toBeUndefined()
})
