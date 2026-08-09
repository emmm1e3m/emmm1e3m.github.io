import { expect, test } from '@playwright/test'

import { saveScreenshot, startActivity, startGame } from './support/game'

const ROOM_RATIO = 1098 / 1433

const HOTSPOTS = [
  { name: '床铺', x: 22, y: 29 },
  { name: '电脑', x: 52, y: 29 },
  { name: '衣架', x: 54, y: 44 },
  { name: '电子琴', x: 17, y: 79 },
  { name: '冰箱', x: 50, y: 59 },
  { name: '唱片机', x: 75, y: 74 },
  { name: '收藏墙', x: 81, y: 60 },
  { name: '房门', x: 92, y: 74 },
] as const

const GAME_PET_CENTERS = [
  { hotspot: '床铺', x: 225, y: 300 },
  { hotspot: '电脑', x: 504, y: 409 },
  { hotspot: '衣架', x: 387, y: 675 },
  { hotspot: '电子琴', x: 257, y: 1103 },
  { hotspot: '冰箱', x: 633, y: 951 },
  { hotspot: '唱片机', x: 783, y: 1030 },
  { hotspot: '收藏墙', x: 1053, y: 673 },
  { hotspot: '房门', x: 980, y: 1176 },
] as const

function expectNear(actual: number, expected: number, tolerance = 2) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

for (const viewport of [
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1975, height: 1536, name: '1975x1536' },
] as const) {
  test(`${viewport.name} 顶栏、房间和信息栏严格对齐且待机房间可展开`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', '精确桌面布局仅在 Desktop Chromium 验证')
    await page.setViewportSize(viewport)
    await startGame(page, { seed: 'layout-e2e', displayName: '对齐测试' })

    const hud = page.locator('.game-hud--v3')
    const layout = page.locator('.game-layout--v3')
    const room = page.locator('.room-card--v3')
    await expect(page.locator('.context-panel')).toHaveCount(0)

    const [hudIdle, layoutIdle, roomIdle] = await Promise.all([
      hud.boundingBox(),
      layout.boundingBox(),
      room.boundingBox(),
    ])
    expect(hudIdle).not.toBeNull()
    expect(layoutIdle).not.toBeNull()
    expect(roomIdle).not.toBeNull()
    expectNear(layoutIdle!.x, hudIdle!.x)
    expectNear(layoutIdle!.x + layoutIdle!.width, hudIdle!.x + hudIdle!.width)
    expectNear(roomIdle!.x, hudIdle!.x)
    expectNear(roomIdle!.x + roomIdle!.width, hudIdle!.x + hudIdle!.width)

    await page.locator('[data-hotspot="冰箱"]').click()
    const panel = page.locator('.context-panel--fridge')
    await expect(panel).toBeVisible()
    const [hudOpen, layoutOpen, roomOpen, panelOpen] = await Promise.all([
      hud.boundingBox(),
      layout.boundingBox(),
      room.boundingBox(),
      panel.boundingBox(),
    ])
    expect(hudOpen && layoutOpen && roomOpen && panelOpen).toBeTruthy()

    expectNear(layoutOpen!.x, hudOpen!.x)
    expectNear(roomOpen!.x, hudOpen!.x)
    expectNear(panelOpen!.x + panelOpen!.width, hudOpen!.x + hudOpen!.width)
    expectNear(roomOpen!.y, panelOpen!.y)
    const verticalGap = layoutOpen!.y - (hudOpen!.y + hudOpen!.height)
    const horizontalGap = panelOpen!.x - (roomOpen!.x + roomOpen!.width)
    expect(verticalGap).toBeGreaterThan(0)
    expectNear(horizontalGap, verticalGap)
    expect(roomIdle!.width).toBeGreaterThan(roomOpen!.width + 100)

    await page.getByRole('button', { name: '收起信息栏' }).click()
    await expect(page.locator('.context-panel')).toHaveCount(0)
    await expect
      .poll(async () => (await room.boundingBox())?.width ?? 0)
      .toBeGreaterThan(roomOpen!.width + 100)

    const help = page.getByRole('button', { name: '查看房屋玩法说明' })
    const [stageBox, helpBox] = await Promise.all([
      page.locator('.room-stage').boundingBox(),
      help.boundingBox(),
    ])
    expect(stageBox && helpBox).toBeTruthy()
    expect(helpBox!.x).toBeGreaterThan(stageBox!.x)
    expect(helpBox!.x + helpBox!.width).toBeLessThanOrEqual(stageBox!.x + stageBox!.width)
    expect(helpBox!.y).toBeGreaterThanOrEqual(stageBox!.y)
    await help.click()
    const helpDialog = page.getByRole('dialog', { name: '怎么陪饼狗玩' })
    await expect(helpDialog).toBeVisible()
    await expect(helpDialog).toContainText('铲铲饼屋的小纸条')
    await expect(helpDialog).toContainText('旅行、刷播、冲热、弹琴和睡觉')
    await expect(helpDialog).toContainText('中途取消不会增加天数，带出的补给也不会退回')
    await helpDialog.getByRole('button', { name: '知道啦' }).click()

    await saveScreenshot(page, `desktop-${viewport.name}.png`, false)
  })
}

test('房间原图、热点与饼狗落点共用同一套 portrait 坐标', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'portrait 坐标只需在桌面验证一次')
  await page.setViewportSize({ width: 1440, height: 900 })
  await startGame(page)

  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  await expect(room.locator('.room-hotspot')).toHaveText([
    '去床边',
    '去电脑前',
    '看看衣架',
    '弹弹琴',
    '打开冰箱',
    '放张唱片',
    '看看收藏墙',
    '去门口',
  ])
  await expect(room.getByRole('button', { name: '数据', exact: true })).toHaveCount(0)
  await expect(room.getByRole('button', { name: '工作', exact: true })).toHaveCount(0)
  await expect(room.locator('.room-hotspot').first()).toHaveCSS(
    'font-family',
    /TravellingBingo Display/u,
  )
  expect(
    await room
      .locator('.room-hotspot')
      .first()
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(13)
  const stage = room.locator('.room-stage')
  const roomImage = room.getByRole('img', { name: /纵向展开的两层铲铲饼屋/u })
  await expect(roomImage).toHaveJSProperty('complete', true)
  const imageMetrics = await roomImage.evaluate((image: HTMLImageElement) => ({
    currentSrc: image.currentSrc,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }))
  expect(imageMetrics.currentSrc).toMatch(/chan-chan-house-v2-(?:768|1098)\.webp$/u)
  expect(imageMetrics.naturalWidth / imageMetrics.naturalHeight).toBeCloseTo(ROOM_RATIO, 2)

  const stageBox = await stage.boundingBox()
  expect(stageBox).not.toBeNull()
  expect(stageBox!.width / stageBox!.height).toBeCloseTo(ROOM_RATIO, 2)

  for (const expected of HOTSPOTS) {
    const hotspot = room.locator(`[data-hotspot="${expected.name}"]`)
    await expect(hotspot).toBeVisible()
    const box = await hotspot.boundingBox()
    expect(box).not.toBeNull()
    const normalizedX = ((box!.x + box!.width / 2 - stageBox!.x) / stageBox!.width) * 100
    const normalizedY = ((box!.y + box!.height / 2 - stageBox!.y) / stageBox!.height) * 100
    expect(normalizedX, `${expected.name} 横向坐标`).toBeCloseTo(expected.x, 0)
    expect(normalizedY, `${expected.name} 纵向坐标`).toBeCloseTo(expected.y, 0)
  }

  for (const expected of GAME_PET_CENTERS) {
    await room.locator(`[data-hotspot="${expected.hotspot}"]`).click()
    const mascot = room.locator('.room-mascot--actor')
    const position = await mascot.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        x: Number.parseFloat(style.getPropertyValue('--pet-x')),
        y: Number.parseFloat(style.getPropertyValue('--pet-y')),
      }
    })
    expect(position.x, `${expected.hotspot} 饼狗横向中心`).toBeCloseTo((expected.x / 1098) * 100, 5)
    expect(position.y, `${expected.hotspot} 饼狗纵向中心`).toBeCloseTo((expected.y / 1433) * 100, 5)
    if (expected.hotspot === '收藏墙') {
      await page
        .getByRole('dialog', { name: '饼狗的收藏墙' })
        .getByRole('button', {
          name: '关闭收藏墙',
        })
        .click()
    }
  }

  await page.getByRole('button', { name: '切换到现实生活维度' }).click()
  await expect(room.locator('.room-hotspot')).toHaveText(['数据', '放张唱片', '工作'])
  for (const hiddenLabel of [
    '去床边',
    '去电脑前',
    '看看衣架',
    '弹弹琴',
    '打开冰箱',
    '看看收藏墙',
    '去门口',
  ]) {
    await expect(room.getByRole('button', { name: hiddenLabel, exact: true })).toHaveCount(0)
  }
  const workComputer = room.locator('[data-hotspot="一楼电脑"]')
  await expect(workComputer).toHaveText('工作')
  await workComputer.click()
  const workPosition = await room.locator('.room-mascot--actor').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      x: Number.parseFloat(style.getPropertyValue('--pet-x')),
      y: Number.parseFloat(style.getPropertyValue('--pet-y')),
    }
  })
  expect(workPosition.x).toBeCloseTo((420 / 1098) * 100, 5)
  expect(workPosition.y).toBeCloseTo((1172 / 1433) * 100, 5)
})

test('DEBUG 仍会生成拒绝意愿，暗淡按钮询问后显示领域拒绝', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '拒绝路径只在桌面验证一次')
  await startGame(page, { seed: 'e2e-0', debug: true, displayName: '意愿测试' })

  const door = page.locator('[data-hotspot="房门"]')
  await expect(door).toHaveClass(/is-reluctant/u)
  await door.click()
  const card = page.locator('.activity-card').filter({ hasText: '出去旅行' })
  await expect(card).toHaveAttribute('data-interest', 'reluctant')
  const askButton = card.getByRole('button', { name: '问问饼狗要不要出去旅行' })
  await expect(askButton).toHaveClass(/is-reluctant/u)
  await expect(askButton).not.toHaveAttribute('aria-disabled', 'true')
  await expect(askButton).toBeEnabled()
  const visual = await askButton.evaluate((element) => {
    const style = getComputedStyle(element)
    return { opacity: Number(style.opacity), filter: style.filter }
  })
  expect(visual.opacity < 1 || visual.filter !== 'none').toBe(true)

  await askButton.click()
  await expect(card.getByRole('alert')).toContainText('饼狗今天更想待在家里')
  await expect(card.getByRole('group', { name: '确认出去旅行' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '取消当前活动', exact: true })).toHaveCount(0)
})

test('饼狗站在冰箱前时热点与角色都能用普通鼠标点击', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '设施与角色层级只在桌面验证一次')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await startGame(page, { displayName: '层级测试', seed: 'fridge-layer-v4' })
  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  const fridge = room.locator('[data-hotspot="冰箱"]')

  await fridge.click()
  await expect(page.locator('.context-panel--fridge')).toBeVisible()
  await page.getByRole('button', { name: '收起信息栏' }).click()
  await expect(room.locator('.mascot-sprite--fridge')).toBeVisible()

  await fridge.click()
  await expect(page.locator('.context-panel--fridge')).toBeVisible()
  await page.getByRole('button', { name: '收起信息栏' }).click()

  const actor = room.getByRole('button', { name: '饼狗，打开行动菜单' })
  await actor.click()
  await expect(page.getByRole('dialog', { name: '饼狗想做什么' })).toBeVisible()
})

test('饼狗出门后角色和房门活动入口都从房间消失', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '旅行状态只在桌面验证一次')
  await startGame(page)
  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  await startActivity(page, '房门', '出去旅行')
  await expect(room.locator('[data-hotspot="房门"]')).toHaveCount(0)
  await expect(room.locator('.room-mascot--actor')).toHaveCount(0)
  await expect(room.locator('.travel-note')).toHaveCount(0)
})
