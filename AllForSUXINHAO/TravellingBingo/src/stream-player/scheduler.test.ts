import { StreamRoundScheduler, type StreamSchedulerOptions } from './scheduler'

const FIRST = 'BV1xx411c7mD'
const SECOND = 'BV1Q541167Qg'

function createHarness(overrides: Partial<StreamSchedulerOptions> = {}) {
  let now = 1_000
  let currentTimer: { callback: () => void; delayMs: number; cleared: boolean } | null = null
  const opened: Array<{ bvid: string; round: number; index: number }> = []
  const completed: Array<{ round: number; completedAt: number }> = []
  const ended: Array<{ outcome: string; endedAt: number; roundsCompleted: number }> = []
  let clears = 0

  const scheduler = new StreamRoundScheduler({
    catalogBvids: [FIRST],
    selfTestBvid: SECOND,
    stopAt: null,
    random: () => 0,
    now: () => now,
    setTimer: (callback, delayMs) => {
      currentTimer = { callback, delayMs, cleared: false }
      return currentTimer
    },
    clearTimer: (timer) => {
      ;(timer as { cleared: boolean }).cleared = true
    },
    onOpenVideo: (bvid, round, index) => opened.push({ bvid, round, index }),
    onClearRound: () => {
      clears += 1
    },
    onRoundCompleted: (round, completedAt) => completed.push({ round, completedAt }),
    onEnded: (outcome, endedAt, roundsCompleted) =>
      ended.push({ outcome, endedAt, roundsCompleted }),
    ...overrides,
  })

  return {
    scheduler,
    opened,
    completed,
    ended,
    get clears() {
      return clears
    },
    get timer() {
      return currentTimer
    },
    setNow(value: number) {
      now = value
    },
  }
}

describe('StreamRoundScheduler', () => {
  it('首个视频立即创建，后续视频按 5 秒绝对时点打开', () => {
    const harness = createHarness()
    harness.scheduler.start()

    expect(harness.opened).toEqual([{ bvid: FIRST, round: 1, index: 0 }])
    expect(harness.timer?.delayMs).toBe(5_000)

    harness.setNow(5_999)
    harness.scheduler.reconcile()
    expect(harness.opened).toHaveLength(1)

    harness.setNow(6_000)
    harness.scheduler.reconcile()
    expect(harness.opened[1]).toEqual({ bvid: SECOND, round: 1, index: 1 })
    expect(harness.scheduler.getSnapshot()).toMatchObject({
      status: 'waiting',
      nextActionAt: 316_000,
    })
  })

  it('最后一个 iframe 创建后 310 秒销毁全轮并立即开始下轮', () => {
    const harness = createHarness()
    harness.scheduler.start()
    harness.setNow(6_000)
    harness.scheduler.reconcile()
    harness.setNow(316_000)
    harness.scheduler.reconcile()

    expect(harness.completed).toEqual([{ round: 1, completedAt: 316_000 }])
    expect(harness.clears).toBe(2)
    expect(harness.opened.at(-1)).toEqual({ bvid: FIRST, round: 2, index: 0 })
    expect(harness.scheduler.getSnapshot()).toMatchObject({
      status: 'opening',
      round: 2,
      roundsCompleted: 1,
      nextActionAt: 321_000,
    })
  })

  it('页面恢复时只校准当前动作，不追赶被回收期间的多个 5 秒间隔', () => {
    const harness = createHarness()
    harness.scheduler.start()
    harness.setNow(61_000)
    harness.scheduler.reconcile()

    expect(harness.opened).toHaveLength(2)
    expect(harness.scheduler.getSnapshot()).toMatchObject({
      status: 'waiting',
      nextActionAt: 371_000,
    })
  })

  it('DEBUG 调整可将当前等待轮的截止点改为更近的绝对时间', () => {
    const harness = createHarness()
    harness.scheduler.start()
    harness.setNow(6_000)
    harness.scheduler.reconcile()
    harness.scheduler.setRoundIntervalMs(1_000)
    expect(harness.scheduler.getSnapshot()?.nextActionAt).toBe(7_000)

    harness.setNow(7_000)
    harness.scheduler.reconcile()
    expect(harness.completed).toEqual([{ round: 1, completedAt: 7_000 }])
  })

  it('定时停止使用墙钟截止点并销毁已打开的整轮', () => {
    const harness = createHarness({ stopAt: 4_000 })
    harness.scheduler.start()
    expect(harness.timer?.delayMs).toBe(3_000)

    harness.setNow(4_000)
    harness.scheduler.reconcile()
    expect(harness.opened).toHaveLength(1)
    expect(harness.ended).toEqual([{ outcome: 'completed', endedAt: 4_000, roundsCompleted: 0 }])
    expect(harness.scheduler.getSnapshot()?.status).toBe('completed')
  })

  it('轮次截止与定时停止同刻到期时，先记录已完成的整轮', () => {
    const harness = createHarness({ stopAt: 316_000 })
    harness.scheduler.start()
    harness.setNow(6_000)
    harness.scheduler.reconcile()
    harness.setNow(316_000)
    harness.scheduler.reconcile()

    expect(harness.completed).toEqual([{ round: 1, completedAt: 316_000 }])
    expect(harness.ended).toEqual([{ outcome: 'completed', endedAt: 316_000, roundsCompleted: 1 }])
  })
})
