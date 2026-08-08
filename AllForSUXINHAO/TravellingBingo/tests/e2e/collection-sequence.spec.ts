import { expect, test, type Locator, type Page } from '@playwright/test'

type ProbabilityLabel = '明信片' | '百万直拍' | '全站第一'
type ActivityName = '出去旅行' | '认真刷播' | '全力冲热'

test.setTimeout(90_000)

async function startDebugGame(page: Page, seed = 'e2e-4') {
  await page.addInitScript((value) => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', {
      configurable: true,
      value: () => value,
    })
  }, seed)
  await page.goto('./')

  const titleTrigger = page.getByRole('button', {
    name: /旅行饼狗，连续激活五次可打开隐藏门牌/u,
  })
  for (let activation = 0; activation < 5; activation += 1) {
    await titleTrigger.click()
  }
  const dialog = page.getByRole('dialog', { name: '输入调试暗号' })
  await dialog.getByLabel('暗号').fill('TravellingBingo')
  await dialog.getByRole('button', { name: '打开门牌' }).click()
  await page.getByRole('button', { name: '开始新旅程' }).click()
  await expect(page.getByRole('button', { name: 'DEBUG', exact: true })).toBeVisible()
}

async function openDebugPanel(page: Page) {
  await page.getByRole('button', { name: 'DEBUG', exact: true }).click()
  await expect(page.getByRole('heading', { name: '调试房间规则' })).toBeVisible()
}

async function configureDebug(page: Page, probability: ProbabilityLabel) {
  await openDebugPanel(page)
  await page.getByRole('button', { name: '10 秒' }).click()
  const probabilityInput = page.getByRole('spinbutton', { name: `${probability}百分比` })
  await probabilityInput.fill('100')
  await expect(probabilityInput).toHaveValue('100')
  await page.getByRole('button', { name: '增加 20 个苹果' }).click()
}

async function buySupplies(page: Page, name: string, count: number) {
  await page.locator('[data-hotspot="冰箱"]').click()
  const item = page.locator('.shop-item').filter({ hasText: name })
  const stockText = await item.locator('small').innerText()
  const startingCount = Number(/现有\s+(\d+)\s+份/u.exec(stockText)?.[1] ?? Number.NaN)
  expect(startingCount).not.toBeNaN()
  for (let index = 0; index < count; index += 1) {
    await item.getByRole('button', { name: /补充 · \d+ 个苹果/u }).click()
  }
  await expect(item).toContainText(`现有 ${startingCount + count} 份`)
}

async function finishActivity(page: Page) {
  await openDebugPanel(page)
  const complete = page.getByRole('button', { name: '立即完成活动' })
  await expect(complete).toBeEnabled()
  await complete.click()
  const activityStatus = page.locator('.game-hud .hud-activity')
  await expect(activityStatus).toContainText('可以看看结果啦')
  await activityStatus.click()
  await page.getByRole('button', { name: '看看这次的结果' }).click()
}

async function runActivity(
  page: Page,
  options: {
    area: '电脑' | '房门'
    name: ActivityName
    rewardHeading: string
  },
) {
  await page.locator(`[data-hotspot="${options.area}"]`).click()
  const activity = page.locator('.activity-card').filter({ hasText: options.name })
  const start = activity.getByRole('button', { name: `开始${options.name}` })
  await expect(start).toBeEnabled()
  await start.click()
  await finishActivity(page)

  const reward = page.getByRole('dialog', { name: options.rewardHeading })
  await expect(reward).toBeVisible()
  await expect(reward).toContainText('新收藏')
  return reward
}

async function dismissRewardAndRest(page: Page, reward: Locator) {
  await reward.getByRole('button', { name: '收好这份回忆' }).click()
  await page.locator('[data-hotspot="床铺"]').click()
  await expect(page.locator('.day-night-overlay')).toHaveClass(/is-playing/u)
}

async function openAlbum(page: Page) {
  await page.locator('.game-hud').getByRole('button', { name: '打开收藏墙' }).click()
  return page.getByRole('dialog', { name: '一路珍藏的风景' })
}

test.describe('收藏获取序列', () => {
  test.skip(({ isMobile }) => isMobile, '收藏序列在桌面 Chromium 验证一次')

  test('百万直拍从未拥有池随机抽取，不会重复', async ({ page }) => {
    await startDebugGame(page)
    await configureDebug(page, '百万直拍')
    await buySupplies(page, '信号耳机', 2)

    const firstShot = await runActivity(page, {
      area: '电脑',
      name: '认真刷播',
      rewardHeading: '把这一刻好好珍藏',
    })
    await dismissRewardAndRest(page, firstShot)
    const secondShot = await runActivity(page, {
      area: '电脑',
      name: '认真刷播',
      rewardHeading: '把这一刻好好珍藏',
    })
    await secondShot.getByRole('button', { name: '收好这份回忆' }).click()

    const album = await openAlbum(page)
    await expect(album.getByRole('tab', { name: '百万直拍' })).toBeVisible()
    await expect(album.locator('.collectible-card')).toHaveCount(2)
    const shotTitles = await album.locator('.collectible-card strong').allTextContents()
    expect(new Set(shotTitles).size).toBe(2)
    await expect(album).not.toContainText(/\d+\s*\/\s*\d+/u)
  })

  test('明信片从未拥有池随机抽取，不会重复', async ({ page }) => {
    await startDebugGame(page)
    await configureDebug(page, '明信片')
    await buySupplies(page, '普通旅行便当', 1)

    const firstPostcard = await runActivity(page, {
      area: '房门',
      name: '出去旅行',
      rewardHeading: '旅途中遇见一份风景',
    })
    await dismissRewardAndRest(page, firstPostcard)
    const secondPostcard = await runActivity(page, {
      area: '房门',
      name: '出去旅行',
      rewardHeading: '旅途中遇见一份风景',
    })
    await secondPostcard.getByRole('button', { name: '收好这份回忆' }).click()

    const album = await openAlbum(page)
    await expect(album.getByRole('tab', { name: '明信片' })).toBeVisible()
    await expect(album.locator('.collectible-card')).toHaveCount(2)
    const postcardTitles = await album.locator('.collectible-card strong').allTextContents()
    expect(new Set(postcardTitles).size).toBe(2)
    await expect(album).not.toContainText(/\d+\s*\/\s*\d+/u)
  })

  test('全站第一严格从 Dynamite 到 POWER 依时间顺序领取', async ({ page }) => {
    await startDebugGame(page)
    await configureDebug(page, '全站第一')
    await buySupplies(page, '热度工具箱', 2)

    const first = await runActivity(page, {
      area: '电脑',
      name: '全力冲热',
      rewardHeading: '全站第一！',
    })
    await expect(first).toContainText('Dynamite Cover')
    await dismissRewardAndRest(page, first)

    const second = await runActivity(page, {
      area: '电脑',
      name: '全力冲热',
      rewardHeading: '全站第一！',
    })
    await expect(second).toContainText('Talk WORTHY? Talk DIRTY! 直拍')
    await second.getByRole('button', { name: '收好这份回忆' }).click()

    const album = await openAlbum(page)
    await expect(album.getByRole('tab', { name: '全站第一' })).toBeVisible()
    await expect(album.getByRole('tab', { name: '明信片' })).toHaveCount(0)
    await expect(album.getByRole('tab', { name: '百万直拍' })).toHaveCount(0)
    await expect(album.locator('.collectible-card')).toHaveCount(2)
    await expect(album.locator('.collectible-card strong')).toHaveText([
      'Talk WORTHY? Talk DIRTY! 直拍',
      'Dynamite Cover',
    ])
    await expect(album).not.toContainText(/\d+\s*\/\s*\d+/u)
  })

  test('一键全收集使用页内确认，且全部集齐后才显示动态总数', async ({ page }) => {
    await startDebugGame(page)
    await openDebugPanel(page)

    const collectAll = page.getByRole('button', { name: '一键全收集', exact: true })
    await expect(collectAll).toBeVisible()
    await collectAll.click()

    const confirmation = page.getByRole('group', { name: /确认.*全收集/u })
    await expect(confirmation).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await confirmation.getByRole('button', { name: /确认.*全收集/u }).click()

    const album = await openAlbum(page)
    const tabs = album.getByRole('tab')
    await expect(tabs).toHaveCount(3)

    let collectedTotal = 0
    for (const category of ['明信片', '百万直拍', '全站第一']) {
      await album.getByRole('tab', { name: category }).click()
      collectedTotal += await album.locator('.collectible-card').count()
    }

    expect(collectedTotal).toBeGreaterThan(0)
    await expect(album).toContainText(`全部集齐 · ${collectedTotal} / ${collectedTotal}`)
  })
})
