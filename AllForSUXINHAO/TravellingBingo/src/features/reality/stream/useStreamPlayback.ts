import { useCallback, useEffect, useRef, useState } from 'react'

import { DEFAULT_STREAM_FAVORITE_ID, type StreamFavoriteId } from '@/domain'

import {
  STREAM_PLAYER_HISTORY_KEY,
  createStreamPlayerStopCommand,
  parseStoredStreamHistory,
  parseStreamPlayerEvent,
  storeStreamSession,
  type StoredStreamSession,
} from './popupProtocol'
import { parseStreamSelfTestInput, type StreamInputError, type StreamParseResult } from './parser'

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
  readonly favoriteId: StreamFavoriteId
  readonly stopAfterMs?: number | null
}

export interface StreamPlaybackState {
  readonly status: StreamPlaybackStatus
  readonly sessionId: string | null
  readonly startedAt: number | null
  readonly favoriteId: StreamFavoriteId
  readonly selfTestBvid: string | null
  readonly stopAfterMs: number | null
  readonly round: number
  readonly sessionRoundsCompleted: number
  readonly openedCount: number
  readonly totalCount: number
  readonly nextRoundAt: number | null
  readonly message: string
  readonly errors: readonly StreamInputError[]
}

export interface UseStreamPlaybackOptions {
  readonly onRoundCompleted?: (event: StreamRoundCompletion) => void
  readonly onSessionEnded?: (event: StreamSessionEnd) => void
}

export interface StreamPlaybackController {
  readonly state: StreamPlaybackState
  readonly standaloneHistory: readonly StoredStreamSession[]
  readonly start: (input: string, settings: StreamStartSettings) => StreamParseResult
  readonly stop: () => void
  readonly getRemainingMs: () => number | null
  readonly getStopRemainingMs: () => number | null
}

export const STREAM_MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1_000
export const STREAM_POPUP_FEATURES = 'popup=yes,width=430,height=760,resizable=yes,scrollbars=yes'
export const STREAM_POPUP_NAME = 'travelling-bingo-stream-player'

interface StreamRuntime {
  state: StreamPlaybackState
  handle: Window | null
}

function createState(): StreamPlaybackState {
  return {
    status: 'idle',
    sessionId: null,
    startedAt: null,
    favoriteId: DEFAULT_STREAM_FAVORITE_ID,
    selfTestBvid: null,
    stopAfterMs: null,
    round: 0,
    sessionRoundsCompleted: 0,
    openedCount: 0,
    totalCount: 0,
    nextRoundAt: null,
    message: '尚未开始刷播',
    errors: [],
  }
}

function normalizeStopAfter(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return null
  if (!Number.isFinite(value) || value < 0 || value > STREAM_MAX_SESSION_DURATION_MS) {
    throw new RangeError('刷播定时停止必须在 0 至 24 小时之间')
  }
  return value
}

function remainingUntil(deadline: number | null) {
  if (deadline === null) return null
  return Math.max(0, deadline - Date.now())
}

let sessionSequence = 0

function createSessionId() {
  sessionSequence += 1
  return `stream-${Date.now().toString(36)}-${sessionSequence.toString(36)}`
}

export interface BuildStreamPlayerUrlOptions {
  readonly baseUrl: string
  readonly favoriteId: StreamFavoriteId
  readonly selfTestBvid: string | null
  readonly stopAfterMs: number | null
  readonly sessionId: string
}

export function buildStreamPlayerUrl({
  baseUrl,
  favoriteId,
  selfTestBvid,
  stopAfterMs,
  sessionId,
}: BuildStreamPlayerUrlOptions) {
  const url = new URL('stream-player.html', baseUrl)
  url.searchParams.set('favoriteId', String(favoriteId))
  url.searchParams.set('sessionId', sessionId)
  url.searchParams.set('autostart', '1')
  if (selfTestBvid !== null) url.searchParams.set('selfTest', selfTestBvid)
  if (stopAfterMs !== null) url.searchParams.set('stopHours', String(stopAfterMs / 3_600_000))
  return url.toString()
}

/**
 * 主游戏只负责同步打开单一刷播页，并接收这个窗口回传的同源状态。
 * 收藏夹读取、视频调度和播放器生命周期全部由独立页负责。
 */
export function useStreamPlayback({
  onRoundCompleted,
  onSessionEnded,
}: UseStreamPlaybackOptions = {}): StreamPlaybackController {
  const runtimeRef = useRef<StreamRuntime>({ state: createState(), handle: null })
  const roundCallbackRef = useRef(onRoundCompleted)
  const sessionCallbackRef = useRef(onSessionEnded)
  const [state, setState] = useState<StreamPlaybackState>(() => createState())
  const [standaloneHistory, setStandaloneHistory] = useState<StoredStreamSession[]>(() =>
    parseStoredStreamHistory(globalThis.localStorage?.getItem(STREAM_PLAYER_HISTORY_KEY) ?? null),
  )

  useEffect(() => {
    roundCallbackRef.current = onRoundCompleted
  }, [onRoundCompleted])

  useEffect(() => {
    sessionCallbackRef.current = onSessionEnded
  }, [onSessionEnded])

  const publish = useCallback((nextState: StreamPlaybackState) => {
    runtimeRef.current.state = nextState
    setState(nextState)
  }, [])

  const refreshStandaloneHistory = useCallback(() => {
    setStandaloneHistory(
      parseStoredStreamHistory(globalThis.localStorage?.getItem(STREAM_PLAYER_HISTORY_KEY) ?? null),
    )
  }, [])

  const finishSession = useCallback(
    (endedAt: number, roundsCompleted: number, outcome: StreamSessionEnd['outcome']) => {
      const current = runtimeRef.current.state
      if (current.sessionId === null || current.startedAt === null) return

      const event: StreamSessionEnd = {
        sessionId: current.sessionId,
        startedAt: current.startedAt,
        endedAt,
        roundsCompleted,
        outcome,
      }
      storeStreamSession(event)
      runtimeRef.current.handle = null
      publish({
        ...current,
        status: outcome === 'completed' ? 'completed' : 'stopped',
        sessionId: null,
        startedAt: null,
        sessionRoundsCompleted: roundsCompleted,
        nextRoundAt: null,
        message: outcome === 'completed' ? '刷播已按时完成' : '刷播已停止',
      })
      sessionCallbackRef.current?.(event)
      refreshStandaloneHistory()
    },
    [publish, refreshStandaloneHistory],
  )

  const start = useCallback(
    (input: string, settings: StreamStartSettings): StreamParseResult => {
      const result = parseStreamSelfTestInput(input)
      if (!result.ok) {
        publish({
          ...createState(),
          favoriteId: settings.favoriteId,
          message: '请检查自测视频',
          errors: result.errors,
        })
        return result
      }

      const stopAfterMs = normalizeStopAfter(settings.stopAfterMs)
      const previousHandle = runtimeRef.current.handle
      if (previousHandle && !previousHandle.closed) previousHandle.close()

      const sessionId = createSessionId()
      const startedAt = Date.now()
      const url = buildStreamPlayerUrl({
        baseUrl: new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
        favoriteId: settings.favoriteId,
        selfTestBvid: result.bvid,
        stopAfterMs,
        sessionId,
      })
      const handle = window.open(url, STREAM_POPUP_NAME, STREAM_POPUP_FEATURES)
      if (!handle) {
        runtimeRef.current.handle = null
        publish({
          ...createState(),
          favoriteId: settings.favoriteId,
          selfTestBvid: result.bvid,
          stopAfterMs,
          status: 'blocked',
          message: '浏览器拦截了刷播页面，请允许本站弹出窗口后重新开始。',
        })
        return result
      }

      runtimeRef.current.handle = handle
      publish({
        ...createState(),
        status: 'opening',
        sessionId,
        startedAt,
        favoriteId: settings.favoriteId,
        selfTestBvid: result.bvid,
        stopAfterMs,
        message: '刷播页面正在准备视频',
      })
      return result
    },
    [publish],
  )

  const stop = useCallback(() => {
    const current = runtimeRef.current.state
    const handle = runtimeRef.current.handle
    if (handle && !handle.closed && current.sessionId !== null) {
      handle.postMessage(createStreamPlayerStopCommand(current.sessionId), window.location.origin)
      handle.close()
    }
    if (current.sessionId !== null && current.startedAt !== null) {
      finishSession(Date.now(), current.sessionRoundsCompleted, 'stopped')
      return
    }
    runtimeRef.current.handle = null
    publish({ ...current, status: 'stopped', nextRoundAt: null, message: '刷播已停止' })
  }, [finishSession, publish])

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const handle = runtimeRef.current.handle
      const current = runtimeRef.current.state
      if (event.origin !== window.location.origin || event.source !== handle || handle === null)
        return

      const message = parseStreamPlayerEvent(event.data)
      if (message === null || message.sessionId !== current.sessionId) return

      if (message.event === 'started') {
        publish({
          ...current,
          status: 'opening',
          startedAt: message.startedAt,
          message: '刷播页面已开始准备视频',
        })
        return
      }

      if (message.event === 'status') {
        if (message.round < current.round || message.round > current.round + 1) return
        publish({
          ...current,
          status: message.status,
          round: message.round,
          openedCount: message.openedCount,
          totalCount: message.totalCount,
          nextRoundAt: message.nextRoundAt,
          message: message.message,
        })
        return
      }

      if (message.event === 'round-completed') {
        if (
          message.round !== current.sessionRoundsCompleted + 1 ||
          message.round !== current.round
        ) {
          return
        }
        publish({
          ...current,
          round: message.round + 1,
          sessionRoundsCompleted: message.round,
          nextRoundAt: null,
          message: `已完成 ${message.round} 轮`,
        })
        if (current.sessionId !== null && current.startedAt !== null) {
          roundCallbackRef.current?.({
            sessionId: current.sessionId,
            startedAt: current.startedAt,
            completedAt: message.completedAt,
          })
        }
        return
      }

      if (message.roundsCompleted !== current.sessionRoundsCompleted) return
      finishSession(message.endedAt, message.roundsCompleted, message.outcome)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STREAM_PLAYER_HISTORY_KEY) refreshStandaloneHistory()
    }
    const handlePageResume = () => refreshStandaloneHistory()

    window.addEventListener('message', handleMessage)
    window.addEventListener('storage', handleStorage)
    window.addEventListener('pageshow', handlePageResume)
    window.addEventListener('focus', handlePageResume)
    return () => {
      window.removeEventListener('message', handleMessage)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('pageshow', handlePageResume)
      window.removeEventListener('focus', handlePageResume)
    }
  }, [finishSession, publish, refreshStandaloneHistory])

  const getRemainingMs = useCallback(() => remainingUntil(runtimeRef.current.state.nextRoundAt), [])
  const getStopRemainingMs = useCallback(() => {
    const current = runtimeRef.current.state
    if (current.startedAt === null || current.stopAfterMs === null) return null
    return remainingUntil(current.startedAt + current.stopAfterMs)
  }, [])

  return { state, standaloneHistory, start, stop, getRemainingMs, getStopRemainingMs }
}

export { parseStreamSelfTestInput }
export type { StoredStreamSession, StreamInputError, StreamParseResult }
