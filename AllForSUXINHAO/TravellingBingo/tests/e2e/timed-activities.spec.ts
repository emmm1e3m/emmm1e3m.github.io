import { expect, test, type Page } from '@playwright/test'

import {
  buySupply,
  cancelActivity,
  completeActivity,
  prepareActivity,
  readAppleCount,
  readCompanionDays,
  readSupplyCount,
  saveScreenshot,
  setDebugDuration,
  startActivity,
  startGame,
} from './support/game'

const ACTIVITIES = [
  { name: '出去旅行', area: '房门', supply: '普通旅行便当', initialSupply: 1 },
  { name: '认真刷播', area: '电脑', supply: '信号耳机', initialSupply: 0 },
  { name: '全力冲热', area: '电脑', supply: '热度工具箱', initialSupply: 0 },
  { name: '一起弹琴', area: '电子琴', supply: null, initialSupply: null },
  { name: '好好睡一觉', area: '床铺', supply: null, initialSupply: null },
] as const

interface AudioProbeStats {
  contexts: number
  oscillators: number
  closes: number
  suspends: number
}

async function installAudioContextProbe(page: Page) {
  await page.addInitScript(() => {
    const stats: AudioProbeStats = { contexts: 0, oscillators: 0, closes: 0, suspends: 0 }
    ;(globalThis as typeof globalThis & { __audioProbe: AudioProbeStats }).__audioProbe = stats

    class FakeAudioParam {
      cancelScheduledValues() {}
      exponentialRampToValueAtTime() {}
      setTargetAtTime() {}
      setValueAtTime() {}
    }

    class FakeOscillator {
      type = 'triangle'
      frequency = new FakeAudioParam()
      connect() {
        return this
      }
      disconnect() {}
      start() {}
      stop() {}
    }

    class FakeGain {
      gain = new FakeAudioParam()
      constructor(readonly context: FakeAudioContext) {}
      connect() {
        return this
      }
      disconnect() {}
    }

    class FakeDynamicsCompressor {
      threshold = new FakeAudioParam()
      knee = new FakeAudioParam()
      ratio = new FakeAudioParam()
      attack = new FakeAudioParam()
      release = new FakeAudioParam()
      connect() {
        return this
      }
      disconnect() {}
    }

    class FakeAudioContext {
      state = 'running'
      currentTime = 0
      destination = {}
      onstatechange: (() => void) | null = null
      constructor() {
        stats.contexts += 1
      }
      resume() {
        this.state = 'running'
        this.onstatechange?.()
        return Promise.resolve()
      }
      suspend() {
        stats.suspends += 1
        this.state = 'suspended'
        this.onstatechange?.()
        return Promise.resolve()
      }
      createOscillator() {
        stats.oscillators += 1
        return new FakeOscillator()
      }
      createGain() {
        return new FakeGain(this)
      }
      createDynamicsCompressor() {
        return new FakeDynamicsCompressor()
      }
      close() {
        stats.closes += 1
        this.state = 'closed'
        return Promise.resolve()
      }
    }

    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    })
  })
}

async function readAudioProbe(page: Page) {
  return page.evaluate(
    () => (globalThis as typeof globalThis & { __audioProbe: AudioProbeStats }).__audioProbe,
  )
}

test.describe('所有读条活动的确认与取消', () => {
  for (const activity of ACTIVITIES) {
    test(`${activity.name} 必须二次确认，↩️取消后不加天也不返还补给`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', '活动矩阵只在桌面项目运行')
      await startGame(page, { debug: true, seed: 'e2e-4', displayName: '活动测试' })
      await setDebugDuration(page, '10 秒')

      if (activity.supply && activity.initialSupply === 0) {
        await buySupply(page, activity.supply)
      }
      const daysBefore = await readCompanionDays(page)
      const supplyBefore = activity.supply ? await readSupplyCount(page, activity.supply) : null

      const { confirmation } = await prepareActivity(page, activity.area, activity.name)
      await expect(page.getByRole('button', { name: '取消当前活动', exact: true })).toHaveCount(0)
      await expect(confirmation.getByRole('button', { name: '再想想' })).toBeFocused()
      await confirmation.getByRole('button', { name: '确认开始' }).click()
      await expect(page.getByRole('button', { name: '取消当前活动', exact: true })).toBeVisible()

      const applesAfterStart = await readAppleCount(page)
      const supplyAfterStart = activity.supply ? await readSupplyCount(page, activity.supply) : null
      if (activity.supply) {
        expect(supplyAfterStart).toBe(supplyBefore! - 1)
      }
      await cancelActivity(page)

      expect(await readCompanionDays(page)).toBe(daysBefore)
      expect(await readAppleCount(page)).toBe(applesAfterStart)
      if (activity.supply) {
        expect(await readSupplyCount(page, activity.supply)).toBe(supplyAfterStart)
      }
      if (activity.name === '好好睡一觉') {
        const darkness = page.locator('.day-night-overlay')
        await expect(darkness).not.toHaveClass(/is-resting|is-playing/u)
        await expect
          .poll(async () =>
            Number(await darkness.evaluate((element) => getComputedStyle(element).opacity)),
          )
          .toBe(0)
      }
    })
  }
})

test('睡觉读条时饼狗在床上且房间变暗，领取后增加 1 天和 1🍎', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '日夜过场只在桌面项目验证')
  await startGame(page, { debug: true, seed: 'rest-e2e', displayName: '晚安' })
  await setDebugDuration(page, '10 秒')
  const daysBefore = await readCompanionDays(page)
  const applesBefore = await readAppleCount(page)

  await startActivity(page, '床铺', '好好睡一觉')
  const room = page.getByRole('region', { name: '铲铲饼屋互动场景' })
  const mascot = room.locator('.room-mascot--actor')
  await expect(mascot.locator('.mascot-sprite--sleep')).toBeVisible()
  const petPosition = await mascot.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      x: style.getPropertyValue('--pet-x').trim(),
      y: style.getPropertyValue('--pet-y').trim(),
    }
  })
  expect(Number.parseFloat(petPosition.x)).toBeCloseTo((225 / 1098) * 100, 5)
  expect(Number.parseFloat(petPosition.y)).toBeCloseTo((300 / 1433) * 100, 5)
  const darkness = room.locator('.day-night-overlay')
  await expect(darkness).toHaveClass(/is-resting/u)
  await expect
    .poll(async () =>
      Number(await darkness.evaluate((element) => getComputedStyle(element).opacity)),
    )
    .toBeGreaterThan(0)

  const reward = await completeActivity(page)
  await expect(reward).toContainText('饼狗睡醒啦')
  expect(await readCompanionDays(page)).toBe(daysBefore + 1)
  expect(await readAppleCount(page)).toBe(applesBefore + 1)
  await expect(darkness).toHaveClass(/is-playing/u)
  await saveScreenshot(page, 'rest-day-night-reward.png', false)
  await reward.getByRole('button', { name: '回到房间' }).click()
})

test('弹琴活动读条期间仍可弹四排 48 键，并只给白键映射电脑键盘', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'WebAudio 琴键只在桌面 Chromium 验证')
  await startGame(page, { debug: true, seed: 'music-e2e', displayName: '琴键测试' })
  await setDebugDuration(page, '10 秒')
  await startActivity(page, '电子琴', '一起弹琴')

  const keyboard = page.locator('.piano').filter({ hasText: '和饼狗弹一小段' })
  await expect(keyboard).toBeVisible()
  await expect(keyboard.locator('.piano__row')).toHaveCount(4)
  await expect(keyboard.getByRole('group')).toHaveCount(4)
  await expect(keyboard.getByRole('button')).toHaveCount(48)
  await expect(keyboard).toContainText(
    '试着从 C6 B5 G5 E5 G5 C6 B5 G5 E5 G5 E5，C6 B5 G5 E5 G5 C6 D6 C6 D6 E6 E6 开始~',
  )
  const c3 = keyboard.getByRole('button', { name: 'C3，键盘 Z' })
  const c4 = keyboard.getByRole('button', { name: 'C4，键盘 A' })
  const c6 = keyboard.getByRole('button', { name: 'C6，键盘 1' })
  const cSharp5 = keyboard.getByRole('button', { name: 'C#5', exact: true })
  await expect(c3).toBeEnabled()
  await expect(c4).toBeEnabled()
  await expect(c6).toBeEnabled()
  await expect(cSharp5).not.toHaveAccessibleName(/键盘/u)
  const overflow = await keyboard.evaluate((element) => ({
    horizontal: element.scrollWidth - element.clientWidth,
    vertical: element.scrollHeight - element.clientHeight,
  }))
  expect(overflow.horizontal).toBeLessThanOrEqual(1)
  expect(overflow.vertical).toBeLessThanOrEqual(1)
  await page.keyboard.down('z')
  await expect(c3).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.up('z')
  await expect(c3).toHaveAttribute('aria-pressed', 'false')
  await cancelActivity(page)
})

test('电子琴在窄信息栏中保持四排完整琴键', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '窄信息栏布局只需在桌面 Chromium 验证')
  await page.setViewportSize({ width: 1280, height: 650 })
  await startGame(page, { seed: 'piano-layout', displayName: '琴键布局' })

  await page.locator('[data-hotspot="电子琴"]').click()
  const panel = page.locator('.context-content--v4.piano-panel')
  const keyboard = panel.locator('.piano')
  await expect(keyboard).toBeVisible()

  const geometry = await keyboard.evaluate((element) => {
    const rows = [...element.querySelectorAll<HTMLElement>('.piano__row')]
    const labels = [...element.querySelectorAll<HTMLElement>('.piano__row-label')]
    const whiteKeyCopies = [
      ...element.querySelectorAll<HTMLElement>('.piano-key--white span, .piano-key--white small'),
    ]
    return {
      rowHeights: rows.map((row) => row.getBoundingClientRect().height),
      labelsVisible: labels.every((label) => {
        const row = label.closest<HTMLElement>('.piano__row')
        if (!row) return false
        const rowBox = row.getBoundingClientRect()
        const box = label.getBoundingClientRect()
        return box.height > 0 && box.top >= rowBox.top && box.bottom <= rowBox.bottom
      }),
      whiteKeyCopiesVisible: whiteKeyCopies.every((copy) => {
        const row = copy.closest<HTMLElement>('.piano__row')
        if (!row) return false
        const rowBox = row.getBoundingClientRect()
        const box = copy.getBoundingClientRect()
        return (
          box.width > 0 && box.height > 0 && box.top >= rowBox.top && box.bottom <= rowBox.bottom
        )
      }),
    }
  })

  expect(geometry.rowHeights).toHaveLength(4)
  expect(geometry.rowHeights.every((height) => height >= 69)).toBe(true)
  expect(geometry.labelsVisible).toBe(true)
  expect(geometry.whiteKeyCopiesVisible).toBe(true)

  const c3 = keyboard.getByRole('button', { name: 'C3，键盘 Z' })
  const cSharp6 = keyboard.getByRole('button', { name: 'C#6', exact: true })
  await expect(c3).toBeEnabled()
  await expect(cSharp6).toBeEnabled()
  await c3.click()
  await cSharp6.click()
})

test('电子琴在 inert 弹窗后不响应，收藏墙切走面板会卸载音频且菜单不重现', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '音频生命周期只在桌面 Chromium 验证')
  await installAudioContextProbe(page)
  await startGame(page, { seed: 'e2e-4', displayName: '钢琴生命周期' })

  await page.getByRole('button', { name: '饼狗，打开行动菜单' }).click()
  await expect(page.getByRole('dialog', { name: '饼狗状态' })).toBeVisible()
  await page.locator('[data-hotspot="电子琴"]').click()
  await expect(page.getByRole('dialog', { name: '饼狗状态' })).toHaveCount(0)

  const keyboard = page.locator('.piano').filter({ hasText: '和饼狗弹一小段' })
  await expect(keyboard).toBeVisible()
  const beforePiano = await readAudioProbe(page)
  await page.keyboard.press('z')
  await expect
    .poll(async () => (await readAudioProbe(page)).oscillators)
    .toBe(beforePiano.oscillators + 3)

  await page.getByRole('button', { name: '打开收藏墙' }).click()
  const album = page.getByRole('dialog', { name: '饼狗的收藏墙' })
  await expect(album).toBeVisible()
  await expect(page.locator('.game-layout--v3')).toHaveAttribute('inert', '')
  await page.keyboard.press('z')
  expect((await readAudioProbe(page)).oscillators).toBe(beforePiano.oscillators + 3)
  await album.getByRole('button', { name: '关闭收藏墙' }).click()

  await expect(keyboard).toHaveCount(0)
  await expect.poll(async () => (await readAudioProbe(page)).closes).toBe(beforePiano.closes + 1)
  await page.keyboard.press('z')
  expect((await readAudioProbe(page)).oscillators).toBe(beforePiano.oscillators + 3)
  await expect(page.getByRole('dialog', { name: '饼狗状态' })).toHaveCount(0)
})
