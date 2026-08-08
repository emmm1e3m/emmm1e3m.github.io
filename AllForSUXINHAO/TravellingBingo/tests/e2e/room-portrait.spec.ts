import { expect, test, type Page } from '@playwright/test'

const ROOM_RATIO = 1098 / 1433

const HOTSPOTS = [
  { name: '床铺', x: 22, y: 19 },
  { name: '电脑', x: 50, y: 20 },
  { name: '衣架', x: 51, y: 33 },
  { name: '电子琴', x: 15, y: 75 },
  { name: '冰箱', x: 55, y: 56 },
  { name: '唱片机', x: 72, y: 65 },
  { name: '收藏墙', x: 81, y: 56 },
  { name: '房门', x: 90, y: 71 },
] as const

async function startGame(page: Page, seed = 'e2e-4') {
  await page.addInitScript((value) => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', {
      configurable: true,
      value: () => value,
    })
  }, seed)
  await page.goto('./')
  await page.getByRole('button', { name: '开始新旅程' }).click()
  await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
}

test('portrait 房间保持原图比例、热点坐标和饼狗动作帧', async ({ page }, testInfo) => {
  await startGame(page)

  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  const roomImage = room.getByRole('img', { name: /纵向展开的两层铲铲饼屋/u })
  await expect(roomImage).toHaveJSProperty('complete', true)

  const imageMetrics = await roomImage.evaluate((image: HTMLImageElement) => ({
    currentSrc: image.currentSrc,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }))
  expect(imageMetrics.currentSrc).toMatch(/chan-chan-house-v2-(?:768|1098)\.webp$/u)
  expect(imageMetrics.naturalWidth / imageMetrics.naturalHeight).toBeCloseTo(ROOM_RATIO, 2)

  const roomBox = await room.boundingBox()
  expect(roomBox).not.toBeNull()
  expect(roomBox!.width / roomBox!.height).toBeCloseTo(ROOM_RATIO, 2)

  for (const expected of HOTSPOTS) {
    const hotspot = room.locator(`[data-hotspot="${expected.name}"]`)
    await expect(hotspot).toBeVisible()
    const hotspotBox = await hotspot.boundingBox()
    expect(hotspotBox).not.toBeNull()

    const centerX = hotspotBox!.x + hotspotBox!.width / 2
    const centerY = hotspotBox!.y + hotspotBox!.height / 2
    const normalizedX = ((centerX - roomBox!.x) / roomBox!.width) * 100
    const normalizedY = ((centerY - roomBox!.y) / roomBox!.height) * 100

    expect(normalizedX, `${expected.name} 横向坐标`).toBeCloseTo(expected.x, 0)
    expect(normalizedY, `${expected.name} 纵向坐标`).toBeCloseTo(expected.y, 0)
    expect(hotspotBox!.x).toBeGreaterThanOrEqual(roomBox!.x)
    expect(hotspotBox!.y).toBeGreaterThanOrEqual(roomBox!.y)
    expect(hotspotBox!.x + hotspotBox!.width).toBeLessThanOrEqual(roomBox!.x + roomBox!.width)
    expect(hotspotBox!.y + hotspotBox!.height).toBeLessThanOrEqual(roomBox!.y + roomBox!.height)
  }

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

  if (testInfo.project.name === 'chromium') {
    const panelBox = await page.locator('.context-panel').boundingBox()
    expect(panelBox).not.toBeNull()
    expect(Math.abs(roomBox!.y - panelBox!.y)).toBeLessThanOrEqual(2)
  }

  await room.locator('[data-hotspot="冰箱"]').click()
  await expect(room.locator('.mascot-sprite--walk')).toBeVisible({ timeout: 500 })
  await expect(room.locator('.mascot-sprite--fridge')).toBeVisible({ timeout: 2_000 })

  const petPosition = await room.locator('.room-mascot--actor').evaluate((actor) => {
    const style = getComputedStyle(actor)
    return {
      x: style.getPropertyValue('--pet-x').trim(),
      y: style.getPropertyValue('--pet-y').trim(),
    }
  })
  expect(petPosition).toEqual({ x: '54%', y: '77%' })
})

test('饼狗出门后，房门入口和房间内角色都消失', async ({ page }) => {
  await startGame(page)

  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  await room.locator('[data-hotspot="房门"]').click()
  const travel = page.locator('.activity-card').filter({ hasText: '出去旅行' })
  await expect(travel.getByRole('button', { name: '开始出去旅行' })).toBeEnabled()
  await travel.getByRole('button', { name: '开始出去旅行' }).click()

  await expect(room.locator('[data-hotspot="房门"]')).toHaveCount(0)
  await expect(room.locator('.room-mascot--actor')).toHaveCount(0)
  await expect(room.locator('.travel-note')).toContainText('饼狗出门啦')
})
