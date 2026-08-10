import { useCallback, useEffect, useRef, useState } from 'react'

import {
  STREAM_DEFAULT_ROUND_INTERVAL_MS,
  STREAM_DEFAULT_VIDEO_INTERVAL_MS,
  STREAM_MAX_ROUND_INTERVAL_MS,
  STREAM_MAX_VIDEO_INTERVAL_MS,
  STREAM_MIN_ROUND_INTERVAL_MS,
  STREAM_MIN_VIDEO_INTERVAL_MS,
} from '@/domain'

import { buildStreamQueue, buildVisitorStreamUrl } from './parser'

export type VisitorStreamStatus = 'idle' | 'opening' | 'waiting'

export interface VisitorStreamFrame {
  readonly id: string
  readonly bvid: string
  readonly url: string
}

export interface VisitorStreamSettings {
  readonly videoIntervalMs?: number
  readonly roundIntervalMs?: number
  readonly selfTestBvid?: string | null
}

export interface VisitorStreamState {
  readonly status: VisitorStreamStatus
  readonly startedAt: number | null
  readonly round: number
  readonly completedRounds: number
  readonly frames: readonly VisitorStreamFrame[]
  readonly bvids: readonly string[]
  readonly videoIntervalMs: number
  readonly roundIntervalMs: number
  readonly message: string
}

export interface VisitorStreamController {
  readonly state: VisitorStreamState
  readonly start: (bvids: readonly string[], settings?: VisitorStreamSettings) => boolean
  readonly stop: () => void
  readonly getNextRoundRemainingMs: () => number | null
}

interface VisitorRuntime {
  status: VisitorStreamStatus
  startedAt: number | null
  round: number
  completedRounds: number
  frames: VisitorStreamFrame[]
  catalogBvids: string[]
  selfTestBvid: string | null
  bvids: string[]
  videoIntervalMs: number
  roundIntervalMs: number
  nextRoundIntervalMs: number
  nextIndex: number
  nextActionAt: number | null
  signature: string | null
  message: string
}

function createRuntime(): VisitorRuntime {
  return {
    status: 'idle',
    startedAt: null,
    round: 0,
    completedRounds: 0,
    frames: [],
    catalogBvids: [],
    selfTestBvid: null,
    bvids: [],
    videoIntervalMs: STREAM_DEFAULT_VIDEO_INTERVAL_MS,
    roundIntervalMs: STREAM_DEFAULT_ROUND_INTERVAL_MS,
    nextRoundIntervalMs: STREAM_DEFAULT_ROUND_INTERVAL_MS,
    nextIndex: 0,
    nextActionAt: null,
    signature: null,
    message: '游客刷播未运行',
  }
}

function toState(runtime: VisitorRuntime): VisitorStreamState {
  return {
    status: runtime.status,
    startedAt: runtime.startedAt,
    round: runtime.round,
    completedRounds: runtime.completedRounds,
    frames: [...runtime.frames],
    bvids: [...runtime.bvids],
    videoIntervalMs: runtime.videoIntervalMs,
    roundIntervalMs: runtime.roundIntervalMs,
    message: runtime.message,
  }
}

function normalizeInterval(value: number | undefined, min: number, max: number, fallback: number) {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < min || value > max) return null
  return value
}

/**
 * 实验性游客刷播只调度官方 player iframe，不读取跨站状态，也不向 B 站 API 发请求。
 * 所有步骤共用一个基于 performance.now() 截止时间的一次性计时器。
 */
export function useVisitorStreamPlayback(
  random: () => number = Math.random,
): VisitorStreamController {
  const runtimeRef = useRef<VisitorRuntime>(createRuntime())
  const randomRef = useRef(random)
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const timerGenerationRef = useRef(0)
  const reconcileRef = useRef<() => void>(() => undefined)
  const [state, setState] = useState<VisitorStreamState>(() => toState(createRuntime()))

  useEffect(() => {
    randomRef.current = random
  }, [random])

  const publish = useCallback(() => setState(toState(runtimeRef.current)), [])

  const clearTimer = useCallback(() => {
    timerGenerationRef.current += 1
    if (timerRef.current !== null) globalThis.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const scheduleAt = useCallback(
    (deadline: number) => {
      clearTimer()
      const generation = timerGenerationRef.current
      timerRef.current = globalThis.setTimeout(
        () => {
          if (generation !== timerGenerationRef.current) return
          timerRef.current = null
          reconcileRef.current()
        },
        Math.max(0, deadline - globalThis.performance.now()),
      )
    },
    [clearTimer],
  )

  const openNext = useCallback(() => {
    const runtime = runtimeRef.current
    const bvid = runtime.bvids[runtime.nextIndex]
    if (runtime.status === 'idle' || bvid === undefined) return

    const frameIndex = runtime.nextIndex
    runtime.frames.push({
      id: `visitor-${runtime.round}-${frameIndex}`,
      bvid,
      url: buildVisitorStreamUrl(bvid),
    })
    runtime.nextIndex += 1
    const now = globalThis.performance.now()
    if (runtime.nextIndex >= runtime.bvids.length) {
      runtime.status = 'waiting'
      runtime.nextActionAt = now + runtime.roundIntervalMs
      runtime.message = `游客刷播第 ${runtime.round} 轮运行中`
    } else {
      runtime.status = 'opening'
      runtime.nextActionAt = now + runtime.videoIntervalMs
      runtime.message = `游客刷播第 ${runtime.round} 轮正在加载视频`
    }
    publish()
    scheduleAt(runtime.nextActionAt)
  }, [publish, scheduleAt])

  const beginRound = useCallback(
    (round: number, existingQueue?: readonly string[]) => {
      const runtime = runtimeRef.current
      clearTimer()
      runtime.roundIntervalMs = runtime.nextRoundIntervalMs
      runtime.status = 'opening'
      runtime.round = round
      runtime.frames = []
      runtime.bvids = existingQueue
        ? [...existingQueue]
        : buildStreamQueue(runtime.selfTestBvid, runtime.catalogBvids, randomRef.current)
      runtime.nextIndex = 0
      runtime.nextActionAt = null
      runtime.message = `游客刷播第 ${round} 轮正在加载视频`
      publish()
      openNext()
    },
    [clearTimer, openNext, publish],
  )

  const reconcile = useCallback(() => {
    const runtime = runtimeRef.current
    if (runtime.status === 'idle' || runtime.nextActionAt === null) return
    const now = globalThis.performance.now()
    if (now < runtime.nextActionAt) {
      scheduleAt(runtime.nextActionAt)
      return
    }
    if (runtime.status === 'opening') {
      openNext()
      return
    }
    runtime.completedRounds += 1
    beginRound(runtime.round + 1)
  }, [beginRound, openNext, scheduleAt])

  useEffect(() => {
    reconcileRef.current = reconcile
  }, [reconcile])

  const stop = useCallback(() => {
    if (runtimeRef.current.status === 'idle') return
    clearTimer()
    runtimeRef.current = createRuntime()
    publish()
  }, [clearTimer, publish])

  const getNextRoundRemainingMs = useCallback(() => {
    const runtime = runtimeRef.current
    if (runtime.status !== 'waiting' || runtime.nextActionAt === null) return null
    return Math.max(0, runtime.nextActionAt - globalThis.performance.now())
  }, [])

  const start = useCallback(
    (sourceBvids: readonly string[], settings: VisitorStreamSettings = {}) => {
      const selfTestBvid = settings.selfTestBvid ?? null
      const catalogBvids = [...new Set(sourceBvids)].filter((bvid) => bvid !== selfTestBvid)
      const videoIntervalMs = normalizeInterval(
        settings.videoIntervalMs,
        STREAM_MIN_VIDEO_INTERVAL_MS,
        STREAM_MAX_VIDEO_INTERVAL_MS,
        STREAM_DEFAULT_VIDEO_INTERVAL_MS,
      )
      const roundIntervalMs = normalizeInterval(
        settings.roundIntervalMs,
        STREAM_MIN_ROUND_INTERVAL_MS,
        STREAM_MAX_ROUND_INTERVAL_MS,
        STREAM_DEFAULT_ROUND_INTERVAL_MS,
      )
      if (
        (catalogBvids.length === 0 && selfTestBvid === null) ||
        videoIntervalMs === null ||
        roundIntervalMs === null
      ) {
        return false
      }

      const signature = `${catalogBvids.join(',')}|${selfTestBvid ?? ''}|${videoIntervalMs}`
      const current = runtimeRef.current
      if (current.status !== 'idle' && current.signature === signature) {
        current.nextRoundIntervalMs = roundIntervalMs
        return true
      }

      const bvids = buildStreamQueue(selfTestBvid, catalogBvids, randomRef.current)
      clearTimer()
      runtimeRef.current = {
        ...createRuntime(),
        startedAt: Date.now(),
        catalogBvids,
        selfTestBvid,
        bvids,
        videoIntervalMs,
        roundIntervalMs,
        nextRoundIntervalMs: roundIntervalMs,
        signature,
      }
      beginRound(1, bvids)
      return true
    },
    [beginRound, clearTimer],
  )

  useEffect(() => {
    const resume = () => reconcileRef.current()
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', resume)
      clearTimer()
    }
  }, [clearTimer])

  return { state, start, stop, getNextRoundRemainingMs }
}
