import { expect, test } from '@playwright/test'

import {
  enterReality,
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
  durationSeconds: number
}

interface VideoCatalog {
  recordPlayer: { items: VideoSummary[] }
}

interface SiteFirstManifest {
  items: Array<{
    id: string
    title: string
    metadata: { video?: VideoSummary }
  }>
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

  const [videoResponse, siteFirstResponse] = await Promise.all([
    request.get('data/video-catalog.json'),
    request.get('data/site-firsts.json'),
  ])
  expect(videoResponse.ok()).toBe(true)
  expect(siteFirstResponse.ok()).toBe(true)
  const videoCatalog = (await videoResponse.json()) as VideoCatalog
  const siteFirstManifest = (await siteFirstResponse.json()) as SiteFirstManifest
  const shared = videoCatalog.recordPlayer.items
    .map((video) => ({
      video,
      collectible: siteFirstManifest.items.find((item) => item.metadata.video?.bvid === video.bvid),
    }))
    .find(
      (
        candidate,
      ): candidate is {
        video: VideoSummary
        collectible: SiteFirstManifest['items'][number]
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
    .getByRole('list', { name: '全站第一曲目' })
    .getByRole('listitem')
    .filter({ hasText: shared!.collectible.title })
  const sharedTrackButton = sharedTrack.getByRole('button', {
    name: shared!.video.title,
    exact: true,
  })
  await expect(sharedTrackButton).toHaveAttribute('title', shared!.video.title)
  await sharedTrackButton.click()
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
  expect(recordPlayerUrl.searchParams.get('t')).toBe('0')
  await expect.poll(() => abortedPlayerRequests).toBe(1)
  const dimensionToggle = page.getByRole('button', { name: '切换到现实生活维度' })
  await saveScreenshot(page, 'persistent-player-corners.png', false)
  await expectElementWithinViewport(persistentPlayer)
  await expectElementWithinViewport(dimensionToggle)
  await expectNoOverlap(persistentPlayer, dimensionToggle, ['持久播放器', '维度切换按钮'])
  await expect(recordPanel.locator('.context-panel__close')).toHaveCount(0)
  await page.locator('.game-hud__center').click()
  await expect(musicTask.getByLabel('进度 1 / 2')).toBeVisible()

  const album = await openAlbum(page)
  await album.getByRole('tab', { name: '全站第一' }).click()
  await album
    .getByRole('button', {
      name: `${shared!.collectible.title}，全站第一，打开详情`,
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
  const albumPlayerUrl = new URL((await albumIframe.getAttribute('src'))!)
  expect(albumPlayerUrl.searchParams.get('bvid')).toBe(shared!.video.bvid)
  expect(albumPlayerUrl.searchParams.get('autoplay')).toBe('1')
  expect(albumPlayerUrl.searchParams.get('t')).toBe('0')

  await detail.getByRole('button', { name: '关闭详情' }).click()
  await album.getByRole('button', { name: '关闭收藏墙' }).click()
  await expect(persistentPlayer).toBeAttached()
  await expect(page.locator('iframe[title^="Bilibili 外链播放器："]')).toHaveCount(1)
  await page.locator('.game-hud__center').click()
  await expect(musicTask.getByLabel('进度 1 / 2')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(musicTask.getByLabel('进度 1 / 2')).toBeVisible()
})

test('唱片机只有八首全站第一，并跨维度保留选曲与切歌模式', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '唯一曲库只在桌面 Chromium 验证')
  const [videoResponse, siteFirstResponse] = await Promise.all([
    request.get('data/video-catalog.json'),
    request.get('data/site-firsts.json'),
  ])
  expect(videoResponse.ok()).toBe(true)
  expect(siteFirstResponse.ok()).toBe(true)
  const catalog = (await videoResponse.json()) as VideoCatalog
  const siteFirstManifest = (await siteFirstResponse.json()) as SiteFirstManifest
  const [first] = catalog.recordPlayer.items
  const firstDisplayTitle = siteFirstManifest.items.find(
    (item) => item.metadata.video?.bvid === first?.bvid,
  )?.title
  expect(catalog.recordPlayer.items).toHaveLength(8)
  expect(catalog.recordPlayer.items.some((track) => /Dynamite/iu.test(track.title))).toBe(true)
  expect(first).toBeDefined()
  expect(firstDisplayTitle).toBeDefined()

  await startGame(page, { seed: 'site-first-library-v5', displayName: '曲库测试' })
  await page.route('https://player.bilibili.com/**', async (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html>
        <title>播放器替身</title>
        <button type="button" data-testid="embedded-control" onclick="const output = document.querySelector('output'); output.value = output.value ? '键盘已操作' : '鼠标已操作'">播放器内部操作</button>
        <output data-testid="embedded-result"></output>`,
    }),
  )
  await page.locator('[data-hotspot="唱片机"]').click()
  const panel = page.locator('.context-panel--record-player')
  await expect(panel.getByRole('heading', { name: '八首全站第一' })).toBeVisible()
  await expect(panel.getByRole('textbox')).toHaveCount(0)
  const tracks = panel.getByRole('list', { name: '全站第一曲目' })
  await expect(tracks.getByRole('listitem')).toHaveCount(8)

  const randomMode = panel.getByRole('group', { name: '切歌模式' }).getByRole('button', {
    name: '随机',
  })
  await randomMode.click()
  await expect(randomMode).toHaveAttribute('aria-pressed', 'true')
  await tracks.getByRole('listitem').first().getByRole('button').click()

  const persistentPlayer = page.getByTestId('persistent-bilibili-player')
  const iframe = persistentPlayer.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(iframe).toBeAttached()
  const playerUrl = new URL((await iframe.getAttribute('src'))!)
  expect(playerUrl.searchParams.get('bvid')).toBe(first!.bvid)
  expect(playerUrl.searchParams.get('autoplay')).toBe('1')
  expect(playerUrl.searchParams.get('t')).toBe('0')
  expect(await iframe.getAttribute('tabindex')).toBeNull()
  expect(await iframe.getAttribute('inert')).toBeNull()
  expect(await iframe.getAttribute('aria-hidden')).toBeNull()
  expect(await iframe.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('auto')

  const embeddedPlayer = persistentPlayer.frameLocator('iframe[title^="Bilibili 外链播放器："]')
  const embeddedControl = embeddedPlayer.getByRole('button', { name: '播放器内部操作' })
  await embeddedControl.click()
  await expect(embeddedPlayer.getByTestId('embedded-result')).toHaveText('鼠标已操作')
  await embeddedControl.focus()
  await expect(iframe).toBeFocused()
  await embeddedControl.press('Enter')
  await expect(embeddedPlayer.getByTestId('embedded-result')).toHaveText('键盘已操作')

  const iframeHandle = await iframe.elementHandle()
  const frameContainer = persistentPlayer.locator('.persistent-bilibili-player__frame')
  await persistentPlayer.getByRole('button', { name: '隐藏画面' }).click()
  await expect(frameContainer).toHaveAttribute('inert', '')
  await expect(frameContainer).toHaveAttribute('aria-hidden', 'true')
  expect(await frameContainer.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe(
    'none',
  )
  await persistentPlayer.getByRole('button', { name: '显示画面' }).click()
  expect(
    await iframe.evaluate((element, original) => element.isSameNode(original), iframeHandle!),
  ).toBe(true)

  await page.waitForTimeout(1_200)
  await persistentPlayer.getByRole('button', { name: '暂停播放' }).click()
  await expect(iframe).toHaveCount(0)
  await expect(persistentPlayer).toHaveAttribute('data-playback-state', 'paused')
  await persistentPlayer.getByRole('button', { name: '继续播放' }).click()
  const resumedIframe = persistentPlayer.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(resumedIframe).toBeAttached()
  expect(
    Number(new URL((await resumedIframe.getAttribute('src'))!).searchParams.get('t')),
  ).toBeGreaterThanOrEqual(1)

  await expect(panel.locator('.context-panel__close')).toHaveCount(0)
  await enterReality(page)
  await page.locator('[data-hotspot="唱片机"]').click()
  const reopenedPanel = page.locator('.context-panel--record-player')
  await expect(
    reopenedPanel.getByRole('group', { name: '切歌模式' }).getByRole('button', { name: '随机' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(reopenedPanel.getByRole('list', { name: '全站第一曲目' })).toContainText(
    firstDisplayTitle!,
  )
  const persistentIframe = page.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(persistentIframe).toHaveCount(1)
  expect(new URL((await persistentIframe.getAttribute('src'))!).searchParams.get('bvid')).toBe(
    first!.bvid,
  )
})

test('收藏墙曲库外视频播完后，单曲从头重播且列表接入 Dynamite', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '外部收藏视频续播只在桌面 Chromium 验证')
  test.setTimeout(90_000)

  const [videoResponse, millionShotResponse] = await Promise.all([
    request.get('data/video-catalog.json'),
    request.get('data/million-shot-posters.json'),
  ])
  expect(videoResponse.ok()).toBe(true)
  expect(millionShotResponse.ok()).toBe(true)
  const catalog = (await videoResponse.json()) as VideoCatalog
  const millionShotManifest = (await millionShotResponse.json()) as MillionShotManifest
  const recordPlayerBvids = new Set(catalog.recordPlayer.items.map((track) => track.bvid))
  const titleCounts = new Map<string, number>()
  for (const item of millionShotManifest.items) {
    titleCounts.set(item.title, (titleCounts.get(item.title) ?? 0) + 1)
  }
  const externalCollectible = millionShotManifest.items
    .filter(
      (
        item,
      ): item is MillionShotManifest['items'][number] & { metadata: { video: VideoSummary } } =>
        item.metadata.video !== undefined &&
        !recordPlayerBvids.has(item.metadata.video.bvid) &&
        titleCounts.get(item.title) === 1,
    )
    .sort(
      (left, right) => left.metadata.video.durationSeconds - right.metadata.video.durationSeconds,
    )
    .at(0)
  const [dynamite] = catalog.recordPlayer.items
  expect(externalCollectible).toBeDefined()
  expect(dynamite?.title).toMatch(/Dynamite/iu)

  await page.clock.install({ time: new Date('2026-08-09T10:00:00+08:00') })
  await startGame(page, {
    debug: true,
    seed: 'external-video-ended-e2e',
    displayName: '收藏续播测试',
  })
  await openDebugPanel(page)
  await page.getByRole('button', { name: '一键全收集', exact: true }).click()
  await page
    .getByRole('group', { name: '确认一键全收集' })
    .getByRole('button', { name: '确认全收集' })
    .click()

  const playerRequestUrls: string[] = []
  await page.route('https://player.bilibili.com/**', async (route) => {
    playerRequestUrls.push(route.request().url())
    await route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>播放器替身</title>',
    })
  })

  await page.locator('[data-hotspot="唱片机"]').click()
  const recordPanel = page.locator('.context-panel--record-player')
  const modeGroup = recordPanel.getByRole('group', { name: '切歌模式' })
  await modeGroup.getByRole('button', { name: '单曲' }).click()

  const openExternalCollectible = async () => {
    const album = await openAlbum(page)
    await album.getByRole('tab', { name: '百万直拍' }).click()
    const card = album.getByRole('button', {
      name: `${externalCollectible!.title}，百万直拍，打开详情`,
      exact: true,
    })
    await card.scrollIntoViewIfNeeded()
    await card.click()
    const detail = page.getByRole('dialog', { name: externalCollectible!.title })
    await expect(detail).toBeVisible()
    return { album, detail }
  }

  const persistentPlayer = page.getByTestId('persistent-bilibili-player')
  const { album: singleAlbum, detail: singleDetail } = await openExternalCollectible()
  const singleIframe = persistentPlayer.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(singleIframe).toBeAttached()
  await expect.poll(() => playerRequestUrls.length).toBe(1)
  await page.waitForTimeout(50)
  const singleIframeHandle = await singleIframe.elementHandle()
  const singleRequestId = await singleIframe.getAttribute('data-request-id')
  const singleUrl = new URL((await singleIframe.getAttribute('src'))!)
  expect(singleUrl.searchParams.get('bvid')).toBe(externalCollectible!.metadata.video.bvid)
  expect(singleUrl.searchParams.get('t')).toBe('0')

  await page.clock.fastForward(externalCollectible!.metadata.video.durationSeconds * 1_000 + 1)
  await expect.poll(() => playerRequestUrls.length).toBe(2)
  const replayedIframe = persistentPlayer.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(replayedIframe).toBeAttached()
  expect(await singleIframeHandle!.evaluate((element) => element.isConnected)).toBe(false)
  expect(await replayedIframe.getAttribute('data-request-id')).not.toBe(singleRequestId)
  const replayedUrl = new URL((await replayedIframe.getAttribute('src'))!)
  expect(replayedUrl.searchParams.get('bvid')).toBe(externalCollectible!.metadata.video.bvid)
  expect(replayedUrl.searchParams.get('t')).toBe('0')
  expect(new URL(playerRequestUrls.at(-1)!).searchParams.get('t')).toBe('0')

  await singleDetail.getByRole('button', { name: '关闭详情' }).click()
  await singleAlbum.getByRole('button', { name: '关闭收藏墙' }).click()
  await page.locator('[data-hotspot="唱片机"]').click()
  await page
    .locator('.context-panel--record-player')
    .getByRole('group', { name: '切歌模式' })
    .getByRole('button', { name: '列表' })
    .click()
  await openExternalCollectible()
  await expect.poll(() => playerRequestUrls.length).toBe(3)
  const externalListIframe = persistentPlayer.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(externalListIframe).toBeAttached()
  await page.waitForTimeout(50)
  const externalListHandle = await externalListIframe.elementHandle()
  const externalListRequestId = await externalListIframe.getAttribute('data-request-id')

  await page.clock.fastForward(externalCollectible!.metadata.video.durationSeconds * 1_000 + 1)
  await expect.poll(() => playerRequestUrls.length).toBe(4)
  const dynamiteIframe = persistentPlayer.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(dynamiteIframe).toBeAttached()
  expect(await externalListHandle!.evaluate((element) => element.isConnected)).toBe(false)
  expect(await dynamiteIframe.getAttribute('data-request-id')).not.toBe(externalListRequestId)
  const dynamiteUrl = new URL((await dynamiteIframe.getAttribute('src'))!)
  expect(dynamiteUrl.searchParams.get('bvid')).toBe(dynamite!.bvid)
  expect(dynamiteUrl.searchParams.get('t')).toBe('0')
  expect(new URL(playerRequestUrls.at(-1)!).searchParams.get('bvid')).toBe(dynamite!.bvid)
  expect(new URL(playerRequestUrls.at(-1)!).searchParams.get('t')).toBe('0')
})

test('播放器跨房间面板、收藏墙与苹果钟时保持同一个 iframe 节点', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '播放器节点身份只在桌面 Chromium 验证')

  await startGame(page, { seed: 'player-identity-v5', displayName: '播放器节点测试' })
  await page.route('https://player.bilibili.com/**', async (route) => route.abort())

  await page.locator('[data-hotspot="唱片机"]').click()
  await page
    .locator('.context-panel--record-player')
    .getByRole('list', { name: '全站第一曲目' })
    .getByRole('listitem')
    .first()
    .getByRole('button')
    .click()

  const iframe = page.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(iframe).toHaveCount(1)
  const originalIframe = await iframe.elementHandle()
  expect(originalIframe).not.toBeNull()

  const expectOriginalIframe = async () => {
    await expect(iframe).toHaveCount(1)
    expect(
      await iframe.evaluate((current, original) => current.isSameNode(original), originalIframe!),
    ).toBe(true)
  }

  await expectOriginalIframe()
  const album = await openAlbum(page)
  await expectOriginalIframe()
  await album.getByRole('button', { name: '关闭收藏墙' }).click()
  await expectOriginalIframe()

  const persistentPlayer = page.getByTestId('persistent-bilibili-player')
  const dimensionToggle = page.getByRole('button', { name: '切换到现实生活维度' })
  await expectNoOverlap(persistentPlayer, dimensionToggle, ['收起后的持久播放器', '维度切换按钮'])

  await enterReality(page)
  await expectOriginalIframe()
  await page.locator('[data-hotspot="一楼电脑"]').click()
  const workPanel = page.locator('.context-panel--reality-work')
  await workPanel
    .getByRole('group', { name: '苹果钟时长' })
    .getByRole('button', { name: /^25 分钟/u })
    .click()
  await workPanel.getByRole('button', { name: '开始苹果钟' }).click()
  await page
    .getByRole('alertdialog', { name: '确认开始苹果钟？' })
    .getByRole('button', { name: '确认开始' })
    .click()
  await expect(page.getByRole('dialog', { name: '和饼狗一起专注' })).toBeVisible()
  await expectOriginalIframe()
  const focusExpandedBox = await persistentPlayer.boundingBox()
  expect(focusExpandedBox).not.toBeNull()
  await persistentPlayer.getByRole('button', { name: '隐藏画面' }).click()
  await expect(persistentPlayer).toHaveAttribute('data-dock-state', 'collapsed')
  const focusCollapsedBox = await persistentPlayer.boundingBox()
  expect(focusCollapsedBox).not.toBeNull()
  expect(Math.abs(focusCollapsedBox!.width - focusExpandedBox!.width)).toBeLessThan(0.5)
  await persistentPlayer.getByRole('button', { name: '显示画面' }).click()
  await expectOriginalIframe()

  await page
    .getByRole('dialog', { name: '和饼狗一起专注' })
    .getByRole('button', { name: '取消本次计时' })
    .click()
  await page
    .getByRole('alertdialog', { name: '确认取消苹果钟？' })
    .getByRole('button', { name: '确认取消' })
    .click()
})

test('390px 移动端播放器在展开与收起后都避开房屋角落控件', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', '移动角落安全区只在移动 Chromium 验证')
  await page.setViewportSize({ width: 390, height: 844 })
  await startGame(page, { seed: 'mobile-player-v4', displayName: '移动播放器' })
  await page.route('https://player.bilibili.com/**', async (route) => route.abort())

  await page.locator('[data-hotspot="唱片机"]').click()
  const recordPanel = page.locator('.context-panel--record-player')
  await recordPanel
    .getByRole('list', { name: '全站第一曲目' })
    .getByRole('listitem')
    .first()
    .getByRole('button')
    .click()

  const player = page.getByTestId('persistent-bilibili-player')
  const iframe = player.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(player).toHaveAttribute('data-dock-state', 'expanded')
  await expect(iframe).toBeAttached()
  const expandedBox = await player.boundingBox()
  expect(expandedBox).not.toBeNull()
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

  await player.getByRole('button', { name: '隐藏画面' }).click()
  await expect(player).toHaveAttribute('data-dock-state', 'collapsed')
  const collapsedBox = await player.boundingBox()
  expect(collapsedBox).not.toBeNull()
  expect(Math.abs(collapsedBox!.width - expandedBox!.width)).toBeLessThan(0.5)
  const collapsedControls = player.getByRole('button')
  for (let index = 0; index < (await collapsedControls.count()); index += 1) {
    await expectMinimumTouchTarget(collapsedControls.nth(index), `收起播放器按钮 ${index + 1}`)
  }
  expect(await iframeHandle!.evaluate((element) => element.isConnected)).toBe(true)
  await expectElementWithinViewport(player)
  await expectNoOverlap(player, dimension, ['收起后的持久播放器', '维度切换按钮'])

  await dimension.click()
  const unavailable = page.getByRole('dialog', { name: '请使用电脑浏览器' })
  await expect(unavailable).toContainText('鼠标或触控板')
  await expect(unavailable.getByRole('button', { name: '知道了' })).toBeFocused()
  await unavailable.getByRole('button', { name: '知道了' }).click()
  await expect(page.locator('[data-hotspot="一楼电脑"]')).toHaveCount(0)
  await saveScreenshot(page, 'mobile-390x844-player-corners.png', false)
})
