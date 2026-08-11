import { useCallback, useEffect, useRef, useState } from 'react'

import type { StreamFavoriteId } from '@/domain'

import { createStreamPlayerStopCommand, parseStreamPlayerEvent } from './popupProtocol'
import { parseStreamSelfTestInput, type StreamInputError, type StreamParseResult } from './parser'

export type StreamPlaybackStatus =
  'idle' | 'opening' | 'waiting' | 'blocked' | 'stopped' | 'completed'

export interface StreamStartSettings {
  readonly favoriteId: StreamFavoriteId
  readonly stopAfterMs?: number | null
}

export interface StreamPlaybackState {
  readonly status: StreamPlaybackStatus
  readonly stopAfterMs: number | null
  readonly message: string
  readonly errors: readonly StreamInputError[]
}

export interface StreamPlaybackController {
  readonly state: StreamPlaybackState
  readonly start: (input: string, settings: StreamStartSettings) => StreamParseResult
  readonly stop: () => void
}

export interface UseStreamPlaybackOptions {
  readonly onStarted?: (dateKey: string) => void
}

export const STREAM_MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1_000
export const STREAM_POPUP_FEATURES = 'popup=yes,width=430,height=760,resizable=yes,scrollbars=yes'
export const STREAM_POPUP_NAME = 'travelling-bingo-stream-player'

interface StreamRuntime {
  state: StreamPlaybackState
  handle: Window | null
  channelSessionId: string | null
  closeOnEnded: boolean
  startedNotified: boolean
}

function createState(): StreamPlaybackState {
  return {
    status: 'idle',
    stopAfterMs: null,
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
  onStarted,
}: UseStreamPlaybackOptions = {}): StreamPlaybackController {
  const onStartedRef = useRef(onStarted)
  const runtimeRef = useRef<StreamRuntime>({
    state: createState(),
    handle: null,
    channelSessionId: null,
    closeOnEnded: false,
    startedNotified: false,
  })
  const [state, setState] = useState<StreamPlaybackState>(() => createState())

  useEffect(() => {
    onStartedRef.current = onStarted
  }, [onStarted])

  const publish = useCallback((nextState: StreamPlaybackState) => {
    runtimeRef.current.state = nextState
    setState(nextState)
  }, [])

  const start = useCallback(
    (input: string, settings: StreamStartSettings): StreamParseResult => {
      const result = parseStreamSelfTestInput(input)
      if (!result.ok) {
        publish({
          ...createState(),
          message: '请检查自测视频',
          errors: result.errors,
        })
        return result
      }

      const stopAfterMs = normalizeStopAfter(settings.stopAfterMs)
      const previousHandle = runtimeRef.current.handle
      if (previousHandle && !previousHandle.closed) previousHandle.close()

      const sessionId = createSessionId()
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
        runtimeRef.current.channelSessionId = null
        runtimeRef.current.closeOnEnded = false
        runtimeRef.current.startedNotified = false
        publish({
          ...createState(),
          stopAfterMs,
          status: 'blocked',
          message: '浏览器拦截了刷播页面，请允许本站弹出窗口后重新开始。',
        })
        return result
      }

      runtimeRef.current.handle = handle
      runtimeRef.current.channelSessionId = sessionId
      runtimeRef.current.closeOnEnded = false
      runtimeRef.current.startedNotified = false
      publish({
        ...createState(),
        status: 'opening',
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
    const channelSessionId = runtimeRef.current.channelSessionId
    if (handle && !handle.closed && channelSessionId !== null) {
      runtimeRef.current.closeOnEnded = true
      handle.postMessage(createStreamPlayerStopCommand(channelSessionId), window.location.origin)
      publish({ ...current, message: '正在停止刷播' })
      return
    }
    runtimeRef.current.handle = null
    runtimeRef.current.channelSessionId = null
    runtimeRef.current.closeOnEnded = false
    runtimeRef.current.startedNotified = false
    publish({ ...current, status: 'stopped', message: '刷播已停止' })
  }, [publish])

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const handle = runtimeRef.current.handle
      const current = runtimeRef.current.state
      if (event.origin !== window.location.origin || event.source !== handle || handle === null)
        return

      const message = parseStreamPlayerEvent(event.data)
      if (message === null || message.sessionId !== runtimeRef.current.channelSessionId) return

      if (message.event === 'started') {
        if (!runtimeRef.current.startedNotified) {
          runtimeRef.current.startedNotified = true
          onStartedRef.current?.(message.dateKey)
        }
        publish({
          ...current,
          status: 'waiting',
          message: '刷播窗口正在运行',
        })
        return
      }

      const closeWindow = runtimeRef.current.closeOnEnded
      if (closeWindow && !handle.closed) handle.close()
      if (closeWindow || handle.closed) {
        runtimeRef.current.handle = null
        runtimeRef.current.channelSessionId = null
      }
      runtimeRef.current.closeOnEnded = false
      runtimeRef.current.startedNotified = false
      publish({
        ...current,
        status: message.outcome === 'completed' ? 'completed' : 'stopped',
        message: message.outcome === 'completed' ? '刷播已按时完成' : '刷播已停止',
      })
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [publish])

  return { state, start, stop }
}

export { parseStreamSelfTestInput }
export type { StreamInputError, StreamParseResult }
