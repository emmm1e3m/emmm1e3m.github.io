import { expect, test, type Page } from '@playwright/test'

import {
  enterReality,
  openDebugPanel,
  readCompanionDays,
  saveScreenshot,
  setDebugDuration,
  startActivity,
  startGame,
} from './support/game'

const BROWSER_SAVE_KEY = 'travelling-bingo:browser-save:v1'

interface CachedTaskInstance {
  instanceId: string
  taskId: string
  assignedAt: number
  progress: number
  target: number
  rewardApples: number
  seenKeys: string[]
}

interface CachedGameProgress {
  profile: { companionDays: number }
  tasks: {
    active: CachedTaskInstance[]
    completedAt: number | null
    completedCount: number
  }
}

const COMPLETE_TASKS: Omit<CachedTaskInstance, 'assignedAt'>[] = [
  {
    instanceId: 'e2e-complete-backpack',
    taskId: 'open-backpack',
    progress: 1,
    target: 1,
    rewardApples: 1,
    seenKeys: ['opened'],
  },
  {
    instanceId: 'e2e-complete-stroll',
    taskId: 'room-stroll',
    progress: 2,
    target: 2,
    rewardApples: 2,
    seenKeys: ['bed', 'computer'],
  },
  {
    instanceId: 'e2e-complete-piano',
    taskId: 'piano-time',
    progress: 1,
    target: 1,
    rewardApples: 1,
    seenKeys: ['piano:C4'],
  },
]

const PARTIAL_TASKS: Omit<CachedTaskInstance, 'assignedAt'>[] = [
  {
    instanceId: 'e2e-partial-backpack',
    taskId: 'open-backpack',
    progress: 1,
    target: 1,
    rewardApples: 1,
    seenKeys: ['opened'],
  },
  {
    instanceId: 'e2e-partial-stroll',
    taskId: 'room-stroll',
    progress: 1,
    target: 2,
    rewardApples: 2,
    seenKeys: ['bed'],
  },
  {
    instanceId: 'e2e-partial-piano',
    taskId: 'piano-time',
    progress: 0,
    target: 1,
    rewardApples: 1,
    seenKeys: [],
  },
]

async function injectCachedTaskBoard(
  page: Page,
  tasks: Omit<CachedTaskInstance, 'assignedAt'>[],
  completed: boolean,
) {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, BROWSER_SAVE_KEY))
    .toBe(true)
  return page.evaluate(
    ({ key, taskSnapshots, boardCompleted }) => {
      const cache = JSON.parse(localStorage.getItem(key)!) as {
        payload: CachedGameProgress
      }
      const assignedAt = cache.payload.tasks.active[0]?.assignedAt ?? Date.now()
      const active = taskSnapshots.map((task) => ({ ...task, assignedAt }))
      cache.payload.tasks.active = active
      cache.payload.tasks.completedAt = boardCompleted ? assignedAt : null
      cache.payload.tasks.completedCount = active.filter(
        (task) => task.progress >= task.target,
      ).length
      localStorage.setItem(key, JSON.stringify(cache))
      return active
    },
    { key: BROWSER_SAVE_KEY, taskSnapshots: tasks, boardCompleted: completed },
  )
}

async function readCachedGameProgress(page: Page) {
  return page.evaluate((key) => {
    const cache = JSON.parse(localStorage.getItem(key)!) as { payload: CachedGameProgress }
    return {
      profile: cache.payload.profile,
      tasks: cache.payload.tasks,
    }
  }, BROWSER_SAVE_KEY)
}

async function continueCachedGame(page: Page) {
  await page.reload()
  await page.getByRole('button', { name: '继续' }).click()
  await expect(page.getByRole('region', { name: '铲铲饼屋互动场景' })).toBeVisible()
}

async function completeTenSecondRest(page: Page) {
  await startActivity(page, '床铺', '好好睡一觉')
  await page.clock.fastForward(10_001)
  const claim = page.getByRole('button', { name: '看看这次的结果' })
  await expect(claim).toBeVisible()
  await claim.click()
  const reward = page.locator('.reward-card--v3')
  await expect(reward).toContainText('饼狗睡醒啦')
  await reward.getByRole('button', { name: '回到房间' }).click()
}

test.describe('V9 高风险集成契约', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      browserName !== 'chromium' || testInfo.project.name !== 'chromium',
      '桌面高风险集成契约只在 Desktop Chromium 验证',
    )
  })

  test('标题页按缓存状态展示正确入口、顺序与主按钮', async ({ page }) => {
    await page.goto('./')
    const entries = page.getByRole('navigation', { name: '存档入口' })
    const newJourney = entries.getByRole('button', { name: '全新旅程' })
    await expect(newJourney).toBeEnabled()
    await expect(entries.getByRole('button', { name: '继续' })).toHaveCount(0)
    await expect(entries.locator(':scope > .landing-button')).toHaveText(['全新旅程', '本地存档'])
    await expect(newJourney).toHaveClass(/landing-button--primary/u)
    await expect(entries.getByText('本地存档', { exact: true })).toHaveClass(
      /landing-button--quiet/u,
    )

    await startGame(page, { seed: 'cache-entry-e2e', displayName: '缓存入口测试' })
    await page.getByRole('button', { name: '离开铲铲饼屋' }).click()

    const cachedEntries = page.getByRole('navigation', { name: '存档入口' })
    await expect(cachedEntries.locator(':scope > .landing-button')).toHaveText([
      '继续',
      '全新旅程',
      '本地存档',
    ])
    await expect(cachedEntries.getByRole('button', { name: '继续' })).toHaveClass(
      /landing-button--primary/u,
    )
    await expect(cachedEntries.getByRole('button', { name: '全新旅程' })).toHaveClass(
      /landing-button--quiet/u,
    )

    await cachedEntries.getByRole('button', { name: '全新旅程' }).click()
    const dialog = page.getByRole('dialog', { name: '开启一段全新的旅程' })
    await expect(dialog).toContainText('先下载当前浏览器缓存中的存档')
    await expect(dialog.getByLabel('如何称呼你？')).toHaveAttribute('placeholder', '如何称呼你？')
    await expect(dialog.getByRole('button', { name: '下载存档并开始' })).toBeVisible()
    await expect(dialog.getByText('想让饼狗怎么称呼你？', { exact: true })).toHaveCount(0)
  })

  test('维度弹窗有纸张背景、进出均有动画、返回可取消且 HUD 持续计时', async ({ page }) => {
    await startGame(page, { seed: 'dimension-contract-e2e', displayName: '维度验收' })
    const dimensionButton = page.getByRole('button', { name: '切换到现实生活维度' })
    await dimensionButton.click()

    const enterDialog = page.getByRole('dialog', { name: '进入现实维度？' })
    await expect(enterDialog.getByRole('button', { name: '先不切换' })).toBeVisible()
    expect(
      await enterDialog.evaluate((element) => getComputedStyle(element).backgroundColor),
    ).not.toBe('rgba(0, 0, 0, 0)')
    await enterDialog.getByRole('button', { name: '先不切换' }).click()
    await expect(dimensionButton).toBeVisible()

    await dimensionButton.click()
    await page.clock.install({ time: new Date('2026-08-09T10:00:00+08:00') })
    await page
      .getByRole('dialog', { name: '进入现实维度？' })
      .getByRole('button', { name: '进入现实维度' })
      .click()
    const transition = page.locator('.dimension-transition')
    await expect(transition).toHaveClass(/dimension-transition--out/u)
    await expect(transition).toHaveCSS('animation-name', 'dimension-veil-in')

    await page.clock.fastForward(250)
    await expect(transition).toHaveClass(/dimension-transition--in/u)
    await expect(page.getByRole('button', { name: '回到旅行饼狗游戏' })).toBeVisible()
    await page.clock.fastForward(605_000)
    await expect(page.getByRole('button', { name: /本次现实停留/u })).toHaveText('现实 10 分钟')

    await page.getByRole('button', { name: '回到旅行饼狗游戏' }).click()
    const leaveDialog = page.getByRole('dialog', { name: '回到饼屋？' })
    expect(
      await leaveDialog.evaluate((element) => getComputedStyle(element).backgroundColor),
    ).not.toBe('rgba(0, 0, 0, 0)')
    await leaveDialog.getByRole('button', { name: '先不切换' }).click()
    await expect(page.getByRole('button', { name: /本次现实停留/u })).toBeVisible()

    await page.getByRole('button', { name: '回到旅行饼狗游戏' }).click()
    await page
      .getByRole('dialog', { name: '回到饼屋？' })
      .getByRole('button', { name: '回到饼屋' })
      .click()
    await expect(transition).toHaveClass(/dimension-transition--out/u)
  })

  test('现实停留不足一个苹果时直接返回，不显示结算确认', async ({ page }) => {
    await startGame(page, { seed: 'short-reality-return-e2e', displayName: '短停留验收' })
    await enterReality(page)

    await page.getByRole('button', { name: '回到旅行饼狗游戏' }).click()
    await expect(page.getByRole('dialog', { name: '回到饼屋？' })).toHaveCount(0)
    await expect(page.getByRole('status', { name: '正在回到饼屋' })).toBeVisible()
    await expect(page.getByRole('button', { name: '切换到现实生活维度' })).toBeVisible()
  })

  test('苹果钟使用全屏明信片墙，开始后仍可增改勾选删除待办且睡觉饼狗缓慢移动', async ({ page }) => {
    test.setTimeout(90_000)
    await startGame(page, { debug: true, seed: 'pomodoro-live-e2e', displayName: '苹果钟验收' })
    await openDebugPanel(page)
    await page.getByRole('button', { name: '一键全收集', exact: true }).click()
    await page
      .getByRole('group', { name: '确认一键全收集' })
      .getByRole('button', { name: '确认全收集' })
      .click()

    await enterReality(page)
    await page.locator('[data-hotspot="一楼电脑"]').click()
    const workPanel = page.locator('.context-panel--reality-work')
    await workPanel.getByRole('button', { name: '选择陪伴明信片' }).click()
    const picker = page.getByRole('dialog', { name: '选择这一轮的风景' })
    const pickerBackdrop = page.locator('.reality-postcard-dialog-backdrop')
    await expect(picker).toBeVisible()
    await expect(pickerBackdrop).toHaveCSS('position', 'fixed')
    await expect(picker.getByRole('radio')).toHaveCount(101)
    await expect(picker.locator('.reality-postcard-tile img').first()).toHaveCSS(
      'object-fit',
      'contain',
    )
    await picker.getByRole('radio').nth(1).focus()
    await page.keyboard.press('Space')
    await expect(picker).not.toBeVisible()
    const selectedPostcardPreview = workPanel.locator('.reality-postcard-picker__preview')
    await expect(selectedPostcardPreview).not.toHaveAttribute('data-background-id', 'plain')
    await expect(selectedPostcardPreview.locator('img')).toHaveCSS('object-fit', 'cover')

    await workPanel
      .getByRole('group', { name: '苹果钟时长' })
      .getByRole('button', { name: /^25 分钟/u })
      .click()
    await workPanel.getByRole('button', { name: '开始苹果钟' }).click()
    await page
      .getByRole('alertdialog', { name: '确认开始苹果钟？' })
      .getByRole('button', { name: '确认开始' })
      .click()

    const focus = page.getByRole('dialog', { name: '和饼狗一起专注' })
    const focusBackdrop = page.locator('.pomodoro-focus-backdrop')
    const mascot = focus.locator('.pomodoro-focus__mascot')
    const sleepingSprite = focus.getByRole('img', { name: '正在睡觉陪伴你的饼狗' })
    await expect(focus).toBeVisible()
    await expect(focusBackdrop.locator('.pomodoro-focus__background')).toHaveCSS(
      'object-fit',
      'cover',
    )
    await expect(focusBackdrop.locator('.pomodoro-focus__background')).toHaveCSS(
      'object-position',
      '50% 50%',
    )
    await expect(sleepingSprite).toHaveClass(/mascot-sprite--sleep/u)
    const mascotWidth = (await mascot.boundingBox())?.width ?? 0
    expect(mascotWidth).toBeGreaterThanOrEqual(90)
    expect(mascotWidth).toBeLessThanOrEqual(130)
    const initialPosition = await mascot.evaluate((element) => ({
      x: element.style.getPropertyValue('--pomodoro-mascot-x'),
      y: element.style.getPropertyValue('--pomodoro-mascot-y'),
    }))

    await focus.getByLabel('新待办').fill('计时中也能新增')
    await focus.getByRole('button', { name: '添加' }).click()
    const todo = focus.getByRole('listitem').filter({ hasText: '计时中也能新增' })
    await todo.getByRole('button', { name: '编辑' }).click()
    const editForm = focus.getByRole('form', { name: '编辑待办：计时中也能新增' })
    await editForm.getByLabel('待办标题').fill('计时中也能修改')
    await editForm.getByRole('button', { name: '保存' }).click()
    const updatedTodo = focus.getByRole('listitem').filter({ hasText: '计时中也能修改' })
    await updatedTodo.getByRole('checkbox', { name: '标记为已完成：计时中也能修改' }).check()
    await updatedTodo.getByRole('button', { name: '删除' }).click()
    await page
      .getByRole('alertdialog', { name: '确认删除这条待办？' })
      .getByRole('button', { name: '确认删除' })
      .click()
    await expect(focus.getByText('计时中也能修改', { exact: true })).toHaveCount(0)

    await expect
      .poll(
        () =>
          mascot.evaluate((element) => ({
            x: element.style.getPropertyValue('--pomodoro-mascot-x'),
            y: element.style.getPropertyValue('--pomodoro-mascot-y'),
          })),
        { timeout: 20_000 },
      )
      .not.toEqual(initialPosition)
    await saveScreenshot(page, 'pomodoro-fullscreen-live-todos.png', false)
  })

  test('睡醒推进游戏日后刷新已经全完成的三项任务板', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-09T10:00:00+08:00') })
    await startGame(page, {
      debug: true,
      seed: 'completed-board-rest-e2e',
      displayName: '全完成换板验收',
    })
    await setDebugDuration(page, '10 秒')
    const injectedTasks = await injectCachedTaskBoard(page, COMPLETE_TASKS, true)
    await continueCachedGame(page)
    const before = await readCachedGameProgress(page)
    expect(before.tasks.active).toEqual(injectedTasks)
    expect(before.tasks.completedAt).not.toBeNull()
    const daysBefore = before.profile.companionDays

    await completeTenSecondRest(page)
    await expect.poll(() => readCompanionDays(page)).toBe(daysBefore + 1)
    await expect
      .poll(async () => (await readCachedGameProgress(page)).profile.companionDays)
      .toBe(daysBefore + 1)
    const after = await readCachedGameProgress(page)
    const previousInstanceIds = new Set(injectedTasks.map((task) => task.instanceId))
    expect(after.tasks.active).toHaveLength(3)
    expect(after.tasks.active.every((task) => !previousInstanceIds.has(task.instanceId))).toBe(true)
    expect(after.tasks.active.every((task) => task.progress === 0)).toBe(true)
    expect(after.tasks.completedAt).toBeNull()
  })

  test('睡醒推进游戏日时完整继承尚未全完成任务板的实例与进度', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-09T11:00:00+08:00') })
    await startGame(page, {
      debug: true,
      seed: 'partial-board-rest-e2e',
      displayName: '未完成继承验收',
    })
    await setDebugDuration(page, '10 秒')
    const injectedTasks = await injectCachedTaskBoard(page, PARTIAL_TASKS, false)
    await continueCachedGame(page)
    const before = await readCachedGameProgress(page)
    expect(before.tasks.active).toEqual(injectedTasks)
    expect(before.tasks.completedAt).toBeNull()
    const daysBefore = before.profile.companionDays

    await completeTenSecondRest(page)
    await expect.poll(() => readCompanionDays(page)).toBe(daysBefore + 1)
    await expect
      .poll(async () => (await readCachedGameProgress(page)).profile.companionDays)
      .toBe(daysBefore + 1)
    const after = await readCachedGameProgress(page)
    expect(after.tasks.active).toEqual(before.tasks.active)
    expect(after.tasks.completedCount).toBe(before.tasks.completedCount)
    expect(after.tasks.completedAt).toBeNull()
  })

  test('衣架访问同时命中两类任务时优先完成专用造型任务', async ({ page }) => {
    await startGame(page, { seed: 'wardrobe-priority-e2e', displayName: '衣架验收' })
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('travelling-bingo:browser-save:v1') !== null),
      )
      .toBe(true)
    await page.evaluate(() => {
      const key = 'travelling-bingo:browser-save:v1'
      const cache = JSON.parse(localStorage.getItem(key)!) as {
        payload: {
          tasks: {
            active: Array<{
              instanceId: string
              taskId: string
              assignedAt: number
              progress: number
              target: number
              rewardApples: number
              seenKeys: string[]
            }>
            completedAt: number | null
            completedCount: number
          }
        }
      }
      const assignedAt = cache.payload.tasks.active[0]?.assignedAt ?? Date.now()
      cache.payload.tasks.active = [
        {
          instanceId: 'e2e-room-stroll',
          taskId: 'room-stroll',
          assignedAt,
          progress: 0,
          target: 2,
          rewardApples: 2,
          seenKeys: [],
        },
        {
          instanceId: 'e2e-wardrobe-choice',
          taskId: 'wardrobe-choice',
          assignedAt,
          progress: 0,
          target: 1,
          rewardApples: 1,
          seenKeys: [],
        },
        {
          instanceId: 'e2e-stage-test',
          taskId: 'stage-test',
          assignedAt,
          progress: 0,
          target: 1,
          rewardApples: 1,
          seenKeys: [],
        },
      ]
      cache.payload.tasks.completedAt = null
      cache.payload.tasks.completedCount = 0
      localStorage.setItem(key, JSON.stringify(cache))
    })
    await page.reload()
    await page.getByRole('button', { name: '继续' }).click()

    await page.locator('[data-hotspot="衣架"]').click()
    await page.locator('.game-hud__center').click()
    const taskList = page.locator('.task-list')
    const wardrobeTask = taskList.getByRole('listitem').filter({ hasText: '挑挑今天的造型' })
    const strollTask = taskList.getByRole('listitem').filter({ hasText: '在饼屋里走走' })
    await expect(wardrobeTask).toHaveClass(/is-complete/u)
    await expect(wardrobeTask.locator('.task-number')).toHaveText('√')
    await expect(strollTask.getByLabel('进度 0 / 2')).toBeVisible()
  })
})
