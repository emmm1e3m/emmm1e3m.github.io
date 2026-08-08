import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import {
  buySupply,
  completeActivity,
  openAlbum,
  openDebugPanel,
  readAppleCount,
  setDebugDuration,
  setProbability,
  startActivity,
  startGame,
  TEST_PLAYER_NAME,
} from './support/game'

const STAGE_TEST_URL = 'https://www.bilibili.com/toy/Suxinhao_XHTI_stagetest/index.html'

test.setTimeout(90_000)

async function exportAndExit(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /离开铲铲饼屋/u }).click()
  const exitDialog = page.getByRole('dialog', { name: '要离开铲铲饼屋了吗？' })
  const requestDownload = exitDialog.getByRole('button', { name: '请求下载存档' })
  await expect(requestDownload).toBeFocused()
  const downloadPromise = page.waitForEvent('download')
  await requestDownload.click()
  const download = await downloadPromise

  await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
  const savedDialog = page.getByRole('dialog', { name: '存档保存好了吗？' })
  const confirmExit = savedDialog.getByRole('button', { name: '我已保存，离开' })
  await expect(confirmExit).toBeFocused()
  await confirmExit.click()
  await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
  return download
}

test('用户名、V3 收藏与好友动态存档可以下载并恢复', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '完整存档往返只在桌面项目验证')
  await startGame(page, { debug: true, seed: 'e2e-4', displayName: TEST_PLAYER_NAME })
  await setDebugDuration(page, '10 秒')
  await setProbability(page, '百万直拍', 100)

  const applesBeforePurchase = await readAppleCount(page)
  await buySupply(page, '信号耳机')
  expect(await readAppleCount(page)).toBe(applesBeforePurchase - 4)
  await startActivity(page, '电脑', '认真刷播')
  const reward = await completeActivity(page)
  await expect(reward).toContainText('把这一刻好好珍藏')
  await reward.getByRole('button', { name: '收好这份回忆' }).click()

  const album = await openAlbum(page)
  await expect(album.getByRole('tab', { name: '百万直拍' })).toBeVisible()
  await expect(album.getByRole('tab', { name: '明信片' })).toHaveCount(0)
  await expect(album.locator('.collectible-card')).toHaveCount(1)
  await album.getByRole('button', { name: '关闭收藏墙' }).click()

  const savedAppleCount = await readAppleCount(page)
  const download = await exportAndExit(page)
  const suggestedName = download.suggestedFilename()
  expect(suggestedName).toMatch(/^travelling-bingo-\d{8}-\d{6}-debug\.bingo$/u)
  const savePath = testInfo.outputPath(suggestedName)
  await download.saveAs(savePath)

  const envelope = JSON.parse(await readFile(savePath, 'utf8')) as {
    format: string
    schemaVersion: number
    gameVersion: string
    payload: {
      schemaVersion: number
      profile: { debug: boolean; displayName: string; companionDays: number }
      economy: { apples: number }
      inventory: { 'signal-headphones': number }
      collections: Record<string, unknown>
      friends: Record<string, unknown>
      activeActivity: unknown
      tasks: { active: unknown[] }
      gameBalance: { activityDurationMs: number; probabilities: { millionShot: number } }
      random: { sequences: { reward: number; tasks: number; preferences: number } }
      collectionTotal?: unknown
      categoryCounts?: unknown
      unlockedCategories?: unknown
      friendTotal?: unknown
      friendCatalog?: unknown
    }
    integrity: { algorithm: string; digest: string }
  }

  expect(envelope).toMatchObject({
    format: 'travelling-bingo-save',
    schemaVersion: 1,
    gameVersion: '0.3.0-demo.1',
    payload: {
      schemaVersion: 3,
      profile: { debug: true, displayName: TEST_PLAYER_NAME, companionDays: 1 },
      economy: { apples: savedAppleCount },
      inventory: { 'signal-headphones': 0 },
      activeActivity: null,
      gameBalance: { activityDurationMs: 10_000, probabilities: { millionShot: 1 } },
    },
    integrity: { algorithm: 'SHA-256' },
  })
  expect(envelope.payload.tasks.active).toHaveLength(3)
  expect(Object.keys(envelope.payload.collections)).toHaveLength(1)
  expect(envelope.payload.friends).toEqual({})
  expect(envelope.payload).not.toHaveProperty('collectionTotal')
  expect(envelope.payload).not.toHaveProperty('categoryCounts')
  expect(envelope.payload).not.toHaveProperty('unlockedCategories')
  expect(envelope.payload).not.toHaveProperty('friendTotal')
  expect(envelope.payload).not.toHaveProperty('friendCatalog')
  expect(envelope.integrity.digest).toMatch(/^[A-Za-z0-9_-]{43}$/u)

  await page.locator('input[type="file"]').setInputFiles(savePath)
  const importSummary = page.getByRole('region', { name: '存档摘要' })
  await expect(importSummary).toContainText(TEST_PLAYER_NAME)
  await expect(importSummary).toContainText(`${savedAppleCount}🍎`)
  await expect(importSummary).toContainText('1 件')
  await expect(importSummary).toContainText('1 天')
  await importSummary.getByRole('button', { name: '进入这次旅程' }).click()

  await expect(page.locator('.hud-companion')).toContainText(`${TEST_PLAYER_NAME}陪伴饼狗已经 1 天`)
  expect(await readAppleCount(page)).toBe(savedAppleCount)
  const restoredAlbum = await openAlbum(page)
  await expect(restoredAlbum.getByRole('tab', { name: '百万直拍' })).toBeVisible()
  await expect(restoredAlbum.locator('.collectible-card')).toHaveCount(1)
})

test('进行中的任务保存绝对结束时间，离线完成后读档立即可领取', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '进行中存档恢复只在桌面验证')
  await startGame(page, { debug: true, seed: 'e2e-4', displayName: '计时测试' })
  await setDebugDuration(page, '10 秒')
  await buySupply(page, '信号耳机')
  await startActivity(page, '电脑', '认真刷播')

  await openDebugPanel(page)
  await page.getByRole('button', { name: '30 秒', exact: true }).click()
  const download = await exportAndExit(page)
  const savePath = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(savePath)
  const envelope = JSON.parse(await readFile(savePath, 'utf8')) as {
    payload: {
      activeActivity: { kind: string; startedAt: number; endsAt: number } | null
      gameBalance: { activityDurationMs: number }
    }
  }
  expect(envelope.payload.activeActivity).toMatchObject({ kind: 'stream' })
  expect(envelope.payload.activeActivity!.endsAt - envelope.payload.activeActivity!.startedAt).toBe(
    10_000,
  )
  expect(envelope.payload.gameBalance.activityDurationMs).toBe(30_000)

  const remaining = envelope.payload.activeActivity!.endsAt - Date.now()
  if (remaining > 0) await page.waitForTimeout(remaining + 500)
  await page.locator('input[type="file"]').setInputFiles(savePath)
  const importSummary = page.getByRole('region', { name: '存档摘要' })
  await expect(importSummary).toContainText('刷播已完成，等待领取')
  await importSummary.getByRole('button', { name: '进入这次旅程' }).click()
  await expect(page.locator('.game-hud__center')).toContainText('可以看看结果啦')
  await page.locator('.game-hud__center').click()
  await expect(page.getByRole('button', { name: '看看这次的结果' })).toBeEnabled()
})

test('奇迹饼狗以新弹窗安全打开搭配测试', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '外部弹窗只在桌面项目验证')
  await context.route(STAGE_TEST_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>搭配测试替身</title><main>stage test</main>',
    })
  })
  await startGame(page, { seed: 'stage-popup-e2e', displayName: '搭配测试' })
  await page.locator('[data-hotspot="衣架"]').click()
  await expect(page.getByRole('heading', { name: '奇迹饼狗' })).toBeVisible()
  await expect(page.getByText('什么样的搭配最合适呢？', { exact: true })).toBeVisible()

  const popupPromise = context.waitForEvent('page')
  await page.getByRole('button', { name: '开始舞台测试' }).click()
  const popup = await popupPromise
  await popup.waitForURL(STAGE_TEST_URL)
  await popup.waitForLoadState('domcontentloaded')
  expect(await popup.evaluate(() => globalThis.opener === null)).toBe(true)
  await popup.close()
})

test('搭配测试弹窗被拦截时显示 noopener fallback', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '弹窗拦截只在桌面项目验证')
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'open', { configurable: true, value: () => null })
  })
  await startGame(page, { seed: 'e2e-4', displayName: '拦截测试' })
  await page.locator('[data-hotspot="衣架"]').click()
  const pageCountBefore = context.pages().length
  await page.getByRole('button', { name: '开始舞台测试' }).click()

  const fallback = page.getByRole('alert').filter({ hasText: '弹出窗口被浏览器拦住了' })
  await expect(fallback).toBeVisible()
  const link = fallback.getByRole('link', { name: '点这里继续舞台测试' })
  await expect(link).toHaveAttribute('href', STAGE_TEST_URL)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/u)
  expect(context.pages()).toHaveLength(pageCountBefore)
})
