import { expect, test } from '@playwright/test'

import {
  expectElementWithinViewport,
  expectMinimumTouchTarget,
  expectNoOverlap,
  openAlbum,
  openDebugPanel,
  saveScreenshot,
  startGame,
} from './support/game'

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
  await expect(recordPanel.getByRole('button', { name: /打开播放器/u })).toHaveCount(0)
  const persistentPlayer = page.getByTestId('persistent-bilibili-player')
  await expect(persistentPlayer).toBeVisible()
  const recordIframe = persistentPlayer.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(recordIframe).toBeAttached()
  await expect(page.locator('iframe[title^="Bilibili 外链播放器："]')).toHaveCount(1)
  await expect(recordPanel.locator('iframe')).toHaveCount(0)
  const recordPlayerUrl = new URL((await recordIframe.getAttribute('src'))!)
  expect(recordPlayerUrl.searchParams.get('bvid')).toBe(shared!.video.bvid)
  expect(recordPlayerUrl.searchParams.get('autoplay')).toBe('1')
  await expect.poll(() => abortedPlayerRequests).toBe(1)
  const dimensionToggle = page.getByRole('button', { name: '切换到现实生活维度' })
  await saveScreenshot(page, 'persistent-player-corners.png', false)
  await expectElementWithinViewport(persistentPlayer)
  await expectElementWithinViewport(dimensionToggle)
  await expectNoOverlap(persistentPlayer, dimensionToggle, ['持久播放器', '维度切换按钮'])
  const recordIframeHandle = await recordIframe.elementHandle()

  await recordPanel.getByRole('button', { name: '收起信息栏' }).click()
  await expect(persistentPlayer).toBeAttached()
  expect(await recordIframeHandle!.evaluate((element) => element.isConnected)).toBe(true)
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
  await expect(detail.getByRole('button', { name: /打开播放器/u })).toHaveCount(0)
  await expect(detail.locator('iframe')).toHaveCount(0)
  await expect.poll(() => abortedPlayerRequests).toBe(2)
  const albumIframe = persistentPlayer.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(albumIframe).toBeAttached()
  await expect(page.locator('iframe[title^="Bilibili 外链播放器："]')).toHaveCount(1)
  const albumIframeHandle = await albumIframe.elementHandle()
  const albumPlayerUrl = new URL((await albumIframe.getAttribute('src'))!)
  expect(albumPlayerUrl.searchParams.get('bvid')).toBe(shared!.video.bvid)
  expect(albumPlayerUrl.searchParams.get('autoplay')).toBe('1')

  await detail.getByRole('button', { name: '关闭详情' }).click()
  await album.getByRole('button', { name: '关闭收藏墙' }).click()
  await expect(persistentPlayer).toBeAttached()
  expect(await albumIframeHandle!.evaluate((element) => element.isConnected)).toBe(true)
  await page.locator('.game-hud__center').click()
  await expect(musicTask.getByLabel('进度 1 / 2')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(musicTask.getByLabel('进度 1 / 2')).toBeVisible()
})

test('唱片机可创建命名列表、解析去重、保存模式与起播位置并跨维度续播', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '持久播放列表只在桌面 Chromium 验证')
  const response = await request.get('data/video-catalog.json')
  expect(response.ok()).toBe(true)
  const catalog = (await response.json()) as VideoCatalog
  const [first, second] = catalog.recordPlayer.items
  expect(first).toBeDefined()
  expect(second).toBeDefined()

  await startGame(page, { seed: 'playlist-v4', displayName: '列表测试' })
  await page.route('https://player.bilibili.com/**', async (route) => route.abort())
  await page.locator('[data-hotspot="唱片机"]').click()
  const panel = page.locator('.context-panel--record-player')
  await panel.getByLabel('播放列表名称').fill('夜晚循环')
  await panel
    .getByLabel('BV 号或视频链接')
    .fill(
      [
        first!.bvid,
        `https://www.bilibili.com/video/${second!.bvid}`,
        `https://www.bilibili.com/video/${first!.bvid}`,
        '不是视频',
      ].join('\n'),
    )
  await panel.getByRole('button', { name: '创建并载入列表' }).click()
  const customLibrary = panel
    .getByRole('group', { name: '播放曲库' })
    .getByRole('button', { name: /夜晚循环/u })
  await expect(customLibrary).toHaveAttribute('aria-pressed', 'true')
  const tracks = panel.getByRole('list', { name: '唱片列表' })
  await expect(tracks.getByRole('listitem')).toHaveCount(2)
  await expect(tracks.locator('.numeric-copy')).toHaveText([first!.bvid, second!.bvid])
  await expect(tracks).not.toContainText('不是视频')

  const randomMode = panel.getByRole('group', { name: '切歌模式' }).getByRole('button', {
    name: '随机',
  })
  await randomMode.click()
  await expect(randomMode).toHaveAttribute('aria-pressed', 'true')
  await panel.getByLabel('起播位置（秒）').fill('12')
  await tracks.getByRole('listitem').first().getByRole('button').click()

  const persistentPlayer = page.getByTestId('persistent-bilibili-player')
  const iframe = persistentPlayer.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(iframe).toBeAttached()
  const iframeHandle = await iframe.elementHandle()
  const playerUrl = new URL((await iframe.getAttribute('src'))!)
  expect(playerUrl.searchParams.get('bvid')).toBe(first!.bvid)
  expect(playerUrl.searchParams.get('autoplay')).toBe('1')
  expect(playerUrl.searchParams.get('t')).toBe('12')

  await panel.getByRole('button', { name: '收起信息栏' }).click()
  await page.getByRole('button', { name: '切换到现实生活维度' }).click()
  expect(await iframeHandle!.evaluate((element) => element.isConnected)).toBe(true)
  await page.locator('[data-hotspot="唱片机"]').click()
  const reopenedPanel = page.locator('.context-panel--record-player')
  await expect(
    reopenedPanel
      .getByRole('group', { name: '播放曲库' })
      .getByRole('button', { name: /夜晚循环/u }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(reopenedPanel.getByRole('button', { name: '随机' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(reopenedPanel.getByLabel('起播位置（秒）')).toHaveValue('12')
  expect(await iframeHandle!.evaluate((element) => element.isConnected)).toBe(true)
})

test('390px 移动端播放器在展开与收起后都避开房屋角落控件', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', '移动角落安全区只在移动 Chromium 验证')
  await page.setViewportSize({ width: 390, height: 844 })
  await startGame(page, { seed: 'mobile-player-v4', displayName: '移动播放器' })
  await page.route('https://player.bilibili.com/**', async (route) => route.abort())

  await page.locator('[data-hotspot="唱片机"]').click()
  const recordPanel = page.locator('.context-panel--record-player')
  await recordPanel
    .getByRole('list', { name: '唱片列表' })
    .getByRole('listitem')
    .first()
    .getByRole('button')
    .click()

  const player = page.getByTestId('persistent-bilibili-player')
  const iframe = player.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(player).toHaveAttribute('data-dock-state', 'expanded')
  await expect(iframe).toBeAttached()
  const expandedControls = player.getByRole('button')
  for (let index = 0; index < (await expandedControls.count()); index += 1) {
    await expectMinimumTouchTarget(expandedControls.nth(index), `展开播放器按钮 ${index + 1}`)
  }
  const iframeHandle = await iframe.elementHandle()
  const playerUrl = new URL((await iframe.getAttribute('src'))!)
  expect(playerUrl.searchParams.get('autoplay')).toBe('1')

  await page.evaluate(() => scrollTo(0, 0))
  const help = page.getByRole('button', { name: '查看房屋玩法说明' })
  await expect(help).toBeInViewport()
  await expectElementWithinViewport(player)
  await expectNoOverlap(player, help, ['持久播放器', '玩法说明按钮'])

  const edgeInsets = await player.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      left: box.left,
      right: innerWidth - box.right,
      bottom: innerHeight - box.bottom,
    }
  })
  expect(edgeInsets.left).toBeGreaterThanOrEqual(8)
  expect(edgeInsets.right).toBeGreaterThanOrEqual(8)
  expect(edgeInsets.bottom).toBeGreaterThanOrEqual(8)

  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  const dimension = page.getByRole('button', { name: '切换到现实生活维度' })
  await dimension.scrollIntoViewIfNeeded()
  await expect(dimension).toBeInViewport()
  await expectNoOverlap(player, dimension, ['持久播放器', '维度切换按钮'])

  await recordPanel.getByRole('button', { name: '收起信息栏' }).click()
  await expect(player).toHaveAttribute('data-dock-state', 'collapsed')
  const collapsedControls = player.getByRole('button')
  for (let index = 0; index < (await collapsedControls.count()); index += 1) {
    await expectMinimumTouchTarget(collapsedControls.nth(index), `收起播放器按钮 ${index + 1}`)
  }
  expect(await iframeHandle!.evaluate((element) => element.isConnected)).toBe(true)
  await expectElementWithinViewport(player)
  await expectNoOverlap(player, dimension, ['收起后的持久播放器', '维度切换按钮'])
  await saveScreenshot(page, 'mobile-390x844-player-corners.png', false)
})
