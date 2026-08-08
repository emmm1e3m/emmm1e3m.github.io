import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

test.setTimeout(90_000)

test('完成 DEBUG 刷播、领取收藏，并用下载的 .bingo 恢复进度', async ({ page }, testInfo) => {
  // 固定新档种子，使首个刷播奖励稳定命中百万直拍，避免概率导致测试抖动。
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', {
      configurable: true,
      value: () => 'e2e-0',
    })
  })

  await page.goto('./')

  await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
  const start = page.getByRole('button', { name: '开始新旅程' })
  await expect(start).toBeEnabled()

  const titleTrigger = page.getByRole('button', { name: /连续激活五次可打开隐藏门牌/ })
  for (let activation = 0; activation < 5; activation += 1) {
    await titleTrigger.click()
  }

  const debugDialog = page.getByRole('dialog', { name: '输入调试暗号' })
  await expect(debugDialog).toBeVisible()
  await debugDialog.getByLabel('暗号').fill('TravellingBingo')
  await debugDialog.getByRole('button', { name: '打开门牌' }).click()
  await expect(debugDialog).toBeHidden()

  await start.click()
  await expect(page.getByRole('button', { name: '苹果 18 个，打开冰箱' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'DEBUG' })).toBeVisible()

  await page.getByRole('button', { name: '苹果 18 个，打开冰箱' }).click()
  const headphones = page.locator('.shop-item').filter({ hasText: '信号耳机' })
  await expect(headphones).toContainText('库存 0')
  await headphones.getByRole('button', { name: '4 个' }).click()
  await expect(page.getByRole('button', { name: '苹果 14 个，打开冰箱' })).toBeVisible()
  await expect(headphones).toContainText('库存 1')

  await page.getByRole('button', { name: '打开电脑' }).click()
  const stream = page.locator('.activity-card').filter({ hasText: '认真刷播' })
  await stream.getByRole('button', { name: '出发 · 10 秒' }).click()
  await expect(page.locator('.activity-ribbon')).toContainText('刷播中')

  await page.getByRole('button', { name: 'DEBUG' }).click()
  await page.getByRole('button', { name: '立即完成任务' }).click()
  await page.getByRole('button', { name: '刷播中 可领取' }).click()
  await page.getByRole('button', { name: '领取', exact: true }).click()

  const reward = page.getByRole('dialog', { name: '饼狗带东西回来啦！' })
  await expect(reward).toBeVisible()
  await expect(reward).toContainText('百万直拍')
  await expect(reward).toContainText('新收藏')
  await reward.getByRole('button', { name: '收进收藏墙' }).click()

  await page.locator('.game-hud').getByRole('button', { name: '打开收藏墙' }).click()
  const album = page.getByRole('dialog', { name: '一路捡到的喜欢' })
  await expect(album).toContainText('已收藏 1 / 50')
  await album.getByRole('tab', { name: /百万直拍/ }).click()
  await expect(album.locator('.collectible-card:not(:disabled)')).toHaveCount(1)
  await album.getByRole('button', { name: '关闭收藏墙' }).click()

  const applesBeforeExport = await page
    .getByRole('button', { name: /苹果 \d+ 个，打开冰箱/ })
    .getAttribute('aria-label')
  const savedAppleCount = Number(applesBeforeExport?.match(/苹果 (\d+) 个/u)?.[1])
  expect(savedAppleCount).toBeGreaterThanOrEqual(15)

  await page.getByRole('button', { name: /离开铲铲饼屋/ }).click()
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
      profile: { debug: boolean }
      economy: { apples: number }
      inventory: { 'signal-headphones': number }
      collections: Record<string, unknown>
      activeActivity: unknown
      statistics: { started: { stream: number }; claimed: { stream: number } }
    }
    integrity: { algorithm: string; digest: string }
  }
  expect(envelope).toMatchObject({
    format: 'travelling-bingo-save',
    schemaVersion: 1,
    gameVersion: '0.1.0-demo.1',
    payload: {
      profile: { debug: true },
      economy: { apples: savedAppleCount },
      inventory: { 'signal-headphones': 0 },
      activeActivity: null,
      statistics: { started: { stream: 1 }, claimed: { stream: 1 } },
    },
    integrity: { algorithm: 'SHA-256' },
  })
  expect(envelope.integrity.digest).toMatch(/^[A-Za-z0-9_-]{43}$/u)
  expect(Object.keys(envelope.payload.collections)).toHaveLength(1)

  await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles(savePath)

  const importSummary = page.getByRole('region', { name: '存档摘要' })
  await expect(importSummary).toContainText(suggestedName)
  await expect(importSummary).toContainText(`${savedAppleCount} 个`)
  await expect(importSummary).toContainText('1 件')
  await expect(importSummary).toContainText('在铲铲饼屋休息')
  await importSummary.getByRole('button', { name: '带它回家' }).click()

  await expect(
    page.getByRole('button', { name: `苹果 ${savedAppleCount} 个，打开冰箱` }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'DEBUG' })).toBeVisible()
  await page.locator('.game-hud').getByRole('button', { name: '打开收藏墙' }).click()
  const restoredAlbum = page.getByRole('dialog', { name: '一路捡到的喜欢' })
  await expect(restoredAlbum).toContainText('已收藏 1 / 50')
  await restoredAlbum.getByRole('tab', { name: /百万直拍/ }).click()
  await expect(restoredAlbum.locator('.collectible-card:not(:disabled)')).toHaveCount(1)
})
