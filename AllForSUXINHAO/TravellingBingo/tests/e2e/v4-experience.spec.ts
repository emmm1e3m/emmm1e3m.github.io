import { expect, test } from '@playwright/test'

import {
  buySupply,
  enterReality,
  expectElementWithinViewport,
  expectNoOverlap,
  openDebugPanel,
  readAppleCount,
  readCompanionDays,
  readSupplyCount,
  saveScreenshot,
  startActivity,
  startGame,
} from './support/game'

test.describe('V9 房间契约', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      browserName !== 'chromium' || testInfo.project.name !== 'chromium',
      'V9 桌面主流程只在 Chromium 验证',
    )
  })

  test('进入前可显式检查更新，默认读条为 10 秒', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('./')
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', './icons/favicon-32.png')
    const updateRegion = page.getByRole('region', { name: '检查游戏更新' })
    await expect(updateRegion.getByRole('button', { name: '检查更新' })).toBeVisible()
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration()
            return registration?.active?.state ?? null
          }),
        { timeout: 60_000 },
      )
      .toBe('activated')
    await Promise.all([
      expect(page.getByRole('status').filter({ hasText: '铲铲饼屋暂时没有新布置啦' })).toBeVisible({
        timeout: 30_000,
      }),
      updateRegion.getByRole('button', { name: '检查更新' }).click(),
    ])
    await expect(updateRegion.getByRole('button', { name: '检查更新' })).toBeEnabled({
      timeout: 30_000,
    })
    await expect(updateRegion.getByRole('status')).toHaveCount(0)

    await startGame(page, { debug: true, displayName: '新布置测试', seed: 'v4-update' })
    await openDebugPanel(page)
    await expect(page.getByRole('button', { name: '10 秒', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const hudTitle = page.locator('.game-hud__center strong')
    await expect(hudTitle).toHaveText('今天也要好好吃苹果')
    await expect(hudTitle).toHaveCSS('white-space', 'nowrap')
    await expect(page.locator('.apple-counter .apple-amount')).toHaveText(/^\d+🍎$/u)
    const status = page.getByRole('button', { name: /饼狗活力状态/u })
    await expect(status.locator('.pet-status-bar__label')).toHaveText(/低活力|中等活力|高活力/u)
    await expect(status).toContainText('新布置测试陪伴饼狗已经 0 天')
    await expect(status).not.toContainText('🐶')
    await expect(page.locator('.game-page > .pet-status-bar')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '查看房屋玩法说明' })).toHaveText('ℹ️')
    await expect(page.getByRole('button', { name: '切换到现实生活维度' })).toHaveText('🔃')
  })

  test('速度魔法经二次确认消耗一瓶并立刻完成当前读条', async ({ page }) => {
    await startGame(page, { debug: true, displayName: '速度测试', seed: 'e2e-4' })
    await buySupply(page, '瓶装速度魔法')
    expect(await readSupplyCount(page, '瓶装速度魔法')).toBe(1)

    await startActivity(page, '房门', '出去旅行')
    await page.locator('.game-hud__center').click()
    const activePanel = page.locator('.context-panel--activity')
    await expect(activePanel.getByText('这一次 Bingo', { exact: true })).toBeVisible()
    await expect(activePanel.locator('.context-panel__close')).toHaveCount(0)

    await activePanel.getByRole('button', { name: '使用速度魔法' }).click()
    const confirmation = activePanel.getByRole('group', { name: '确认使用速度魔法' })
    await expect(confirmation.getByRole('button', { name: '继续等待' })).toBeFocused()
    await confirmation.getByRole('button', { name: '确认使用' }).click()
    await expect(activePanel.getByRole('button', { name: '看看这次的结果' })).toBeEnabled()
    await expect(activePanel).not.toContainText('现有 0 份')
    await expect(activePanel.getByRole('button', { name: '使用速度魔法' })).toHaveCount(0)

    const cancelButton = page.getByRole('button', { name: '取消当前活动' })
    const helpButton = page.getByRole('button', { name: '查看房屋玩法说明' })
    const dimensionButton = page.getByRole('button', { name: '切换到现实生活维度' })
    for (const control of [cancelButton, helpButton, dimensionButton]) {
      await expectElementWithinViewport(control)
    }
    await expectNoOverlap(cancelButton, dimensionButton, ['活动取消按钮', '维度切换按钮'])
    await expectNoOverlap(helpButton, dimensionButton, ['玩法说明按钮', '维度切换按钮'])
  })

  test('拒绝态点击可询问使用活力魔法，使用后七天内三类兴趣都恢复', async ({ page }) => {
    await startGame(page, { debug: true, displayName: '活力测试', seed: 'e2e-0' })
    await buySupply(page, '瓶装活力魔法')
    expect(await readSupplyCount(page, '瓶装活力魔法')).toBe(1)

    await page.locator('[data-hotspot="房门"]').click()
    const card = page.locator('.activity-card').filter({ hasText: '出去旅行' })
    const confirmation = card.getByRole('group', { name: '确认使用活力魔法' })
    await expect(confirmation.getByRole('button', { name: '先不使用' })).toBeFocused()
    await confirmation.getByRole('button', { name: '使用活力魔法' }).click()

    const petStatus = page.getByRole('button', { name: /饼狗活力状态/u })
    await expect(petStatus.locator('.pet-status-bar__label')).toHaveText('活力满满')
    await expect(petStatus.locator('.pet-status-bar__effect')).toHaveText('活力还可陪伴 7 天')
    await expect(card).toHaveAttribute('data-interest', 'willing')
    await expect(card.getByRole('button', { name: '准备出去旅行' })).toBeEnabled()

    await page.getByRole('button', { name: '回到房间概览' }).click()
    const interest = page.locator('.interest-summary')
    await expect(interest.locator('.is-willing')).toHaveCount(3)
    await expect(interest.locator('.is-reluctant')).toHaveCount(0)
    await page.locator('[data-hotspot="冰箱"]').click()
    const vitalityItem = page.locator('.shop-item').filter({ hasText: '瓶装活力魔法' })
    await expect(vitalityItem.locator('small')).not.toContainText(/现有\s*0\s*份/u)
    await saveScreenshot(page, 'vitality-magic-seven-days.png', false)
  })

  test('现实维度提供刷播、冲热与工作入口，待办持久且满十分钟按选择结算', async ({ page }) => {
    const enteredAt = new Date('2026-08-09T08:00:00+08:00')
    await page.clock.install({ time: enteredAt })
    await startGame(page, { displayName: '现实测试', seed: 'v4-reality' })
    const applesBefore = await readAppleCount(page)

    await enterReality(page)
    const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
    await expect(room.locator('[data-hotspot="电脑"]')).toHaveText('刷播')
    await expect(room.locator('[data-hotspot="二楼电脑·冲热"]')).toHaveText('冲热（开发中）')
    await expect(room.locator('[data-hotspot="一楼电脑"]')).toHaveText('工作')

    await room.locator('[data-hotspot="电脑"]').click()
    const streamPanel = page.locator('.context-panel--reality-stream')
    await expect(streamPanel.getByRole('heading', { name: '视频刷播' })).toBeVisible()
    await expect(streamPanel).toContainText(
      '选择收藏夹，也可以加入一个自测视频 BV 号或完整视频链接（可留空）。',
    )
    await expect(streamPanel).toContainText('会使用当前浏览器账号，登录时每天不要超过5小时。')
    await expect(streamPanel).toContainText(
      '刷播会在单独页面运行，请允许本站弹出窗口；启动刷播窗口后，返回游戏维度也可以继续。',
    )
    await expect(streamPanel).toContainText(
      '在新设备/浏览器上请先检查：若登录，历史记录里出现刷播视频为成功；若未登录，自测视频播放量增加为成功。',
    )

    await room.locator('[data-hotspot="二楼电脑·冲热"]').click()
    const trendPanel = page.locator('.context-panel--reality-trend')
    await expect(trendPanel.getByRole('heading', { name: '冲热刷播，奖品多多' })).toBeVisible()
    await expect(trendPanel).not.toContainText('需要参与实际运行时')
    await expect(trendPanel.getByRole('link', { name: /前往字母建设站/u })).toHaveAttribute(
      'href',
      'https://www.weibo.com/u/7878664767',
    )

    await room.locator('[data-hotspot="一楼电脑"]').click()
    const workPanel = page.locator('.context-panel--reality-work')
    await expect(workPanel.getByRole('heading', { name: '苹果钟与待办' })).toBeVisible()
    await workPanel.getByLabel('新待办').fill('完成 V9 验收')
    await workPanel.getByRole('button', { name: '添加' }).click()
    const todo = workPanel.getByRole('list', { name: '现实生活待办' }).getByRole('listitem')
    await expect(todo).toContainText('完成 V9 验收')
    await todo.getByRole('checkbox', { name: '标记为已完成：完成 V9 验收' }).check()
    await todo.getByRole('button', { name: '编辑' }).click()
    await todo.getByLabel('待办标题').fill('完成 V9 桌面验收')
    await todo.getByRole('button', { name: '保存' }).click()

    await room.locator('[data-hotspot="电脑"]').click()
    await room.locator('[data-hotspot="一楼电脑"]').click()
    await expect(page.getByRole('list', { name: '现实生活待办' })).toContainText('完成 V9 桌面验收')
    await saveScreenshot(page, 'reality-work-todos.png', false)

    await page.clock.fastForward(10 * 60_000 + 1_000)
    await page.getByRole('button', { name: '回到旅行饼狗游戏' }).click()
    const leaveDialog = page.getByRole('dialog', { name: '回到饼屋？' })
    await expect(leaveDialog).toContainText('结算这次现实维度带回的苹果')
    await leaveDialog.getByRole('button', { name: '回到饼屋' }).click()
    const returnDialog = page.getByRole('dialog', { name: '现实里的事情认真完成了吗？' })
    await expect(returnDialog).toContainText('这段时间一共攒下 1🍎')
    await returnDialog.getByRole('button', { name: '是的🥰' }).click()
    const resultDialog = page.getByRole('dialog', { name: '认真完成，全部带回来啦' })
    await expect(resultDialog).toBeVisible()
    await page.clock.resume()
    await expect(page.locator('.reality-settlement-result-backdrop')).toHaveCSS('opacity', '1')
    await expect(resultDialog).toContainText('收好 1🍎')
    await expect(resultDialog.getByRole('button', { name: '收好啦' })).toBeFocused()
    await expect.poll(() => readAppleCount(page)).toBe(applesBefore + 1)
    await resultDialog.getByRole('button', { name: '收好啦' }).click()
  })

  test('现实苹果钟开始与 ↩️ 取消均二次确认，取消不推进陪伴天数', async ({ page }) => {
    await startGame(page, { displayName: '苹果钟测试', seed: 'v4-pomodoro-confirm' })
    const daysBefore = await readCompanionDays(page)
    await enterReality(page)
    await page.locator('[data-hotspot="一楼电脑"]').click()

    const workPanel = page.locator('.context-panel--reality-work')
    const durationGroup = workPanel.getByRole('group', { name: '苹果钟时长' })
    await expect(durationGroup.getByRole('button')).toHaveText([
      '25 分钟专注 25 分钟，休息 5 分钟',
      '50 分钟专注 50 分钟，休息 10 分钟',
      '90 分钟专注 90 分钟，休息 15 分钟',
    ])
    const durationChoice = durationGroup.getByRole('button', { name: /^25 分钟/u })
    await durationChoice.click()
    await expect(durationChoice).toHaveAttribute('aria-pressed', 'true')
    await workPanel.getByRole('button', { name: '开始苹果钟' }).click()

    const startDialog = page.getByRole('alertdialog', { name: '确认开始苹果钟？' })
    await expect(startDialog).toContainText('25 分钟专注 + 5 分钟休息')
    await expect(startDialog.getByRole('button', { name: '再想想' })).toBeFocused()
    await expect(page.getByRole('button', { name: '取消当前苹果钟' })).toHaveCount(0)
    await startDialog.getByRole('button', { name: '确认开始' }).click()

    const focusOverlay = page.getByRole('dialog', { name: '和饼狗一起专注' })
    await expect(focusOverlay).toBeVisible()
    await expect(focusOverlay.locator('.pomodoro-focus__mascot')).toBeVisible()
    await expect(focusOverlay.getByRole('heading', { name: '待办事项' })).toBeVisible()
    await focusOverlay.getByRole('button', { name: '取消本次计时' }).click()

    const cancelDialog = page.getByRole('alertdialog', { name: '确认取消苹果钟？' })
    await expect(cancelDialog).toContainText('不会推进相伴天数')
    await expect(cancelDialog.getByRole('button', { name: '继续专注' })).toBeFocused()
    await cancelDialog.getByRole('button', { name: '取消计时' }).click()

    await expect(focusOverlay).toHaveCount(0)
    await expect(workPanel.getByRole('button', { name: '开始苹果钟' })).toBeEnabled()

    await workPanel.getByRole('button', { name: '开始苹果钟' }).click()
    await page
      .getByRole('alertdialog', { name: '确认开始苹果钟？' })
      .getByRole('button', { name: '确认开始' })
      .click()
    await page
      .getByRole('dialog', { name: '和饼狗一起专注' })
      .getByRole('button', { name: '取消本次计时' })
      .click()
    const panelCancelDialog = page.getByRole('alertdialog', { name: '确认取消苹果钟？' })
    await expect(panelCancelDialog.getByRole('button', { name: '继续专注' })).toBeFocused()
    await panelCancelDialog.getByRole('button', { name: '取消计时' }).click()

    await expect(workPanel.getByRole('button', { name: '开始苹果钟' })).toBeEnabled()
    expect(await readCompanionDays(page)).toBe(daysBefore)
  })

  test('现实苹果钟到点只推进一次陪伴日并显示完成提醒', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-09T10:00:00+08:00') })
    await startGame(page, { displayName: '苹果钟完成测试', seed: 'v4-pomodoro-complete' })
    const daysBefore = await readCompanionDays(page)

    await enterReality(page)
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

    await page.clock.fastForward(25 * 60_000 + 1_000)
    await expect(page.getByRole('dialog', { name: '休息一下吧' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: '专注结束啦' })).toContainText(
      '休息 5 分钟',
    )
    expect(await readCompanionDays(page)).toBe(daysBefore)

    await page.clock.fastForward(5 * 60_000 + 1_000)
    await expect(workPanel.getByRole('status').filter({ hasText: '本轮已完成' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: '苹果钟完成啦' })).toContainText(
      '这一轮专注和休息都完成啦',
    )
    await expect.poll(() => readCompanionDays(page)).toBe(daysBefore + 1)

    await page.clock.fastForward(60_000)
    expect(await readCompanionDays(page)).toBe(daysBefore + 1)
  })
})
