import { useCallback, useEffect, useRef, useState } from 'react'

import {
  STREAM_DEFAULT_ROUND_INTERVAL_MS,
  STREAM_DEFAULT_VIDEO_INTERVAL_MS,
  STREAM_MAX_ROUND_INTERVAL_MS,
  STREAM_MAX_VIDEO_INTERVAL_MS,
  STREAM_MIN_ROUND_INTERVAL_MS,
  STREAM_MIN_VIDEO_INTERVAL_MS,
} from '@/domain'

import {
  buildStreamQueue,
  buildStreamVideoUrl,
  emptyStreamCatalogResult,
  parseStreamSelfTestInput,
  type StreamInputError,
  type StreamParseResult,
} from './parser'

export type StreamPlaybackMode = 'popup' | 'tabs'
export type StreamPlaybackStatus =
  'idle' | 'opening' | 'waiting' | 'blocked' | 'stopped' | 'completed'

export interface StreamRoundCompletion {
  readonly sessionId: string
  readonly startedAt: number
  readonly completedAt: number
}

export interface StreamSessionEnd {
  readonly sessionId: string
  readonly startedAt: number
  readonly endedAt: number
  readonly roundsCompleted: number
  readonly outcome: 'completed' | 'stopped'
}

export interface StreamStartSettings {
  readonly openDelayMs?: number
  readonly stopAfterMs?: number | null
}

export interface StreamPlaybackState {
  readonly status: StreamPlaybackStatus
  readonly round: number
  readonly sessionRoundsCompleted: number
  readonly openDelayMs: number
  readonly roundDurationMs: number
  readonly stopAfterMs: number | null
  readonly mode: StreamPlaybackMode | null
  readonly sourceInput: string
  readonly parsedBvids: readonly string[]
  readonly openedCount: number
  readonly message: string
  readonly errors: readonly StreamInputError[]
}

export interface UseStreamPlaybackOptions {
  readonly catalogBvids?: readonly string[]
  readonly completedRounds?: number
  readonly roundDurationMs?: number
  readonly onRoundCompleted?: (event: StreamRoundCompletion) => void
  readonly onSessionEnded?: (event: StreamSessionEnd) => void
}

export interface StreamPlaybackController {
  readonly state: StreamPlaybackState
  readonly start: (
    input: string,
    mode: StreamPlaybackMode,
    settings?: StreamStartSettings,
  ) => StreamParseResult
  readonly resume: () => boolean
  readonly stop: () => void
  readonly getRemainingMs: () => number | null
  readonly getStopRemainingMs: () => number | null
}

export const STREAM_OPEN_DELAY_MS = STREAM_DEFAULT_VIDEO_INTERVAL_MS
export const STREAM_ROUND_DURATION_MS = STREAM_DEFAULT_ROUND_INTERVAL_MS
export const STREAM_MIN_OPEN_DELAY_MS = STREAM_MIN_VIDEO_INTERVAL_MS
export const STREAM_MAX_OPEN_DELAY_MS = STREAM_MAX_VIDEO_INTERVAL_MS
export const STREAM_MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1_000

const POPUP_FEATURES = 'popup=yes,width=960,height=720'

interface StreamRuntime {
  status: StreamPlaybackStatus
  round: number
  sessionId: string | null
  sessionStartedAt: number | null
  sessionRoundsCompleted: number
  sessionStopAt: number | null
  sessionStopAfterMs: number | null
  mode: StreamPlaybackMode | null
  sourceInput: string
  bvids: string[]
  openDelayMs: number
  roundDurationMs: number
  nextActionAt: number | null
  nextIndex: number
  handles: Window[]
  message: string
  errors: StreamInputError[]
}

function createRuntime(): StreamRuntime {
  return {
    status: 'idle',
    round: 0,
    sessionId: null,
    sessionStartedAt: null,
    sessionRoundsCompleted: 0,
    sessionStopAt: null,
    sessionStopAfterMs: null,
    mode: null,
    sourceInput: '',
    bvids: [],
    openDelayMs: STREAM_OPEN_DELAY_MS,
    roundDurationMs: STREAM_ROUND_DURATION_MS,
    nextActionAt: null,
    nextIndex: 0,
    handles: [],
    message: '尚未开始刷播',
    errors: [],
  }
}

function remainingUntil(deadline: number | null) {
  if (deadline === null) return null
  return Math.max(0, deadline - globalThis.performance.now())
}

function toState(runtime: StreamRuntime): StreamPlaybackState {
  return {
    status: runtime.status,
    round: runtime.round,
    sessionRoundsCompleted: runtime.sessionRoundsCompleted,
    openDelayMs: runtime.openDelayMs,
    roundDurationMs: runtime.roundDurationMs,
    stopAfterMs: runtime.sessionStopAfterMs,
    mode: runtime.mode,
    sourceInput: runtime.sourceInput,
    parsedBvids: [...runtime.bvids],
    openedCount: runtime.handles.length,
    message: runtime.message,
    errors: [...runtime.errors],
  }
}

function normalizeCounter(value: number) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
}

function normalizeRoundDuration(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < STREAM_MIN_ROUND_INTERVAL_MS ||
    value > STREAM_MAX_ROUND_INTERVAL_MS
  ) {
    return STREAM_ROUND_DURATION_MS
  }
  return value
}

function normalizeOpenDelay(value: number | undefined) {
  if (value === undefined) return STREAM_OPEN_DELAY_MS
  if (
    !Number.isSafeInteger(value) ||
    value < STREAM_MIN_OPEN_DELAY_MS ||
    value > STREAM_MAX_OPEN_DELAY_MS
  ) {
    throw new RangeError('刷播打开间隔必须在 1–60 秒之间')
  }
  return value
}

function normalizeStopAfter(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return null
  if (!Number.isFinite(value) || value < 0 || value > STREAM_MAX_SESSION_DURATION_MS) {
    throw new RangeError('刷播定时停止必须在 0 至 24 小时之间')
  }
  return value
}

let sessionSequence = 0

function createSessionId() {
  sessionSequence += 1
  return `stream-${Date.now().toString(36)}-${sessionSequence.toString(36)}`
}

/**
 * 只通过顶层窗口打开公开播放页。打开视频、结束轮次与定时停止共用一个一次性计时器；
 * 页面恢复时只处理当前已经到期的步骤，不追赶已经错过的多轮。
 */
export function useStreamPlayback({
  catalogBvids = [],
  completedRounds = 0,
  roundDurationMs = STREAM_ROUND_DURATION_MS,
  onRoundCompleted,
  onSessionEnded,
}: UseStreamPlaybackOptions = {}): StreamPlaybackController {
  const runtimeRef = useRef<StreamRuntime>(createRuntime())
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const timerGenerationRef = useRef(0)
  const roundCallbackRef = useRef(onRoundCompleted)
  const sessionCallbackRef = useRef(onSessionEnded)
  const completedRoundsRef = useRef(completedRounds)
  const catalogBvidsRef = useRef([...catalogBvids])
  const roundDurationRef = useRef(normalizeRoundDuration(roundDurationMs))
  const [state, setState] = useState<StreamPlaybackState>(() => toState(createRuntime()))
  const reconcileRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    roundCallbackRef.current = onRoundCompleted
  }, [onRoundCompleted])

  useEffect(() => {
    sessionCallbackRef.current = onSessionEnded
  }, [onSessionEnded])

  useEffect(() => {
    completedRoundsRef.current = normalizeCounter(completedRounds)
  }, [completedRounds])

  useEffect(() => {
    catalogBvidsRef.current = [...catalogBvids]
  }, [catalogBvids])

  useEffect(() => {
    roundDurationRef.current = normalizeRoundDuration(roundDurationMs)
  }, [roundDurationMs])

  const publish = useCallback(() => {
    setState(toState(runtimeRef.current))
  }, [])

  const clearTimer = useCallback(() => {
    timerGenerationRef.current += 1
    if (timerRef.current !== null) globalThis.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const closeHandles = useCallback(() => {
    const runtime = runtimeRef.current
    runtime.handles.forEach((handle) => handle.close())
    runtime.handles = []
  }, [])

  const scheduleAt = useCallback(
    (deadline: number) => {
      clearTimer()
      const timerGeneration = timerGenerationRef.current
      const delay = Math.max(0, deadline - globalThis.performance.now())
      timerRef.current = globalThis.setTimeout(() => {
        if (timerGeneration !== timerGenerationRef.current) return
        timerRef.current = null
        reconcileRef.current()
      }, delay)
    },
    [clearTimer],
  )

  const scheduleNextDeadline = useCallback(() => {
    const runtime = runtimeRef.current
    const deadlines = [runtime.nextActionAt, runtime.sessionStopAt].filter(
      (deadline): deadline is number => deadline !== null,
    )
    if (deadlines.length === 0) {
      clearTimer()
      return
    }
    scheduleAt(Math.min(...deadlines))
  }, [clearTimer, scheduleAt])

  const ensureNextDeadlineScheduled = useCallback(() => {
    if (timerRef.current !== null) return
    scheduleNextDeadline()
  }, [scheduleNextDeadline])

  const finishSession = useCallback(
    (outcome: StreamSessionEnd['outcome']) => {
      const runtime = runtimeRef.current
      const sessionId = runtime.sessionId
      const startedAt = runtime.sessionStartedAt
      const roundsCompleted = runtime.sessionRoundsCompleted

      clearTimer()
      closeHandles()
      runtime.status = outcome === 'completed' ? 'completed' : 'stopped'
      runtime.nextActionAt = null
      runtime.sessionStopAt = null
      runtime.nextIndex = 0
      runtime.message = outcome === 'completed' ? '刷播已按时完成' : '刷播已停止'
      runtime.errors = []
      runtime.sessionId = null
      runtime.sessionStartedAt = null
      publish()

      if (sessionId !== null && startedAt !== null) {
        sessionCallbackRef.current?.({
          sessionId,
          startedAt,
          endedAt: Date.now(),
          roundsCompleted,
          outcome,
        })
      }
    },
    [clearTimer, closeHandles, publish],
  )

  const enterBlocked = useCallback(() => {
    const runtime = runtimeRef.current
    clearTimer()
    closeHandles()
    runtime.status = 'blocked'
    runtime.nextActionAt = null
    runtime.message = '浏览器拦截了新窗口。请允许本站弹出窗口后，点击继续重试。'
    publish()
    if (runtime.sessionStopAt !== null) scheduleAt(runtime.sessionStopAt)
  }, [clearTimer, closeHandles, publish, scheduleAt])

  const openNext = useCallback(() => {
    const runtime = runtimeRef.current
    if (runtime.mode === null || runtime.nextIndex >= runtime.bvids.length) return

    const bvid = runtime.bvids[runtime.nextIndex]!
    const url = buildStreamVideoUrl(bvid)
    const handle =
      runtime.mode === 'popup'
        ? window.open(url, '_blank', POPUP_FEATURES)
        : window.open(url, '_blank')
    if (!handle) {
      enterBlocked()
      return
    }

    runtime.handles.push(handle)
    runtime.nextIndex += 1
    const openedAt = globalThis.performance.now()
    if (runtime.nextIndex === runtime.bvids.length) {
      runtime.status = 'waiting'
      runtime.nextActionAt = openedAt + runtime.roundDurationMs
      runtime.message = `第 ${runtime.round} 轮播放中`
    } else {
      runtime.status = 'opening'
      runtime.nextActionAt = openedAt + runtime.openDelayMs
      runtime.message = `第 ${runtime.round} 轮正在依次打开视频`
    }
    publish()
    scheduleNextDeadline()
  }, [enterBlocked, publish, scheduleNextDeadline])

  const beginRound = useCallback(
    (round: number, durationMs = roundDurationRef.current) => {
      const runtime = runtimeRef.current
      clearTimer()
      closeHandles()
      runtime.round = round
      runtime.roundDurationMs = durationMs
      runtime.nextIndex = 0
      runtime.nextActionAt = null
      runtime.status = 'opening'
      runtime.message = `第 ${round} 轮正在依次打开视频`
      publish()
      openNext()
    },
    [clearTimer, closeHandles, openNext, publish],
  )

  const reconcile = useCallback(() => {
    const runtime = runtimeRef.current
    const now = globalThis.performance.now()
    const stopDue = runtime.sessionStopAt !== null && now >= runtime.sessionStopAt

    // 定时停止与本轮完成同时到期时，先计入已经完整结束的这一轮。
    if (
      runtime.status === 'waiting' &&
      runtime.nextActionAt !== null &&
      now >= runtime.nextActionAt &&
      (runtime.sessionStopAt === null || runtime.nextActionAt <= runtime.sessionStopAt)
    ) {
      clearTimer()
      closeHandles()
      const completedRound = runtime.round
      const completedDeadline = runtime.nextActionAt
      const sessionId = runtime.sessionId
      const startedAt = runtime.sessionStartedAt
      runtime.sessionRoundsCompleted += 1
      if (sessionId !== null && startedAt !== null) {
        roundCallbackRef.current?.({ sessionId, startedAt, completedAt: Date.now() })
      }

      if (
        runtime.status !== 'waiting' ||
        runtime.round !== completedRound ||
        runtime.nextActionAt !== completedDeadline ||
        runtime.sessionId !== sessionId
      ) {
        return
      }

      if (stopDue) {
        finishSession('completed')
      } else {
        beginRound(completedRound + 1)
      }
      return
    }

    if (stopDue) {
      finishSession('completed')
      return
    }

    if (runtime.status === 'opening' && runtime.nextActionAt !== null) {
      if (now >= runtime.nextActionAt) {
        clearTimer()
        openNext()
      } else {
        ensureNextDeadlineScheduled()
      }
      return
    }

    if (runtime.status === 'waiting' && runtime.nextActionAt !== null) {
      ensureNextDeadlineScheduled()
      return
    }

    if (runtime.status === 'blocked' && runtime.sessionStopAt !== null) {
      ensureNextDeadlineScheduled()
    }
  }, [beginRound, clearTimer, closeHandles, ensureNextDeadlineScheduled, finishSession, openNext])

  useEffect(() => {
    reconcileRef.current = reconcile
  }, [reconcile])

  const stop = useCallback(() => {
    const runtime = runtimeRef.current
    if (runtime.sessionId === null) {
      clearTimer()
      closeHandles()
      runtime.status = 'stopped'
      runtime.nextActionAt = null
      runtime.nextIndex = 0
      runtime.message = '刷播已停止'
      runtime.errors = []
      publish()
      return
    }
    finishSession('stopped')
  }, [clearTimer, closeHandles, finishSession, publish])

  const start = useCallback(
    (input: string, mode: StreamPlaybackMode, settings: StreamStartSettings = {}) => {
      const result = parseStreamSelfTestInput(input)

      if (!result.ok) {
        clearTimer()
        closeHandles()
        runtimeRef.current = {
          ...createRuntime(),
          mode,
          sourceInput: input,
          message: '请检查输入内容',
          errors: [...result.errors],
        }
        publish()
        return result
      }

      const bvids = buildStreamQueue(result.bvid, catalogBvidsRef.current)
      if (bvids.length === 0) {
        const emptyResult = emptyStreamCatalogResult()
        clearTimer()
        closeHandles()
        runtimeRef.current = {
          ...createRuntime(),
          mode,
          sourceInput: input,
          message: '静态刷播收藏夹暂时为空',
          errors: [...emptyResult.errors],
        }
        publish()
        return emptyResult
      }

      const openDelayMs = normalizeOpenDelay(settings.openDelayMs)
      const stopAfterMs = normalizeStopAfter(settings.stopAfterMs)
      clearTimer()
      closeHandles()
      const runtime = runtimeRef.current
      const startedAt = Date.now()
      runtime.mode = mode
      runtime.sourceInput = input
      runtime.bvids = bvids
      runtime.openDelayMs = openDelayMs
      runtime.sessionId = createSessionId()
      runtime.sessionStartedAt = startedAt
      runtime.sessionRoundsCompleted = 0
      runtime.sessionStopAt =
        stopAfterMs === null ? null : globalThis.performance.now() + stopAfterMs
      runtime.sessionStopAfterMs = stopAfterMs
      runtime.errors = []
      beginRound(completedRoundsRef.current + 1)
      return result
    },
    [beginRound, clearTimer, closeHandles, publish],
  )

  const resume = useCallback(() => {
    const runtime = runtimeRef.current
    if (
      runtime.status !== 'blocked' ||
      runtime.mode === null ||
      runtime.bvids.length === 0 ||
      runtime.sessionId === null
    ) {
      return false
    }
    beginRound(runtime.round, runtime.roundDurationMs)
    return true
  }, [beginRound])

  const getRemainingMs = useCallback(() => remainingUntil(runtimeRef.current.nextActionAt), [])
  const getStopRemainingMs = useCallback(() => remainingUntil(runtimeRef.current.sessionStopAt), [])

  useEffect(() => {
    const handleResume = () => reconcileRef.current()
    const handleBeforeUnload = () => {
      clearTimer()
      closeHandles()
    }

    window.addEventListener('focus', handleResume)
    window.addEventListener('pageshow', handleResume)
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleResume)
    return () => {
      window.removeEventListener('focus', handleResume)
      window.removeEventListener('pageshow', handleResume)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleResume)
      clearTimer()
      closeHandles()
    }
  }, [clearTimer, closeHandles])

  return { state, start, resume, stop, getRemainingMs, getStopRemainingMs }
}

export { buildStreamQueue, buildStreamVideoUrl, parseStreamSelfTestInput }
export type { StreamInputError, StreamParseResult }
