import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

import {
  addDebugApples,
  buySupply,
  completeActivity,
  openAlbum,
  openDebugPanel,
  saveScreenshot,
  setDebugDuration,
  setProbability,
  startActivity,
  startGame,
} from './support/game'

interface ManifestItem {
  id: string
  title: string
  images: Array<{ path: string; width: number; height: number }>
  metadata: {
    video?: {
      bvid: string
      title: string
    }
  }
}

interface Manifest {
  items: ManifestItem[]
}

async function readManifest(request: APIRequestContext, path: string) {
  const response = await request.get(path)
  expect(response.ok()).toBe(true)
  return (await response.json()) as Manifest
}

async function dismissReward(reward: Locator) {
  const button = reward.getByRole('button', { name: /收好这份回忆|回到房间/u })
  await button.click()
  await expect(reward).toBeHidden()
}

async function sleepAndWake(page: Page) {
  await startActivity(page, '床铺', '好好睡一觉')
  const reward = await completeActivity(page)
  await expect(reward).toContainText('饼狗睡醒啦')
  await dismissReward(reward)
}

async function runCollectionActivity(
  page: Page,
  options: { area: string; activity: string; rewardHeading: string },
) {
  await startActivity(page, options.area, options.activity)
  const reward = await completeActivity(page)
  await expect(reward).toContainText(options.rewardHeading)
  await expect(reward).toContainText('新收藏')
  return reward
}

test.describe('收藏获取序列', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', '收藏序列只在桌面 Chromium 验证')
    await startGame(page, { debug: true, seed: 'e2e-4', displayName: '收藏测试' })
    await setDebugDuration(page, '10 秒')
  })

  test('百万直拍从未拥有池随机抽取且不重复', async ({ page }) => {
    await setProbability(page, '百万直拍', 100)
    await buySupply(page, '信号耳机')
    await buySupply(page, '信号耳机')

    const first = await runCollectionActivity(page, {
      area: '电脑',
      activity: '认真刷播',
      rewardHeading: '把这一刻好好珍藏',
    })
    const firstTitle = await first.locator('.reward-collectible strong').innerText()
    await dismissReward(first)
    await sleepAndWake(page)

    const second = await runCollectionActivity(page, {
      area: '电脑',
      activity: '认真刷播',
      rewardHeading: '把这一刻好好珍藏',
    })
    const secondTitle = await second.locator('.reward-collectible strong').innerText()
    expect(secondTitle).not.toBe(firstTitle)
    await dismissReward(second)

    const album = await openAlbum(page)
    await expect(album.getByRole('tab', { name: '百万直拍' })).toBeVisible()
    await expect(album.locator('.collectible-card')).toHaveCount(2)
  })

  test('明信片从未拥有池随机抽取且不重复', async ({ page }) => {
    await setProbability(page, '旅行遇见朋友', 0)
    await setProbability(page, '明信片', 100)
    await buySupply(page, '普通旅行便当')

    const first = await runCollectionActivity(page, {
      area: '房门',
      activity: '出去旅行',
      rewardHeading: '旅途中遇见一份风景',
    })
    const firstTitle = await first.locator('.reward-collectible strong').innerText()
    await dismissReward(first)
    await sleepAndWake(page)

    const second = await runCollectionActivity(page, {
      area: '房门',
      activity: '出去旅行',
      rewardHeading: '旅途中遇见一份风景',
    })
    const secondTitle = await second.locator('.reward-collectible strong').innerText()
    expect(secondTitle).not.toBe(firstTitle)
    await dismissReward(second)

    const album = await openAlbum(page)
    await expect(album.getByRole('tab', { name: '明信片' })).toBeVisible()
    await expect(album.locator('.collectible-card')).toHaveCount(2)
  })

  test('全站第一从 Dynamite 到 POWER 严格按时间顺序且不重复', async ({ page }) => {
    await setProbability(page, '全站第一', 100)
    await addDebugApples(page)
    await buySupply(page, '热度工具箱')
    await buySupply(page, '热度工具箱')

    const first = await runCollectionActivity(page, {
      area: '电脑',
      activity: '全力冲热',
      rewardHeading: '全站第一！',
    })
    await expect(first).toContainText('Dynamite Cover')
    await dismissReward(first)
    await sleepAndWake(page)

    const second = await runCollectionActivity(page, {
      area: '电脑',
      activity: '全力冲热',
      rewardHeading: '全站第一！',
    })
    await expect(second).toContainText('Talk WORTHY? Talk DIRTY! 直拍')
    await dismissReward(second)

    const album = await openAlbum(page)
    await expect(album.getByRole('tab', { name: '全站第一' })).toBeVisible()
    await expect(album.locator('.collectible-card strong')).toHaveText([
      'Talk WORTHY? Talk DIRTY! 直拍',
      'Dynamite Cover',
    ])
  })
})

test('旅行遇见朋友与明信片互斥，朋友送礼并解锁“好朋友们”', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '好友奖励只在桌面 Chromium 验证')
  await startGame(page, { debug: true, seed: 'friend-e2e', displayName: '朋友测试' })
  await setDebugDuration(page, '10 秒')
  await setProbability(page, '旅行遇见朋友', 100)
  await setProbability(page, '明信片', 100)

  await startActivity(page, '房门', '出去旅行')
  const reward = await completeActivity(page)
  await expect(reward.locator('.reward-friend')).toBeVisible()
  const rewardFriendImage = reward.locator('.reward-friend img')
  await expect(rewardFriendImage).toHaveJSProperty('complete', true)
  const rewardFriendBox = await rewardFriendImage.boundingBox()
  expect(rewardFriendBox).not.toBeNull()
  expect(rewardFriendBox!.width / rewardFriendBox!.height).toBeCloseTo(1, 1)
  await expect(reward).toContainText(/送来一份/u)
  await expect(reward.locator('.reward-collectible')).toHaveCount(0)
  await saveScreenshot(page, 'friend-reward.png', false)
  await dismissReward(reward)

  const album = await openAlbum(page)
  await expect(album.getByRole('tab', { name: '好朋友们' })).toBeVisible()
  await expect(album.getByRole('tab', { name: '明信片' })).toHaveCount(0)
  await album.getByRole('tab', { name: '好朋友们' }).click()
  await expect(album.locator('.friend-card')).toHaveCount(1)
  const albumFriendImage = album.locator('.friend-card img')
  await expect(albumFriendImage).toHaveJSProperty('complete', true)
  const albumFriendBox = await albumFriendImage.boundingBox()
  expect(albumFriendBox).not.toBeNull()
  expect(albumFriendBox!.width / albumFriendBox!.height).toBeCloseTo(1, 1)
  await saveScreenshot(page, 'friends-album.png', false)
})

test('明信片奖励不显示活动完成，弹窗无可见滚动条与顶部图片残片', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '奖励视觉只在桌面 Chromium 验证')
  await startGame(page, { debug: true, seed: 'postcard-e2e', displayName: '明信片测试' })
  await setDebugDuration(page, '10 秒')
  await setProbability(page, '旅行遇见朋友', 0)
  await setProbability(page, '明信片', 100)

  await startActivity(page, '房门', '出去旅行')
  const reward = await completeActivity(page)
  await expect(reward).toContainText('旅途中遇见一份风景')
  await expect(reward).not.toContainText('活动完成')
  await expect(reward).not.toContainText('Bingo 完成')
  await expect(reward.locator('.reward-collectible img')).toHaveCSS('object-fit', 'cover')

  const metrics = await reward.evaluate((element) => {
    const mascot = element.querySelector<HTMLElement>('.reward-mascot')!
    const sprite = mascot.querySelector<HTMLElement>('.mascot-sprite')!
    const mascotBox = mascot.getBoundingClientRect()
    const spriteBox = sprite.getBoundingClientRect()
    return {
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      horizontalOverflow: element.scrollWidth - element.clientWidth,
      mascotOverflow: getComputedStyle(mascot).overflow,
      spriteInside:
        spriteBox.left >= mascotBox.left - 1 &&
        spriteBox.right <= mascotBox.right + 1 &&
        spriteBox.top >= mascotBox.top - 1,
    }
  })
  expect(metrics.scrollbarWidth).toBe('none')
  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1)
  expect(metrics.mascotOverflow).toBe('hidden')
  expect(metrics.spriteInside).toBe(true)
  await saveScreenshot(page, 'postcard-reward.png', false)
})

test('DEBUG 全收集包含好友，Survivors 自动播放，并可清空收集', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '完整收藏墙只在桌面 Chromium 验证')
  const [postcards, million, siteFirsts, friendsResponse] = await Promise.all([
    readManifest(request, 'data/postcards.json'),
    readManifest(request, 'data/million-shot-posters.json'),
    readManifest(request, 'data/site-firsts.json'),
    request.get('data/friends.json'),
  ])
  expect(friendsResponse.ok()).toBe(true)
  const friends = (await friendsResponse.json()) as { items: unknown[] }
  expect(postcards.items).toHaveLength(100)
  const expectedTotal = postcards.items.length + million.items.length + siteFirsts.items.length
  const survivors = million.items.find((item) => item.id === 'million-shot-108')!
  expect(survivors).toBeDefined()

  await startGame(page, { debug: true, seed: 'e2e-4', displayName: '全收藏测试' })
  await openDebugPanel(page)
  await page.getByRole('button', { name: '一键全收集', exact: true }).click()
  const confirmation = page.getByRole('group', { name: '确认一键全收集' })
  await confirmation.getByRole('button', { name: '确认全收集' }).click()

  const album = await openAlbum(page)
  await expect(album).toContainText(`全部集齐 · ${expectedTotal} / ${expectedTotal}`)
  await expect(album).not.toContainText('最近遇见的回忆排在最前面')
  await expect(album).not.toContainText('新遇见的回忆和朋友排在最前面')
  const firstDate = album.locator('.collection-date').first()
  await expect(firstDate).toHaveText(/\d+月\d+日/u)
  await expect(firstDate).toHaveCSS('font-family', /TravellingBingo UI/u)
  await expect(album.getByRole('tab', { name: '明信片' })).toHaveCSS(
    'font-family',
    /TravellingBingo Display/u,
  )
  for (const [tabName, count] of [
    ['明信片', postcards.items.length],
    ['百万直拍', million.items.length],
    ['全站第一', siteFirsts.items.length],
  ] as const) {
    await album.getByRole('tab', { name: tabName }).click()
    await expect(album.locator('.collectible-card')).toHaveCount(count)
  }

  await album.getByRole('tab', { name: '好朋友们' }).click()
  await expect(album.locator('.friend-card')).toHaveCount(friends.items.length)
  await expect(album.locator('.friend-card__portrait').first()).toHaveCSS('object-fit', 'cover')
  const friendCopies = await album.locator('.friend-card').allInnerTexts()
  expect(friendCopies.every((copy) => !/收到\s*\d+🍎/u.test(copy))).toBe(true)

  await album.getByRole('tab', { name: '百万直拍' }).click()
  await page.route('https://player.bilibili.com/**', async (route) => route.abort())
  await album.getByRole('button', { name: /Survivors，百万直拍，打开详情/u }).click()
  const detail = page.locator('.collectible-detail--v3')
  await expect(detail).toBeVisible()
  const detailBox = await detail.boundingBox()
  expect(detailBox).not.toBeNull()
  expect(detailBox!.width / detailBox!.height).toBeCloseTo(16 / 9, 1)
  const detailImage = detail.locator('.collectible-detail__image img')
  await expect(detailImage).toHaveJSProperty('complete', true)
  await expect(detailImage).toHaveCSS('object-fit', 'contain')
  const imageMetrics = await detailImage.evaluate((image: HTMLImageElement) => ({
    currentSrc: image.currentSrc,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }))
  expect(
    survivors.images
      .map((image) => image.path)
      .some((path) => imageMetrics.currentSrc.endsWith(path)),
  ).toBe(true)
  expect(imageMetrics.naturalWidth / imageMetrics.naturalHeight).toBeCloseTo(2 / 3, 4)

  const video = survivors.metadata.video!
  await expect(detail).toContainText(video.title)
  await expect(detail.locator('.bilibili-player-summary')).toHaveText(video.title)
  await expect(detail.locator('.bilibili-player__note')).toHaveCount(0)
  await expect(detail.getByRole('button', { name: /打开播放器|关闭播放器/u })).toHaveCount(0)
  await expect(detail.locator('iframe')).toHaveCount(0)
  const persistentPlayer = page.getByTestId('persistent-bilibili-player')
  const iframe = persistentPlayer.locator('iframe[title^="Bilibili 外链播放器："]')
  await expect(iframe).toBeAttached()
  await expect(page.locator('iframe[title^="Bilibili 外链播放器："]')).toHaveCount(1)
  const playerUrl = new URL((await iframe.getAttribute('src'))!)
  expect(playerUrl.hostname).toBe('player.bilibili.com')
  expect(playerUrl.searchParams.get('bvid')).toBe(video.bvid)
  expect(playerUrl.searchParams.get('autoplay')).toBe('1')

  await detail.getByRole('button', { name: '全屏查看Survivors' }).click()
  const fullscreen = page.getByRole('dialog', { name: 'Survivors完整图片' })
  await expect(fullscreen).toBeVisible()
  await expect(fullscreen.locator('.collectible-fullscreen__image')).toHaveCSS(
    'object-fit',
    'contain',
  )
  await expect(fullscreen.getByRole('link', { name: '下载完整图片' })).toHaveAttribute(
    'download',
    /million-shot-108\.webp$/u,
  )
  await saveScreenshot(page, 'survivors-video-detail.png', false)
  await fullscreen.getByRole('button', { name: '退出全屏' }).click()
  await detail.getByRole('button', { name: '关闭详情' }).click()
  await album.getByRole('button', { name: '关闭收藏墙' }).click()

  await openDebugPanel(page)
  await page.getByRole('button', { name: '清空收集', exact: true }).click()
  await page
    .getByRole('group', { name: '确认清空收集' })
    .getByRole('button', { name: '确认清空' })
    .click()
  const clearedAlbum = await openAlbum(page)
  await expect(clearedAlbum.getByRole('tab')).toHaveCount(0)
  await expect(clearedAlbum.locator('.collectible-card')).toHaveCount(0)
  await expect(clearedAlbum.locator('.friend-card')).toHaveCount(0)
  await expect(clearedAlbum).toContainText('惊喜会在相遇时悄悄出现。')
})
