import {
  buildStreamRound,
  DEFAULT_STREAM_ROUND_INTERVAL_MS,
  STREAM_VIDEO_INTERVAL_MS,
} from './catalog'

export type StreamSchedulerStatus = 'opening' | 'waiting' | 'completed' | 'stopped'
export type StreamSchedulerOutcome = 'completed' | 'stopped'

export interface StreamSchedulerSnapshot {
  readonly status: StreamSchedulerStatus
  readonly startedAt: number
  readonly stopAt: number | null
  readonly round: number
  readonly roundsCompleted: number
  readonly openedCount: number
  readonly totalCount: number
  readonly nextActionAt: number | null
}

export interface StreamSchedulerCallbacks {
  readonly onStarted?: (startedAt: number) => void
  readonly onOpenVideo: (bvid: string, round: number, index: number) => void
  readonly onClearRound: () => void
  readonly onStatus?: (snapshot: StreamSchedulerSnapshot) => void
  readonly onRoundCompleted?: (round: number, completedAt: number) => void
  readonly onEnded?: (
    outcome: StreamSchedulerOutcome,
    endedAt: number,
    roundsCompleted: number,
  ) => void
}

export interface StreamSchedulerOptions extends StreamSchedulerCallbacks {
  readonly catalogBvids: readonly string[]
  readonly selfTestBvid: string | null
  readonly stopAt: number | null
  readonly videoIntervalMs?: number
  readonly roundIntervalMs?: number
  readonly random?: () => number
  readonly now?: () => number
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown
  readonly clearTimer?: (timer: unknown) => void
}

const MAX_TIMER_DELAY_MS = 2_147_483_647

export class StreamRoundScheduler {
  private readonly catalogBvids: readonly string[]
  private readonly selfTestBvid: string | null
  private readonly stopAt: number | null
  private readonly videoIntervalMs: number
  private readonly random: () => number
  private readonly now: () => number
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown
  private readonly clearTimer: (timer: unknown) => void
  private readonly callbacks: StreamSchedulerCallbacks
  private roundIntervalMs: number
  private timer: unknown = null
  private queue: readonly string[] = []
  private active = false
  private snapshot: StreamSchedulerSnapshot | null = null

  constructor(options: StreamSchedulerOptions) {
    this.catalogBvids = options.catalogBvids
    this.selfTestBvid = options.selfTestBvid
    this.stopAt = options.stopAt
    this.videoIntervalMs = options.videoIntervalMs ?? STREAM_VIDEO_INTERVAL_MS
    this.roundIntervalMs = options.roundIntervalMs ?? DEFAULT_STREAM_ROUND_INTERVAL_MS
    this.random = options.random ?? Math.random
    this.now = options.now ?? Date.now
    this.setTimer =
      options.setTimer ?? ((callback, delayMs) => window.setTimeout(callback, delayMs))
    this.clearTimer =
      options.clearTimer ?? ((timer) => window.clearTimeout(timer as ReturnType<typeof setTimeout>))
    this.callbacks = options
  }

  start() {
    if (this.active) return
    const startedAt = this.now()
    this.active = true
    this.snapshot = {
      status: 'opening',
      startedAt,
      stopAt: this.stopAt,
      round: 1,
      roundsCompleted: 0,
      openedCount: 0,
      totalCount: 0,
      nextActionAt: null,
    }
    if (this.stopAt !== null && startedAt >= this.stopAt) {
      this.finish('completed')
      return
    }
    this.callbacks.onStarted?.(startedAt)
    this.beginRound()
  }

  stop() {
    if (!this.active) return
    this.finish('stopped')
  }

  /** 卸载页面时只清理资源，不把浏览器关窗伪装成一次正常停止。 */
  dispose() {
    this.active = false
    this.clearScheduledTimer()
    this.callbacks.onClearRound()
  }

  reconcile() {
    if (!this.active || this.snapshot === null) return
    this.clearScheduledTimer()
    const now = this.now()
    const deadline = this.snapshot.nextActionAt
    if (deadline !== null && now >= deadline && this.snapshot.status === 'waiting') {
      const completedRound = this.snapshot.round
      this.callbacks.onRoundCompleted?.(completedRound, now)
      this.snapshot = {
        ...this.snapshot,
        round: completedRound + 1,
        roundsCompleted: this.snapshot.roundsCompleted + 1,
      }
      if (this.stopAt !== null && now >= this.stopAt) {
        this.finish('completed')
        return
      }
      this.beginRound()
      return
    }

    if (this.stopAt !== null && now >= this.stopAt) {
      this.finish('completed')
      return
    }

    if (deadline === null || now < deadline) {
      this.armTimer()
      return
    }

    if (this.snapshot.status === 'opening') {
      this.openNextVideo()
      return
    }
  }

  setRoundIntervalMs(intervalMs: number) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return
    this.roundIntervalMs = intervalMs
    if (!this.active || this.snapshot?.status !== 'waiting') return
    this.snapshot = {
      ...this.snapshot,
      nextActionAt: this.now() + intervalMs,
    }
    this.emitStatus()
    this.armTimer()
  }

  getSnapshot() {
    return this.snapshot
  }

  private beginRound() {
    if (!this.active || this.snapshot === null) return
    this.callbacks.onClearRound()
    this.queue = buildStreamRound(this.catalogBvids, this.selfTestBvid, this.random)
    if (this.queue.length === 0) {
      throw new Error('刷播队列不能为空')
    }
    this.snapshot = {
      ...this.snapshot,
      status: 'opening',
      openedCount: 0,
      totalCount: this.queue.length,
      nextActionAt: null,
    }
    this.openNextVideo()
  }

  private openNextVideo() {
    if (!this.active || this.snapshot === null) return
    const now = this.now()
    if (this.stopAt !== null && now >= this.stopAt) {
      this.finish('completed')
      return
    }

    const index = this.snapshot.openedCount
    const bvid = this.queue[index]
    if (bvid === undefined) return
    this.callbacks.onOpenVideo(bvid, this.snapshot.round, index)
    const openedCount = index + 1
    const finishedOpening = openedCount >= this.queue.length
    this.snapshot = {
      ...this.snapshot,
      status: finishedOpening ? 'waiting' : 'opening',
      openedCount,
      nextActionAt: now + (finishedOpening ? this.roundIntervalMs : this.videoIntervalMs),
    }
    this.emitStatus()
    this.armTimer()
  }

  private emitStatus() {
    if (this.snapshot !== null) this.callbacks.onStatus?.(this.snapshot)
  }

  private armTimer() {
    if (!this.active || this.snapshot === null) return
    this.clearScheduledTimer()
    const deadlines = [this.snapshot.nextActionAt, this.stopAt].filter(
      (deadline): deadline is number => deadline !== null,
    )
    if (deadlines.length === 0) return
    const deadline = Math.min(...deadlines)
    const delayMs = Math.min(MAX_TIMER_DELAY_MS, Math.max(0, deadline - this.now()))
    this.timer = this.setTimer(() => this.reconcile(), delayMs)
  }

  private clearScheduledTimer() {
    if (this.timer === null) return
    this.clearTimer(this.timer)
    this.timer = null
  }

  private finish(outcome: StreamSchedulerOutcome) {
    if (!this.active || this.snapshot === null) return
    const endedAt = this.now()
    this.active = false
    this.clearScheduledTimer()
    this.callbacks.onClearRound()
    this.snapshot = {
      ...this.snapshot,
      status: outcome === 'completed' ? 'completed' : 'stopped',
      openedCount: 0,
      totalCount: 0,
      nextActionAt: null,
    }
    this.callbacks.onStatus?.(this.snapshot)
    this.callbacks.onEnded?.(outcome, endedAt, this.snapshot.roundsCompleted)
  }
}
