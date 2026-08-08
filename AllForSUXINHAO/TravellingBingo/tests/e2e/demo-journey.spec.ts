import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

const STAGE_TEST_URL = 'https://www.bilibili.com/toy/Suxinhao_XHTI_stagetest/index.html'

test.setTimeout(90_000)

async function installStableSeed(page: Page, seed: string) {
  await page.addInitScript((value) => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', {
      configurable: true,
      value: () => value,
    })
  }, seed)
}

async function startGame(page: Page, seed: string) {
  await installStableSeed(page, seed)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
  const start = page.getByRole('button', { name: '开始新旅程' })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
}

async function startDebugGame(page: Page, seed = 'e2e-4') {
  await installStableSeed(page, seed)
  await page.goto('./')

  await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
  const titleTrigger = page.getByRole('button', {
    name: /旅行饼狗，连续激活五次可打开隐藏门牌/u,
  })
  for (let activation = 0; activation < 5; activation += 1) {
    await titleTrigger.click()
  }

  const debugDialog = page.getByRole('dialog', { name: '输入调试暗号' })
  await expect(debugDialog).toBeVisible()
  await debugDialog.getByLabel('暗号').fill('TravellingBingo')
  await debugDialog.getByRole('button', { name: '打开门牌' }).click()
  await expect(debugDialog).toBeHidden()

  const start = page.getByRole('button', { name: '开始新旅程' })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(page.getByRole('button', { name: 'DEBUG', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
}

async function openDebugPanel(page: Page) {
  await page.getByRole('button', { name: 'DEBUG', exact: true }).click()
  await expect(page.getByRole('heading', { name: '调试房间规则' })).toBeVisible()
}

async function setProbabilityToOne(page: Page, label: '百万直拍' | '全站第一') {
  const input = page.getByRole('spinbutton', { name: `${label}百分比` })
  await input.fill('100')
  await expect(input).toHaveValue('100')
}

async function finishCurrentActivity(page: Page) {
  await openDebugPanel(page)
  const complete = page.getByRole('button', { name: '立即完成活动' })
  await expect(complete).toBeEnabled()
  await complete.click()

  const activityStatus = page.locator('.game-hud .hud-activity')
  await expect(activityStatus).toContainText('可以看看结果啦')
  await activityStatus.click()
  const claim = page.getByRole('button', { name: '看看这次的结果' })
  await expect(claim).toBeEnabled()
  await claim.click()
}

async function readAppleCount(page: Page) {
  return Number(await page.locator('.apple-counter strong').innerText())
}

test('完成 DEBUG 刷播、领取收藏，并用下载的 .bingo 恢复 v2 进度', async ({ page }, testInfo) => {
  await startDebugGame(page)

  await openDebugPanel(page)
  await page.getByRole('button', { name: '10 秒' }).click()
  await setProbabilityToOne(page, '百万直拍')

  await page.locator('[data-hotspot="冰箱"]').click()
  const headphones = page.locator('.shop-item').filter({ hasText: '信号耳机' })
  await expect(headphones).toContainText('现有 0 份')
  const applesBeforePurchase = await readAppleCount(page)
  await headphones.getByRole('button', { name: '补充 · 4 个苹果' }).click()
  await expect(headphones).toContainText('现有 1 份')
  expect(await readAppleCount(page)).toBe(applesBeforePurchase - 4)

  await page.locator('[data-hotspot="电脑"]').click()
  const stream = page.locator('.activity-card').filter({ hasText: '认真刷播' })
  const startStream = stream.getByRole('button', { name: '开始认真刷播' })
  await expect(startStream).toBeEnabled()
  const applesBeforeActivity = await readAppleCount(page)
  await startStream.click()

  await expect(page.locator('[data-hotspot="电脑"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /正在刷播中的饼狗/u })).toBeVisible()
  await finishCurrentActivity(page)

  const reward = page.getByRole('dialog', { name: '把这一刻好好珍藏' })
  await expect(reward).toBeVisible()
  await expect(reward).toContainText('百万直拍')
  await expect(reward).toContainText('新收藏')
  await expect(reward).not.toContainText('饼狗带东西回来')
  expect(await readAppleCount(page)).toBe(applesBeforeActivity)
  await reward.getByRole('button', { name: '收好这份回忆' }).click()

  const albumOpener = page.locator('.game-hud').getByRole('button', { name: '打开收藏墙' })
  await albumOpener.click()
  const album = page.getByRole('dialog', { name: '一路珍藏的风景' })
  await expect(album).toBeVisible()
  await expect(album).not.toContainText(/\d+\s*\/\s*\d+/u)
  await expect(album.getByRole('tab', { name: '百万直拍' })).toBeVisible()
  await expect(album.getByRole('tab', { name: '明信片' })).toHaveCount(0)
  await expect(album.getByRole('tab', { name: '全站第一' })).toHaveCount(0)
  const ownedCards = album.locator('.collectible-card')
  await expect(ownedCards).toHaveCount(1)
  await expect(ownedCards.locator('img')).toHaveCSS('object-fit', 'cover')

  await ownedCards.first().click()
  const detail = page.locator('.collectible-detail')
  await expect(detail).toBeVisible()
  await expect(detail.locator('img')).toHaveCSS('object-fit', 'contain')
  await detail.getByRole('button', { name: '关闭详情' }).click()
  await album.getByRole('button', { name: '关闭收藏墙' }).click()

  const savedAppleCount = await readAppleCount(page)
  await page.getByRole('button', { name: /离开铲铲饼屋/u }).click()
  const exitDialog = page.getByRole('dialog', { name: '要离开铲铲饼屋了吗？' })
  const downloadPromise = page.waitForEvent('download')
  await exitDialog.getByRole('button', { name: '下载存档并离开' }).click()
  const download = await downloadPromise
  const suggestedName = download.suggestedFilename()
  expect(suggestedName).toMatch(/^travelling-bingo-\d{8}-\d{6}-debug\.bingo$/u)

  const savePath = testInfo.outputPath(suggestedName)
  await download.saveAs(savePath)
  const saveText = await readFile(savePath, 'utf8')
  const envelope = JSON.parse(saveText) as {
    format: string
    schemaVersion: number
    gameVersion: string
    payload: {
      schemaVersion: number
      profile: { debug: boolean }
      economy: { apples: number }
      inventory: { 'signal-headphones': number }
      collections: Record<string, unknown>
      activeActivity: unknown
      pet: unknown
      tasks: { active: unknown[] }
      gameBalance: {
        activityDurationMs: number
        probabilities: { millionShot: number }
      }
      random: { sequences: { reward: number; tasks: number; preferences: number } }
      statistics: { started: { stream: number }; claimed: { stream: number } }
      collectionTotal?: unknown
      categoryCounts?: unknown
      unlockedCategories?: unknown
      siteFirstCursor?: unknown
    }
    integrity: { algorithm: string; digest: string }
  }

  expect(envelope).toMatchObject({
    format: 'travelling-bingo-save',
    schemaVersion: 1,
    gameVersion: '0.2.0-demo.1',
    payload: {
      schemaVersion: 2,
      profile: { debug: true },
      economy: { apples: savedAppleCount },
      inventory: { 'signal-headphones': 0 },
      activeActivity: null,
      gameBalance: {
        activityDurationMs: 10_000,
        probabilities: { millionShot: 1 },
      },
      statistics: { started: { stream: 1 }, claimed: { stream: 1 } },
    },
    integrity: { algorithm: 'SHA-256' },
  })
  expect(envelope.payload.tasks.active).toHaveLength(3)
  expect(envelope.payload.random.sequences).toEqual({
    reward: 1,
    tasks: expect.any(Number),
    preferences: expect.any(Number),
  })
  expect(Object.keys(envelope.payload.collections)).toHaveLength(1)
  expect(envelope.payload).not.toHaveProperty('collectionTotal')
  expect(envelope.payload).not.toHaveProperty('categoryCounts')
  expect(envelope.payload).not.toHaveProperty('unlockedCategories')
  expect(envelope.payload).not.toHaveProperty('siteFirstCursor')
  expect(envelope.integrity.digest).toMatch(/^[A-Za-z0-9_-]{43}$/u)

  await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles(savePath)

  const importSummary = page.getByRole('region', { name: '存档摘要' })
  await expect(importSummary).toContainText(suggestedName)
  await expect(importSummary).toContainText(`${savedAppleCount} 个`)
  await expect(importSummary).toContainText('1 件')
  await expect(importSummary).toContainText('在铲铲饼屋休息')
  await importSummary.getByRole('button', { name: '带它回家' }).click()

  expect(await readAppleCount(page)).toBe(savedAppleCount)
  await expect(page.getByRole('button', { name: 'DEBUG', exact: true })).toBeVisible()
  await page.locator('.game-hud').getByRole('button', { name: '打开收藏墙' }).click()
  const restoredAlbum = page.getByRole('dialog', { name: '一路珍藏的风景' })
  await expect(restoredAlbum).not.toContainText(/\d+\s*\/\s*\d+/u)
  await expect(restoredAlbum.getByRole('tab', { name: '百万直拍' })).toBeVisible()
  await expect(restoredAlbum.locator('.collectible-card')).toHaveCount(1)
})

test('进行中的活动按存档内原 endsAt 恢复，不用后来修改的时长重算', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '进行中存档的计时恢复在桌面验证一次')

  await startDebugGame(page, 'e2e-4')
  await openDebugPanel(page)
  await page.getByRole('button', { name: '10 秒' }).click()

  await page.locator('[data-hotspot="冰箱"]').click()
  const headphones = page.locator('.shop-item').filter({ hasText: '信号耳机' })
  await headphones.getByRole('button', { name: '补充 · 4 个苹果' }).click()
  await expect(headphones).toContainText('现有 1 份')

  await page.locator('[data-hotspot="电脑"]').click()
  await page
    .locator('.activity-card')
    .filter({ hasText: '认真刷播' })
    .getByRole('button', { name: '开始认真刷播' })
    .click()

  await openDebugPanel(page)
  await page.getByRole('button', { name: '30 秒' }).click()

  await page.getByRole('button', { name: /离开铲铲饼屋/u }).click()
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('dialog', { name: '要离开铲铲饼屋了吗？' })
    .getByRole('button', { name: '下载存档并离开' })
    .click()
  const download = await downloadPromise
  const savePath = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(savePath)

  const envelope = JSON.parse(await readFile(savePath, 'utf8')) as {
    payload: {
      activeActivity: { kind: string; startedAt: number; endsAt: number } | null
      gameBalance: { activityDurationMs: number }
    }
  }
  expect(envelope.payload.activeActivity).not.toBeNull()
  expect(envelope.payload.activeActivity).toMatchObject({ kind: 'stream' })
  expect(envelope.payload.activeActivity!.endsAt - envelope.payload.activeActivity!.startedAt).toBe(
    10_000,
  )
  expect(envelope.payload.gameBalance.activityDurationMs).toBe(30_000)

  await page.locator('input[type="file"]').setInputFiles(savePath)
  const importSummary = page.getByRole('region', { name: '存档摘要' })
  await expect(importSummary).toContainText('刷播还剩')
  await importSummary.getByRole('button', { name: '带它回家' }).click()

  const activityStatus = page.locator('.game-hud .hud-activity')
  await expect(activityStatus).toBeVisible()
  const waitForOriginalEnd = Math.max(
    2_000,
    envelope.payload.activeActivity!.endsAt - Date.now() + 2_000,
  )
  await expect(activityStatus).toContainText('可以看看结果啦', { timeout: waitForOriginalEnd })
  await activityStatus.click()
  await expect(page.getByRole('button', { name: '看看这次的结果' })).toBeEnabled()
})

test('奇迹饼狗安全打开舞台测试并完成对应任务', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '外部弹窗在桌面项目验证一次')

  await context.route(STAGE_TEST_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>舞台测试替身</title><main>stage test</main>',
    })
  })
  await startGame(page, 'stage-popup-e2e')

  const stageTask = page.locator('.task-list li').filter({ hasText: '奇迹饼狗' })
  await expect(stageTask).toHaveCount(1)
  await expect(stageTask.getByLabel('进度 0 / 1')).toBeVisible()

  await page.locator('[data-hotspot="衣架"]').click()

  await expect(page.getByRole('heading', { name: '奇迹饼狗' })).toBeVisible()
  await expect(page.getByText('测试什么样的舞台适合你', { exact: true })).toBeVisible()
  const applesBeforeStageTest = await readAppleCount(page)
  const popupPromise = context.waitForEvent('page')
  await page.getByRole('button', { name: '开始舞台测试' }).click()
  const popup = await popupPromise
  await popup.waitForURL(STAGE_TEST_URL)
  await popup.waitForLoadState('domcontentloaded')
  expect(popup.url()).toBe(STAGE_TEST_URL)
  expect(await popup.evaluate(() => globalThis.opener === null)).toBe(true)
  await expect(page.getByRole('alert').filter({ hasText: '弹出窗口被浏览器拦住了' })).toHaveCount(0)
  await expect.poll(() => readAppleCount(page)).toBe(applesBeforeStageTest + 3)

  await page.locator('.game-hud .hud-activity').click()
  await expect(stageTask).toHaveClass(/is-complete/u)
  await expect(stageTask.getByLabel('进度 已完成')).toBeVisible()
  await popup.close()
})

test('舞台测试弹窗被拦截时显示安全 fallback，且不提前完成任务', async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '弹窗拦截在桌面项目验证一次')

  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'open', {
      configurable: true,
      value: () => null,
    })
  })
  await startGame(page, 'stage-popup-e2e')

  const stageTask = page.locator('.task-list li').filter({ hasText: '奇迹饼狗' })
  await expect(stageTask.getByLabel('进度 0 / 1')).toBeVisible()
  await page.locator('[data-hotspot="衣架"]').click()
  const applesBeforeBlockedAttempt = await readAppleCount(page)
  const pageCountBefore = context.pages().length

  await page.getByRole('button', { name: '开始舞台测试' }).click()

  const fallback = page.getByRole('alert').filter({ hasText: '弹出窗口被浏览器拦住了' })
  await expect(fallback).toBeVisible()
  const fallbackLink = fallback.getByRole('link', { name: '点这里继续舞台测试' })
  await expect(fallbackLink).toHaveAttribute('href', STAGE_TEST_URL)
  await expect(fallbackLink).toHaveAttribute('target', '_blank')
  await expect(fallbackLink).toHaveAttribute('rel', /noopener/u)
  expect(context.pages()).toHaveLength(pageCountBefore)
  expect(await readAppleCount(page)).toBe(applesBeforeBlockedAttempt)

  await page.locator('.game-hud .hud-activity').click()
  await expect(stageTask).not.toHaveClass(/is-complete/u)
  await expect(stageTask.getByLabel('进度 0 / 1')).toBeVisible()
})
