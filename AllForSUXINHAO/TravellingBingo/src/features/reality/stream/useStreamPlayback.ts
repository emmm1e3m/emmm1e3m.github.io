import { useCallback, useEffect, useRef, useState } from 'react'

import {
  buildStreamVideoUrl,
  parseStreamInput,
  type StreamInputError,
  type StreamParseResult,
} from './parser'

export type StreamPlaybackMode = 'popup' | 'tabs'
export type StreamPlaybackStatus = 'idle' | 'opening' | 'waiting' | 'blocked' | 'stopped'

export interface StreamRoundCompletion {
  readonly completedAt: number
}

export interface StreamPlaybackState {
  readonly status: StreamPlaybackStatus
  readonly round: number
  readonly mode: StreamPlaybackMode | null
  readonly sourceInput: string
  readonly parsedBvids: readonly string[]
  readonly openedCount: number
  readonly message: string
  readonly errors: readonly StreamInputError[]
}

export interface UseStreamPlaybackOptions {
  readonly completedRounds?: number
  readonly roundDurationMs?: number
  readonly onRoundCompleted?: (event: StreamRoundCompletion) => void
}

export interface StreamPlaybackController {
  readonly state: StreamPlaybackState
  readonly start: (input: string, mode: StreamPlaybackMode) => StreamParseResult
  readonly resume: () => boolean
  readonly stop: () => void
  readonly getRemainingMs: () => number | null
}

export const STREAM_TAB_OPEN_DELAY_MS = 8_000
export const STREAM_ROUND_DURATION_MS = 310_000

const POPUP_FEATURES = 'popup=yes,width=960,height=720'

interface StreamRuntime {
  status: StreamPlaybackStatus
  round: number
  mode: StreamPlaybackMode | null
  sourceInput: string
  bvids: string[]
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
    mode: null,
    sourceInput: '',
    bvids: [],
    roundDurationMs: STREAM_ROUND_DURATION_MS,
    nextActionAt: null,
    nextIndex: 0,
    handles: [],
    message: '尚未开始刷播',
    errors: [],
  }
}

function remainingUntilNextAction(runtime: StreamRuntime) {
  if (runtime.nextActionAt === null) return null
  return Math.max(0, runtime.nextActionAt - globalThis.performance.now())
}

function toState(runtime: StreamRuntime): StreamPlaybackState {
  return {
    status: runtime.status,
    round: runtime.round,
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
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 3_600_000) {
    return STREAM_ROUND_DURATION_MS
  }
  return value
}

/**
 * 只通过顶层窗口打开公开播放页。计时以绝对截止时刻为准，页面恢复时最多推进一步，
 * 不会为了补偿后台冻结而连续创建多轮窗口。
 */
export function useStreamPlayback({
  completedRounds = 0,
  roundDurationMs = STREAM_ROUND_DURATION_MS,
  onRoundCompleted,
}: UseStreamPlaybackOptions = {}): StreamPlaybackController {
  const runtimeRef = useRef<StreamRuntime>(createRuntime())
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const timerGenerationRef = useRef(0)
  const callbackRef = useRef(onRoundCompleted)
  const completedRoundsRef = useRef(completedRounds)
  const roundDurationRef = useRef(normalizeRoundDuration(roundDurationMs))
  const [state, setState] = useState<StreamPlaybackState>(() => toState(createRuntime()))
  const reconcileRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    callbackRef.current = onRoundCompleted
  }, [onRoundCompleted])

  useEffect(() => {
    completedRoundsRef.current = normalizeCounter(completedRounds)
  }, [completedRounds])

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

  const ensureScheduledAt = useCallback(
    (deadline: number) => {
      if (timerRef.current !== null) return
      scheduleAt(deadline)
    },
    [scheduleAt],
  )

  const enterBlocked = useCallback(() => {
    const runtime = runtimeRef.current
    clearTimer()
    closeHandles()
    runtime.status = 'blocked'
    runtime.nextActionAt = null
    runtime.message = '浏览器拦截了新窗口。请允许本站弹出窗口后，点击继续重试。'
    publish()
  }, [clearTimer, closeHandles, publish])

  const openNextTab = useCallback(() => {
    const runtime = runtimeRef.current
    if (runtime.mode !== 'tabs' || runtime.nextIndex >= runtime.bvids.length) return

    const bvid = runtime.bvids[runtime.nextIndex]!
    const handle = window.open(buildStreamVideoUrl(bvid), '_blank')
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
      publish()
      scheduleAt(runtime.nextActionAt)
      return
    }

    runtime.status = 'opening'
    runtime.nextActionAt = openedAt + STREAM_TAB_OPEN_DELAY_MS
    runtime.message = `第 ${runtime.round} 轮正在打开视频`
    publish()
    scheduleAt(runtime.nextActionAt)
  }, [enterBlocked, publish, scheduleAt])

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
      runtime.message = `第 ${round} 轮正在打开视频`
      publish()

      if (runtime.mode === 'tabs') {
        openNextTab()
        return
      }

      for (const bvid of runtime.bvids) {
        const handle = window.open(buildStreamVideoUrl(bvid), '_blank', POPUP_FEATURES)
        if (!handle) {
          enterBlocked()
          return
        }
        runtime.handles.push(handle)
        runtime.nextIndex += 1
      }

      const lastOpenedAt = globalThis.performance.now()
      runtime.status = 'waiting'
      runtime.nextActionAt = lastOpenedAt + runtime.roundDurationMs
      runtime.message = `第 ${round} 轮播放中`
      publish()
      scheduleAt(runtime.nextActionAt)
    },
    [clearTimer, closeHandles, enterBlocked, openNextTab, publish, scheduleAt],
  )

  const reconcile = useCallback(() => {
    const runtime = runtimeRef.current
    const now = globalThis.performance.now()

    if (runtime.status === 'opening' && runtime.nextActionAt !== null) {
      if (now >= runtime.nextActionAt) {
        clearTimer()
        openNextTab()
      } else {
        ensureScheduledAt(runtime.nextActionAt)
      }
      return
    }

    if (runtime.status === 'waiting' && runtime.nextActionAt !== null) {
      if (now < runtime.nextActionAt) {
        ensureScheduledAt(runtime.nextActionAt)
        return
      }

      clearTimer()
      closeHandles()
      const completedRound = runtime.round
      const completedDeadline = runtime.nextActionAt
      callbackRef.current?.({ completedAt: Date.now() })
      if (
        runtime.status === 'waiting' &&
        runtime.round === completedRound &&
        runtime.nextActionAt === completedDeadline
      ) {
        beginRound(completedRound + 1)
      }
    }
  }, [beginRound, clearTimer, closeHandles, ensureScheduledAt, openNextTab])

  useEffect(() => {
    reconcileRef.current = reconcile
  }, [reconcile])

  const stop = useCallback(() => {
    const runtime = runtimeRef.current
    clearTimer()
    closeHandles()
    runtime.status = 'stopped'
    runtime.nextActionAt = null
    runtime.nextIndex = 0
    runtime.message = '刷播已停止'
    runtime.errors = []
    publish()
  }, [clearTimer, closeHandles, publish])

  const start = useCallback(
    (input: string, mode: StreamPlaybackMode) => {
      const result = parseStreamInput(input)
      clearTimer()
      closeHandles()

      if (!result.ok) {
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

      const runtime = runtimeRef.current
      runtime.mode = mode
      runtime.sourceInput = input
      runtime.bvids = [...result.bvids]
      runtime.errors = []
      beginRound(completedRoundsRef.current + 1)
      return result
    },
    [beginRound, clearTimer, closeHandles, publish],
  )

  const resume = useCallback(() => {
    const runtime = runtimeRef.current
    if (runtime.status !== 'blocked' || runtime.mode === null || runtime.bvids.length === 0) {
      return false
    }
    beginRound(runtime.round, runtime.roundDurationMs)
    return true
  }, [beginRound])

  const getRemainingMs = useCallback(() => remainingUntilNextAction(runtimeRef.current), [])

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

  return { state, start, resume, stop, getRemainingMs }
}

export { buildStreamVideoUrl, parseStreamInput }
export type { StreamInputError, StreamParseResult }
