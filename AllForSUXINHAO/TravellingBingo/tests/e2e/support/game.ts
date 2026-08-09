import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { expect, type Locator, type Page } from '@playwright/test'

export const TEST_PLAYER_NAME = '小苹果'

export type ProbabilityLabel = '明信片' | '百万直拍' | '全站第一' | '旅行遇见朋友' | '音乐遇见朋友'

interface StartGameOptions {
  seed?: string
  displayName?: string
  debug?: boolean
}

/** 在文档脚本前固定领域随机种子，保证偏好与奖励可重复。 */
export async function installStableSeed(page: Page, seed: string) {
  await page.addInitScript((value) => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', {
      configurable: true,
      value: () => value,
    })
  }, seed)
}

export async function startGame(page: Page, options: StartGameOptions = {}) {
  const { seed = 'e2e-4', displayName = TEST_PLAYER_NAME, debug = false } = options

  await installStableSeed(page, seed)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()

  if (debug) {
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
  }

  await page.getByRole('button', { name: '全新旅程' }).click()
  const newJourneyDialog = page.getByRole('dialog', { name: '开启一段全新的旅程' })
  await newJourneyDialog.getByLabel('如何称呼你？').fill(displayName)
  await newJourneyDialog.getByRole('button', { name: '开始全新旅程' }).click()
  await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
  await expect(page.locator('.hud-companion')).toContainText(`${displayName}陪伴饼狗已经`)
  if (debug) {
    await expect(page.getByRole('button', { name: '打开调试面板' })).toBeVisible()
  }
}

export async function enterReality(page: Page) {
  const toggle = page.getByRole('button', { name: '切换到现实生活维度' })
  await toggle.click()
  const dialog = page.getByRole('dialog', { name: '进入现实维度？' })
  await expect(dialog).toContainText('完整的工作与休息苹果钟')
  await expect(dialog.getByRole('button', { name: '进入现实维度' })).toBeFocused()
  await dialog.getByRole('button', { name: '进入现实维度' }).click()
  await expect(page.getByRole('button', { name: '回到旅行饼狗游戏' })).toBeVisible()
}

export async function openDebugPanel(page: Page) {
  await page.getByRole('button', { name: '打开调试面板' }).click()
  await expect(page.getByRole('heading', { name: '调试房间规则' })).toBeVisible()
}

export async function setDebugDuration(page: Page, label: '10 秒' | '30 秒' | '1 分 12 秒') {
  await openDebugPanel(page)
  const choice = page.getByRole('button', { name: label, exact: true })
  await choice.click()
  await expect(choice).toHaveAttribute('aria-pressed', 'true')
}

export async function setProbability(page: Page, label: ProbabilityLabel, percent: number) {
  const input = page.getByRole('spinbutton', { name: `${label}百分比` })
  await input.fill(String(percent))
  await expect(input).toHaveValue(String(percent))
}

export async function addDebugApples(page: Page) {
  await openDebugPanel(page)
  await page.getByRole('button', { name: '增加 20🍎' }).click()
}

export function readNumber(text: string) {
  const value = Number.parseInt(text.replace(/[^0-9-]/gu, ''), 10)
  if (!Number.isFinite(value)) throw new Error(`无法从“${text}”读取数字`)
  return value
}

export async function readAppleCount(page: Page) {
  return readNumber(await page.locator('.apple-counter strong').innerText())
}

export async function readCompanionDays(page: Page) {
  const companion = page.locator('.hud-companion')
  return readNumber((await companion.getAttribute('title')) ?? (await companion.innerText()))
}

export async function openRoomArea(page: Page, area: string) {
  const hotspot = page.locator(`[data-hotspot="${area}"]`)
  if ((await hotspot.getAttribute('class'))?.includes('is-active')) {
    const openPanel = page.locator('.context-panel:visible')
    if ((await openPanel.count()) > 0) return
  }
  await hotspot.click()
}

export async function buySupply(page: Page, itemName: string) {
  await openRoomArea(page, '冰箱')
  const item = page.locator('.shop-item').filter({ hasText: itemName })
  await expect(item).toBeVisible()
  await item.getByRole('button', { name: /\d+🍎$/u }).click()
  return item
}

export async function readSupplyCount(page: Page, itemName: string) {
  await openRoomArea(page, '冰箱')
  const item = page.locator('.shop-item').filter({ hasText: itemName })
  const text = await item.locator('small').innerText()
  const match = /现有\s*(\d+)\s*份/u.exec(text)
  if (!match) throw new Error(`无法读取“${itemName}”数量：${text}`)
  return Number(match[1])
}

export async function prepareActivity(page: Page, area: string, activityName: string) {
  await openRoomArea(page, area)
  const card = page.locator('.activity-card').filter({ hasText: activityName })
  const prepare = card.getByRole('button', {
    name: new RegExp(`(?:准备|问问饼狗要不要)${activityName}$`, 'u'),
  })
  await expect(prepare).toBeVisible()
  await prepare.click()
  const confirmation = card.getByRole('group', { name: `确认${activityName}` })
  await expect(confirmation).toBeVisible()
  return { card, confirmation }
}

export async function startActivity(page: Page, area: string, activityName: string) {
  const { card, confirmation } = await prepareActivity(page, area, activityName)
  await confirmation.getByRole('button', { name: '确认开始' }).click()
  await expect(page.getByRole('button', { name: '取消当前活动', exact: true })).toBeVisible()
  return card
}

export async function completeActivity(page: Page) {
  await openDebugPanel(page)
  const complete = page.getByRole('button', { name: '立即完成活动' })
  await expect(complete).toBeEnabled()
  await complete.click()
  await page.locator('.game-hud__center').click()
  const claim = page.getByRole('button', { name: '看看这次的结果' })
  await expect(claim).toBeEnabled()
  await claim.click()
  return page.locator('.reward-card--v3')
}

export async function cancelActivity(page: Page) {
  await page.getByRole('button', { name: '取消当前活动', exact: true }).click()
  const confirmation = page.getByRole('group', { name: '确认取消活动' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { name: '继续活动' })).toBeFocused()
  await confirmation.getByRole('button', { name: '确定取消' }).click()
  await expect(page.getByRole('button', { name: '取消当前活动', exact: true })).toHaveCount(0)
}

export async function openAlbum(page: Page) {
  await page.getByRole('button', { name: '打开收藏墙' }).click()
  const album = page.getByRole('dialog', { name: '饼狗的收藏墙' })
  await expect(album).toBeVisible()
  return album
}

export async function saveScreenshot(page: Page, fileName: string, fullPage = true) {
  const outputDirectory = path.resolve(process.cwd(), 'output', 'playwright', 'v5-final')
  await mkdir(outputDirectory, { recursive: true })
  await page.screenshot({
    path: path.join(outputDirectory, fileName),
    fullPage,
    animations: 'disabled',
  })
}

export async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1)
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1)
}

export async function expectElementWithinViewport(locator: Locator) {
  const result = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
    }
  })
  expect(result.left).toBeGreaterThanOrEqual(-1)
  expect(result.right).toBeLessThanOrEqual(result.viewportWidth + 1)
  expect(result.top).toBeGreaterThanOrEqual(-1)
  expect(result.bottom).toBeLessThanOrEqual(result.viewportHeight + 1)
}

export async function expectMinimumTouchTarget(
  locator: Locator,
  label: string,
  minimumWidth = 44,
  minimumHeight = 44,
) {
  await expect(locator, `${label} 应当可见`).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label} 应当有可测量的触控区域`).not.toBeNull()
  expect(box!.width, `${label} 的宽度应当至少为 ${minimumWidth}px`).toBeGreaterThanOrEqual(
    minimumWidth,
  )
  expect(box!.height, `${label} 的高度应当至少为 ${minimumHeight}px`).toBeGreaterThanOrEqual(
    minimumHeight,
  )
}

export async function expectNoOverlap(
  first: Locator,
  second: Locator,
  labels: [string, string] = ['第一个组件', '第二个组件'],
) {
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()])
  expect(firstBox, `${labels[0]}应当有可见边界`).not.toBeNull()
  expect(secondBox, `${labels[1]}应当有可见边界`).not.toBeNull()
  const horizontalOverlap =
    Math.min(firstBox!.x + firstBox!.width, secondBox!.x + secondBox!.width) -
    Math.max(firstBox!.x, secondBox!.x)
  const verticalOverlap =
    Math.min(firstBox!.y + firstBox!.height, secondBox!.y + secondBox!.height) -
    Math.max(firstBox!.y, secondBox!.y)
  expect(horizontalOverlap <= 0 || verticalOverlap <= 0, `${labels[0]}与${labels[1]}不应重叠`).toBe(
    true,
  )
}
