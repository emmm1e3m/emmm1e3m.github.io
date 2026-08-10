import { expect, test } from '@playwright/test'

import { enterReality, saveScreenshot, startActivity, startGame } from './support/game'

const ROOM_RATIO = 1098 / 1433

const HOTSPOTS = [
  { name: '床铺', x: 22, y: 29 },
  { name: '电脑', x: 52, y: 29 },
  { name: '衣架', x: 54, y: 44 },
  { name: '电子琴', x: 17, y: 67.5 },
  { name: '冰箱', x: 50, y: 59 },
  { name: '唱片机', x: 75, y: 81 },
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
  { hotspot: '收藏墙', x: 673, y: 1053 },
  { hotspot: '房门', x: 980, y: 1176 },
] as const

function expectNear(actual: number, expected: number, tolerance = 2) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

function boxesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  )
}

for (const viewport of [
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1975, height: 1536, name: '1975x1536' },
] as const) {
  test(`${viewport.name} 顶栏、房间和待机信息栏严格对齐`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', '精确桌面布局仅在 Desktop Chromium 验证')
    await page.setViewportSize(viewport)
    await startGame(page, { seed: 'layout-e2e', displayName: '对齐测试' })

    const hud = page.locator('.game-hud--v3')
    const layout = page.locator('.game-layout--v3')
    const room = page.locator('.room-card--v3')
    const statusPanel = page.locator('.context-panel--status')
    await expect(statusPanel).toBeVisible()

    const [hudIdle, layoutIdle, roomIdle, statusIdle] = await Promise.all([
      hud.boundingBox(),
      layout.boundingBox(),
      room.boundingBox(),
      statusPanel.boundingBox(),
    ])
    expect(hudIdle).not.toBeNull()
    expect(layoutIdle).not.toBeNull()
    expect(roomIdle).not.toBeNull()
    expect(statusIdle).not.toBeNull()
    expectNear(layoutIdle!.x, hudIdle!.x)
    expectNear(layoutIdle!.x + layoutIdle!.width, hudIdle!.x + hudIdle!.width)
    expectNear(roomIdle!.x, hudIdle!.x)
    expectNear(statusIdle!.x + statusIdle!.width, hudIdle!.x + hudIdle!.width)
    expectNear(roomIdle!.y, statusIdle!.y)

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
    expectNear(roomIdle!.width, roomOpen!.width)

    await page.getByRole('button', { name: '回到房间概览' }).click()
    await expect(statusPanel).toBeVisible()
    const roomStatus = await room.boundingBox()
    expect(roomStatus).not.toBeNull()
    expectNear(roomStatus!.width, roomOpen!.width)

    const help = page.getByRole('button', { name: '查看房屋玩法说明' })
    await expect(room.locator(':scope > .room-corner-control--help')).toBeVisible()
    await expect(room.locator(':scope > .room-corner-control--dimension')).toBeVisible()
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

test('1024px 长称呼进入现实维度后顶栏仍保持单行且互不重叠', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '精确桌面布局仅在 Desktop Chromium 验证')
  await page.setViewportSize({ width: 1024, height: 768 })
  await startGame(page, {
    seed: 'hud-medium-width',
    displayName: '这是十六个字的超级超长测试称呼呀',
    debug: true,
  })
  await enterReality(page)

  const segments = [
    page.locator('.game-hud__leading'),
    page.locator('.game-hud__center'),
    page.locator('.reality-stay-timer'),
    page.locator('.pet-status-bar'),
    page.locator('.game-hud__buttons'),
  ]
  const boxes = await Promise.all(segments.map((segment) => segment.boundingBox()))
  expect(boxes.every(Boolean)).toBe(true)
  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      expect(boxesOverlap(boxes[leftIndex]!, boxes[rightIndex]!)).toBe(false)
    }
  }
  const verticalCenters = boxes.map((box) => box!.y + box!.height / 2)
  expect(Math.max(...verticalCenters) - Math.min(...verticalCenters)).toBeLessThanOrEqual(2)
  await expect(page.locator('.game-hud__center')).toHaveCSS('white-space', 'nowrap')
  await expect(page.locator('.reality-stay-timer')).toHaveCSS('white-space', 'nowrap')
  await expect(page.locator('.pet-status-bar')).toHaveCSS('white-space', 'nowrap')
  await expect(page.locator('.hud-companion')).toContainText(
    '这是十六个字的超级超长测试称呼呀陪伴饼狗已经',
  )
})

test('390px 顶栏保持同一行并可横向查看全部入口', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '精确顶栏布局仅在 Desktop Chromium 验证')
  await page.setViewportSize({ width: 390, height: 844 })
  await startGame(page, {
    seed: 'hud-mobile-width',
    displayName: '这是十六个字的超级超长测试称呼呀',
    debug: true,
  })

  const hud = page.locator('.game-hud--v4')
  const segments = [
    page.locator('.game-hud__leading'),
    page.locator('.game-hud__center'),
    page.locator('.pet-status-bar'),
    page.locator('.game-hud__buttons'),
  ]
  const boxes = await Promise.all(segments.map((segment) => segment.boundingBox()))
  expect(boxes.every(Boolean)).toBe(true)
  const verticalCenters = boxes.map((box) => box!.y + box!.height / 2)
  expect(Math.max(...verticalCenters) - Math.min(...verticalCenters)).toBeLessThanOrEqual(2)
  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      expect(boxesOverlap(boxes[leftIndex]!, boxes[rightIndex]!)).toBe(false)
    }
  }

  const scrollMetrics = await hud.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth)
  await hud.evaluate((element) => element.scrollTo({ left: element.scrollWidth }))
  await expect(page.getByRole('button', { name: '打开调试面板' })).toBeInViewport()
})

test('房间等比图层、热点与饼狗落点共用同一套母版坐标', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'portrait 坐标只需在桌面验证一次')
  await page.setViewportSize({ width: 1440, height: 900 })
  await startGame(page)

  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  await expect(room.locator('.room-hotspot')).toHaveText([
    '去床上',
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
  await expect(room.locator('.room-bingo-badge')).toHaveCount(0)
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
  await expect(roomImage).toHaveCSS('object-fit', 'contain')
  await expect(room).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  const [roomBox, stageBox] = await Promise.all([room.boundingBox(), stage.boundingBox()])
  expect(roomBox && stageBox).toBeTruthy()
  expect(stageBox!.width / stageBox!.height).toBeCloseTo(ROOM_RATIO, 2)
  expect(stageBox!.width).toBeLessThan(roomBox!.width)
  expectNear(stageBox!.x + stageBox!.width / 2, roomBox!.x + roomBox!.width / 2)
  expectNear(stageBox!.y, roomBox!.y)
  expectNear(stageBox!.height, roomBox!.height)

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

  await enterReality(page)
  await expect(room.locator('.room-hotspot')).toHaveText([
    '刷播',
    '冲热（开发中）',
    '放张唱片',
    '工作',
  ])
  for (const hiddenLabel of [
    '去床上',
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

test('桌面设施入口不会遮住到达设施后的饼狗，冲热入口在卡片中居中', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '设施几何只在 Desktop Chromium 验证')
  const desktopViewports = [
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ] as const
  await page.setViewportSize(desktopViewports[0])
  await startGame(page, { seed: 'pet-hotspot-clearance', displayName: '设施测试' })

  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  const mascot = room.locator('.room-mascot--actor')

  async function expectPetClearOf(hotspotName: string) {
    const hotspot = room.locator(`[data-hotspot="${hotspotName}"]`)
    await hotspot.click()
    await expect
      .poll(
        async () => {
          const [hotspotBox, mascotBox] = await Promise.all([
            hotspot.boundingBox(),
            mascot.boundingBox(),
          ])
          return Boolean(hotspotBox && mascotBox && boxesOverlap(hotspotBox, mascotBox))
        },
        { message: `${hotspotName} 入口不应遮住到达设施后的饼狗` },
      )
      .toBe(false)
  }

  async function expectVisibleHotspotsDisjoint() {
    const hotspots = room.locator('.room-hotspot')
    const boxes = await Promise.all(
      Array.from({ length: await hotspots.count() }, (_, index) =>
        hotspots.nth(index).boundingBox(),
      ),
    )
    expect(boxes.every(Boolean)).toBe(true)
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        expect(boxesOverlap(boxes[leftIndex]!, boxes[rightIndex]!)).toBe(false)
      }
    }
  }

  for (const viewport of desktopViewports) {
    await page.setViewportSize(viewport)
    await expectPetClearOf('电子琴')
    await expectPetClearOf('唱片机')
    await expectVisibleHotspotsDisjoint()
  }
  await saveScreenshot(page, 'room-hotspots-game-clear.png', false)

  await enterReality(page)
  for (const viewport of desktopViewports) {
    await page.setViewportSize(viewport)
    await expectPetClearOf('电脑')
    await expectPetClearOf('一楼电脑')
    await expectVisibleHotspotsDisjoint()
  }
  await saveScreenshot(page, 'room-hotspots-reality-clear.png', false)

  await room.locator('[data-hotspot="二楼电脑·冲热"]').click()
  const groupCard = page.locator('.reality-group-card--centered')
  const groupLink = groupCard.getByRole('link', { name: /前往字母建设站/u })
  const [cardBox, linkBox] = await Promise.all([groupCard.boundingBox(), groupLink.boundingBox()])
  expect(cardBox && linkBox).toBeTruthy()
  expectNear(linkBox!.x + linkBox!.width / 2, cardBox!.x + cardBox!.width / 2, 1)
  await saveScreenshot(page, 'letter-site-link-centered.png', false)
})

test('1024px 房间中刷播与冲热在悬停放大后仍保持分离', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '热点悬停几何只在 Desktop Chromium 验证')
  await page.setViewportSize({ width: 1024, height: 768 })
  await startGame(page, { seed: 'reality-hotspot-gap', displayName: '热点测试' })
  await enterReality(page)

  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  const stream = room.getByRole('button', { name: '刷播', exact: true })
  const trend = room.getByRole('button', { name: '冲热（开发中）', exact: true })

  const [streamAlignedBox, trendAlignedBox] = await Promise.all([
    stream.boundingBox(),
    trend.boundingBox(),
  ])
  expect(streamAlignedBox && trendAlignedBox).toBeTruthy()
  expectNear(
    streamAlignedBox!.y + streamAlignedBox!.height / 2,
    trendAlignedBox!.y + trendAlignedBox!.height / 2,
    1,
  )

  await stream.hover()
  let [streamBox, trendBox] = await Promise.all([stream.boundingBox(), trend.boundingBox()])
  expect(streamBox && trendBox).toBeTruthy()
  expect(boxesOverlap(streamBox!, trendBox!)).toBe(false)

  await trend.hover()
  ;[streamBox, trendBox] = await Promise.all([stream.boundingBox(), trend.boundingBox()])
  expect(streamBox && trendBox).toBeTruthy()
  expect(boxesOverlap(streamBox!, trendBox!)).toBe(false)
})

test('信息栏下方播放器在展开和收起时都复用房间侧边间距', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '桌面三组件几何只在 Chromium 验证')
  await page.setViewportSize({ width: 1440, height: 900 })
  await startGame(page, { seed: 'scene-gap-e2e', displayName: '间距测试' })
  await page.route('https://player.bilibili.com/**', async (route) => route.abort())

  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  await room.locator('[data-hotspot="唱片机"]').click()
  const panel = page.locator('.context-panel--record-player')
  await panel
    .getByRole('list', { name: '全站第一曲目' })
    .getByRole('listitem')
    .first()
    .getByRole('button')
    .click()

  const player = page.getByTestId('persistent-bilibili-player')
  await expect(player).toHaveClass(/persistent-bilibili-player--context/u)

  async function expectSharedGap() {
    const [roomBox, panelBox, playerBox] = await Promise.all([
      room.boundingBox(),
      panel.boundingBox(),
      player.boundingBox(),
    ])
    expect(roomBox && panelBox && playerBox).toBeTruthy()
    const roomToPanel = panelBox!.x - (roomBox!.x + roomBox!.width)
    const panelToPlayer = playerBox!.y - (panelBox!.y + panelBox!.height)
    expect(roomToPanel).toBeGreaterThan(0)
    expectNear(panelToPlayer, roomToPanel)
  }

  await expect(player).toHaveAttribute('data-dock-state', 'expanded')
  const expandedPlayerBox = await player.boundingBox()
  expect(expandedPlayerBox).not.toBeNull()
  await expectSharedGap()

  await player.getByRole('button', { name: '隐藏画面' }).click()
  await expect(player).toHaveAttribute('data-dock-state', 'collapsed')
  const collapsedPlayerBox = await player.boundingBox()
  expect(collapsedPlayerBox).not.toBeNull()
  expect(Math.abs(collapsedPlayerBox!.width - expandedPlayerBox!.width)).toBeLessThan(0.5)
  await expectSharedGap()
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

test('待机饼狗先静止，再走动并回到休息状态', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '待机状态时序只在桌面验证一次')
  await page.clock.install({ time: new Date('2026-08-09T10:00:00+08:00') })
  await startGame(page, { displayName: '待机漫步测试', seed: 'idle-wander-e2e' })
  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  const mascot = room.locator('.room-mascot--actor')

  await expect(mascot).toHaveClass(/is-wander-resting/u)
  await expect(mascot).not.toHaveClass(/is-wander-moving/u)
  await expect(mascot.locator('.mascot-sprite--idle')).toBeVisible()
  const restingDurationMs = await mascot.evaluate((element) =>
    Number.parseFloat(element.style.getPropertyValue('--pet-wander-duration')),
  )
  expect(restingDurationMs).toBeGreaterThanOrEqual(4_800)
  expect(restingDurationMs).toBeLessThanOrEqual(10_800)

  await page.clock.fastForward(restingDurationMs)
  await expect(mascot).toHaveClass(/is-wander-moving/u)
  await expect(mascot).not.toHaveClass(/is-wander-resting/u)
  await expect(mascot.locator('.mascot-sprite--walk')).toBeVisible()
  const movingDurationMs = await mascot.evaluate((element) =>
    Number.parseFloat(element.style.getPropertyValue('--pet-wander-duration')),
  )
  expect(movingDurationMs).toBeGreaterThanOrEqual(4_800)
  expect(movingDurationMs).toBeLessThanOrEqual(6_800)

  await page.clock.fastForward(movingDurationMs)
  await expect(mascot).toHaveClass(/is-wander-resting/u)
  await expect(mascot).not.toHaveClass(/is-wander-moving/u)
  await expect(mascot.locator('.mascot-sprite--idle')).toBeVisible()
})

test('1024 与 1440 房间中饼狗菜单跟随角色且不会溢出母版', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '菜单几何只在 Desktop Chromium 验证')
  await page.setViewportSize({ width: 1024, height: 768 })
  await startGame(page, { displayName: '菜单定位测试', seed: 'pet-menu-anchor-e2e' })

  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  const stage = room.locator('.room-stage')
  const actor = room.getByRole('button', { name: '饼狗，打开行动菜单' })

  async function expectAnchoredMenu(hotspotName: '床铺' | '唱片机') {
    await room.locator(`[data-hotspot="${hotspotName}"]`).click()
    await page.waitForTimeout(650)
    await actor.click()

    const menu = page.getByRole('dialog', { name: '饼狗状态' })
    await expect(menu).toBeVisible()
    const [stageBox, actorBox, menuBox] = await Promise.all([
      stage.boundingBox(),
      actor.boundingBox(),
      menu.boundingBox(),
    ])
    expect(stageBox && actorBox && menuBox).toBeTruthy()
    expect(menuBox!.x).toBeGreaterThanOrEqual(stageBox!.x)
    expect(menuBox!.y).toBeGreaterThanOrEqual(stageBox!.y)
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(stageBox!.x + stageBox!.width)
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(stageBox!.y + stageBox!.height)
    expect(boxesOverlap(actorBox!, menuBox!)).toBe(false)

    const vitality = menu.getByLabel('饼狗活力状态')
    await expect(vitality).toHaveCSS('white-space', 'nowrap')
    const [labelBox, valueBox] = await Promise.all([
      vitality.locator('strong').boundingBox(),
      vitality.locator('span').boundingBox(),
    ])
    expect(labelBox && valueBox).toBeTruthy()
    expectNear(labelBox!.y + labelBox!.height / 2, valueBox!.y + valueBox!.height / 2, 1)

    await menu.getByRole('button', { name: '收起菜单' }).click()
  }

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await expectAnchoredMenu('床铺')
    await expectAnchoredMenu('唱片机')
  }
})

test('饼狗站在冰箱前时热点与角色都能用普通鼠标点击', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '设施与角色层级只在桌面验证一次')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await startGame(page, { displayName: '层级测试', seed: 'fridge-layer-v4' })
  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  const fridge = room.locator('[data-hotspot="冰箱"]')

  await fridge.click()
  await expect(page.locator('.context-panel--fridge')).toBeVisible()
  await expect(room.locator('.mascot-sprite--fridge')).toBeVisible()
  await page.getByRole('button', { name: '回到房间概览' }).click()
  await expect(room.locator('.room-mascot--actor')).toHaveClass(/is-wandering/u)

  await fridge.click()
  await expect(page.locator('.context-panel--fridge')).toBeVisible()
  await expect(room.locator('.mascot-sprite--fridge')).toBeVisible()
  await page.getByRole('button', { name: '回到房间概览' }).click()

  const actor = room.getByRole('button', { name: '饼狗，打开行动菜单' })
  await actor.click()
  await expect(page.getByRole('dialog', { name: '饼狗状态' })).toBeVisible()
})

test('饼狗出门后用母版内便签替代角色，并可用键盘查看进度', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '旅行状态只在桌面验证一次')
  await startGame(page)
  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  await startActivity(page, '房门', '出去旅行')
  await expect(room.locator('[data-hotspot="房门"]')).toHaveCount(0)
  await expect(room.locator('.room-mascot--actor')).toHaveCount(0)
  const note = room.getByRole('button', { name: '饼狗不在家，查看出门进度' })
  await expect(note).toBeVisible()
  await expect(note).toContainText('点击查看出门进度')
  const [stageBox, noteBox] = await Promise.all([
    room.locator('.room-stage').boundingBox(),
    note.boundingBox(),
  ])
  expect(stageBox && noteBox).toBeTruthy()
  expect(noteBox!.x).toBeGreaterThanOrEqual(stageBox!.x)
  expect(noteBox!.y).toBeGreaterThanOrEqual(stageBox!.y)
  expect(noteBox!.x + noteBox!.width).toBeLessThanOrEqual(stageBox!.x + stageBox!.width)
  expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(stageBox!.y + stageBox!.height)

  await note.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.context-panel--activity')).toBeVisible()
})
