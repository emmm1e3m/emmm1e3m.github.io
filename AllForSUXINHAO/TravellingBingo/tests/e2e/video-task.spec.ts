import { expect, test } from '@playwright/test'

import { openAlbum, openDebugPanel, startGame } from './support/game'

interface VideoSummary {
  bvid: string
  title: string
}

interface VideoCatalog {
  recordPlayer: { items: VideoSummary[] }
}

interface MillionShotManifest {
  items: Array<{
    id: string
    title: string
    metadata: { video?: VideoSummary }
  }>
}

test('播放器点击立即记入任务，加载失败与同 BV 跨入口不会重复计数', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '播放器任务语义只在桌面 Chromium 验证')

  const [videoResponse, millionResponse] = await Promise.all([
    request.get('data/video-catalog.json'),
    request.get('data/million-shot-posters.json'),
  ])
  expect(videoResponse.ok()).toBe(true)
  expect(millionResponse.ok()).toBe(true)
  const videoCatalog = (await videoResponse.json()) as VideoCatalog
  const millionManifest = (await millionResponse.json()) as MillionShotManifest
  const shared = videoCatalog.recordPlayer.items
    .map((video) => ({
      video,
      collectible: millionManifest.items.find((item) => item.metadata.video?.bvid === video.bvid),
    }))
    .find(
      (
        candidate,
      ): candidate is {
        video: VideoSummary
        collectible: MillionShotManifest['items'][number]
      } => candidate.collectible !== undefined,
    )
  expect(shared).toBeDefined()

  await startGame(page, { debug: true, seed: 'video-e2e-1', displayName: '播放器测试' })
  await openDebugPanel(page)
  await page.getByRole('button', { name: '一键全收集', exact: true }).click()
  await page
    .getByRole('group', { name: '确认一键全收集' })
    .getByRole('button', { name: '确认全收集' })
    .click()

  await page.locator('.game-hud__center').click()
  const musicTask = page.locator('.task-list li').filter({ hasText: '逛逛音乐角落' })
  await expect(musicTask).toHaveCount(1)
  await expect(musicTask.getByLabel('进度 0 / 2')).toBeVisible()

  let abortedPlayerRequests = 0
  await page.route('https://player.bilibili.com/**', async (route) => {
    abortedPlayerRequests += 1
    await route.abort()
  })

  await page.locator('[data-hotspot="唱片机"]').click()
  const recordPanel = page.locator('.context-panel--record-player')
  const sharedTrack = recordPanel
    .getByRole('list', { name: '唱片列表' })
    .getByRole('listitem')
    .filter({ hasText: shared!.video.title })
  await sharedTrack.getByRole('button').click()
  await recordPanel.getByRole('button', { name: '打开播放器' }).click()
  await expect(recordPanel.locator('iframe[title$="播放器"]')).toBeAttached()
  await expect.poll(() => abortedPlayerRequests).toBe(1)

  await recordPanel.getByRole('button', { name: '收起信息栏' }).click()
  await page.locator('.game-hud__center').click()
  await expect(musicTask.getByLabel('进度 1 / 2')).toBeVisible()

  const album = await openAlbum(page)
  await album.getByRole('tab', { name: '百万直拍' }).click()
  await album
    .getByRole('button', {
      name: `${shared!.collectible.title}，百万直拍，打开详情`,
      exact: true,
    })
    .click()
  const detail = page.getByRole('dialog', { name: shared!.collectible.title })
  await detail.getByRole('button', { name: '打开播放器' }).click()
  await expect(detail.locator('iframe[title$="播放器"]')).toBeAttached()
  await expect.poll(() => abortedPlayerRequests).toBe(2)

  await detail.getByRole('button', { name: '关闭详情' }).click()
  await album.getByRole('button', { name: '关闭收藏墙' }).click()
  await page.locator('.game-hud__center').click()
  await expect(musicTask.getByLabel('进度 1 / 2')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(musicTask.getByLabel('进度 1 / 2')).toBeVisible()
})
