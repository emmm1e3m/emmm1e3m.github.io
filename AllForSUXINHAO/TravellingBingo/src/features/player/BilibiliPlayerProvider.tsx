import { type PropsWithChildren, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { createPortal } from 'react-dom'

import type { GameAction, MusicPlayerState } from '@/domain/game/types'

import {
  adjacentTrackIndex,
  buildBilibiliPlayerUrl,
  displayTitleForTrack,
  endedTrackIndex,
} from './playerModel'
import {
  createInitialBilibiliPlayerRuntimeState,
  reduceBilibiliPlayerRuntimeState,
  type BilibiliPlayerRequest,
  type RequestBilibiliTrackOptions,
} from './playerController'
import { BilibiliPlayerContext, useBilibiliPlayerController } from './playerContext'
import type { BilibiliPlaybackMode, BilibiliPlayerTrack } from './playerModel'

import './player.css'

type MusicPlayerAction = Extract<GameAction, { type: `music/${string}` }>

export interface BilibiliPlayerProviderProps extends PropsWithChildren {
  state: MusicPlayerState
  onAction: (action: MusicPlayerAction) => void
  tracks: readonly BilibiliPlayerTrack[]
  random?: () => number
  onPlayerRequested?: (request: BilibiliPlayerRequest) => void
}

interface PersistentPlayerDockProps {
  compact?: boolean
  className?: string
  interactionDisabled?: boolean
  onExpandRequest?: () => void
}

interface PlaybackTimeline {
  requestId: number | null
  durationMs: number
  playedMs: number
  runningSince: number | null
  loadedRevision: number | null
}

function initialTimeline(): PlaybackTimeline {
  return {
    requestId: null,
    durationMs: 0,
    playedMs: 0,
    runningSince: null,
    loadedRevision: null,
  }
}

/**
 * 唯一 iframe 宿主固定挂到 body。暂停会卸载 iframe 并冻结已播毫秒；
 * 继续时从同一进度换算出的 t 参数重建，结束计时也使用同一份进度。
 */
export function PersistentPlayerDock({
  compact = false,
  className = '',
  interactionDisabled = false,
  onExpandRequest,
}: PersistentPlayerDockProps) {
  const controller = useBilibiliPlayerController()
  const controllerRef = useRef(controller)
  const endTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const timelineRef = useRef<PlaybackTimeline>(initialTimeline())

  useEffect(() => {
    controllerRef.current = controller
  }, [controller])

  const request = controller.state.activeRequest
  const playing = controller.state.playing
  const playbackRevision = controller.state.playbackRevision
  const resumeAtSeconds = controller.state.resumeAtSeconds
  const displayExpanded = controller.state.dockExpanded && !compact

  const clearEndTimer = useCallback(() => {
    if (endTimerRef.current === null) return
    globalThis.clearTimeout(endTimerRef.current)
    endTimerRef.current = null
  }, [])

  const ensureTimeline = useCallback((activeRequest: BilibiliPlayerRequest) => {
    const durationMs = activeRequest.track.durationSeconds * 1000
    if (timelineRef.current.requestId !== activeRequest.requestId) {
      timelineRef.current = {
        requestId: activeRequest.requestId,
        durationMs,
        playedMs: 0,
        runningSince: null,
        loadedRevision: null,
      }
    }
    return timelineRef.current
  }, [])

  const freezeTimeline = useCallback(() => {
    clearEndTimer()
    const timeline = timelineRef.current
    if (timeline.runningSince === null) return timeline.playedMs
    const elapsedMs = Math.max(0, Date.now() - timeline.runningSince)
    timeline.playedMs = Math.min(timeline.durationMs, timeline.playedMs + elapsedMs)
    timeline.runningSince = null
    return timeline.playedMs
  }, [clearEndTimer])

  useEffect(() => {
    clearEndTimer()
    timelineRef.current = initialTimeline()
    if (request) ensureTimeline(request)
    return clearEndTimer
  }, [clearEndTimer, ensureTimeline, request])

  useEffect(() => {
    if (!playing) freezeTimeline()
  }, [freezeTimeline, playing])

  if (!request) return null

  const playerUrl = buildBilibiliPlayerUrl({
    bvid: request.track.bvid,
    startAtSeconds: resumeAtSeconds,
  })
  const playbackKey = `${request.requestId}-${playbackRevision}`

  const startEndTimer = () => {
    const current = controllerRef.current.state
    if (
      current.activeRequest?.requestId !== request.requestId ||
      !current.playing ||
      current.playbackRevision !== playbackRevision
    ) {
      return
    }

    const activeTimeline = ensureTimeline(request)
    if (activeTimeline.loadedRevision === playbackRevision) return
    activeTimeline.loadedRevision = playbackRevision
    // iframe 的 t 只使用整秒；结束计时同步回同一个整秒起点，避免两条进度漂移。
    // 用户在跨域 iframe 内暂停或拖动时，父页无法同步读取真实进度；这份计时只跟随游戏控件。
    activeTimeline.playedMs = resumeAtSeconds * 1000
    const remainingMs = Math.max(0, activeTimeline.durationMs - activeTimeline.playedMs)
    if (remainingMs === 0) {
      controllerRef.current.ended()
      return
    }

    activeTimeline.runningSince = Date.now()
    endTimerRef.current = globalThis.setTimeout(() => {
      endTimerRef.current = null
      const latest = controllerRef.current.state
      if (
        latest.activeRequest?.requestId !== request.requestId ||
        !latest.playing ||
        latest.playbackRevision !== playbackRevision
      ) {
        return
      }
      activeTimeline.playedMs = activeTimeline.durationMs
      activeTimeline.runningSince = null
      controllerRef.current.ended()
    }, remainingMs)
  }

  return createPortal(
    <aside
      className={`persistent-bilibili-player ${displayExpanded ? 'is-expanded' : 'is-collapsed'} ${className}`.trim()}
      aria-label="持久播放器"
      aria-hidden={interactionDisabled ? true : undefined}
      data-testid="persistent-bilibili-player"
      data-dock-state={displayExpanded ? 'expanded' : 'collapsed'}
      data-interaction-state={interactionDisabled ? 'disabled' : 'enabled'}
      data-playback-state={playing ? 'playing' : 'paused'}
      data-modal-focus-peer="persistent-player"
    >
      <div className="persistent-bilibili-player__bar">
        <p title={request.track.title} aria-label={request.track.title}>
          <strong>{displayTitleForTrack(request.track)}</strong>
        </p>
        <button
          type="button"
          aria-label={displayExpanded ? '隐藏画面' : '显示画面'}
          disabled={interactionDisabled}
          onClick={() => {
            if (displayExpanded) {
              controller.hideDock()
            } else {
              onExpandRequest?.()
              controller.showDock()
            }
          }}
        >
          <span aria-hidden="true">{displayExpanded ? '⏬' : '⏫'}</span>
        </button>
        <button
          type="button"
          aria-label={playing ? '暂停播放' : '继续播放'}
          disabled={interactionDisabled}
          onClick={() => {
            if (playing) {
              const frozenAtSeconds = Math.floor(freezeTimeline() / 1000)
              timelineRef.current.playedMs = frozenAtSeconds * 1000
              controller.pause(frozenAtSeconds)
            } else {
              controller.resume()
            }
          }}
        >
          <span aria-hidden="true">{playing ? '⏸️' : '▶️'}</span>
        </button>
        <button
          type="button"
          aria-label="取消播放"
          disabled={interactionDisabled}
          onClick={() => {
            clearEndTimer()
            controller.stop()
          }}
        >
          <span aria-hidden="true">❌</span>
        </button>
      </div>
      <div
        className="persistent-bilibili-player__frame"
        aria-hidden={displayExpanded && !interactionDisabled ? undefined : true}
        inert={displayExpanded && !interactionDisabled ? undefined : true}
        data-interaction-state={displayExpanded && !interactionDisabled ? 'enabled' : 'disabled'}
      >
        {playing && (
          <iframe
            key={playbackKey}
            src={playerUrl}
            title={`Bilibili 外链播放器：${request.track.title}`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            tabIndex={interactionDisabled ? -1 : undefined}
            data-request-id={request.requestId}
            data-playback-revision={playbackRevision}
            onLoad={startEndTimer}
          />
        )}
      </div>
    </aside>,
    document.body,
  )
}

/** Provider 只管理唯一全站第一曲库的 GameState 投影与易失播放运行态。 */
export function BilibiliPlayerProvider({
  children,
  state: controlledState,
  onAction,
  tracks,
  random = Math.random,
  onPlayerRequested,
}: BilibiliPlayerProviderProps) {
  const [runtime, dispatch] = useReducer(
    reduceBilibiliPlayerRuntimeState,
    undefined,
    createInitialBilibiliPlayerRuntimeState,
  )
  const requestSequenceRef = useRef(0)

  const selectedBvid = runtime.activeRequest?.track.bvid ?? controlledState.currentBvid
  const state = useMemo(
    () => ({
      tracks,
      selectedBvid,
      mode: controlledState.loopMode,
      activeRequest: runtime.activeRequest,
      dockExpanded: runtime.dockExpanded,
      playing: runtime.playing,
      resumeAtSeconds: runtime.resumeAtSeconds,
      playbackRevision: runtime.playbackRevision,
    }),
    [controlledState.loopMode, runtime, selectedBvid, tracks],
  )

  const requestTrack = useCallback(
    (track: BilibiliPlayerTrack, options: RequestBilibiliTrackOptions = {}) => {
      const request: BilibiliPlayerRequest = {
        requestId: (requestSequenceRef.current += 1),
        track,
        origin: options.origin ?? { kind: 'direct' },
      }
      dispatch({
        type: 'track/request',
        request,
        expandDock: options.expandDock ?? true,
      })
      onPlayerRequested?.(request)
      return request
    },
    [onPlayerRequested],
  )

  const setMode = useCallback(
    (mode: BilibiliPlaybackMode) => onAction({ type: 'music/loop-set', loopMode: mode }),
    [onAction],
  )

  const selectTrack = useCallback(
    (bvid: string, options?: RequestBilibiliTrackOptions) => {
      const index = tracks.findIndex((candidate) => candidate.bvid === bvid)
      const track = index >= 0 ? tracks[index] : undefined
      if (!track) return null
      onAction({ type: 'music/track-select', bvid, index })
      return requestTrack(track, options ?? { origin: { kind: 'record-player' } })
    },
    [onAction, requestTrack, tracks],
  )

  const currentIndex = useCallback(() => {
    if (!state.selectedBvid) return null
    const persistedIndex = controlledState.currentIndex
    if (
      persistedIndex >= 0 &&
      persistedIndex < tracks.length &&
      tracks[persistedIndex]?.bvid === state.selectedBvid
    ) {
      return persistedIndex
    }
    const resolved = tracks.findIndex((track) => track.bvid === state.selectedBvid)
    return resolved >= 0 ? resolved : null
  }, [controlledState.currentIndex, state.selectedBvid, tracks])

  const requestIndex = useCallback(
    (index: number | null) => {
      const track = index === null ? undefined : tracks[index]
      if (!track) return null
      return selectTrack(track.bvid, { origin: { kind: 'record-player' } })
    },
    [selectTrack, tracks],
  )

  const move = useCallback(
    (direction: 1 | -1) =>
      requestIndex(
        adjacentTrackIndex(
          state.mode,
          currentIndex(),
          tracks.length,
          direction,
          state.mode === 'shuffle' ? random() : 0,
        ),
      ),
    [currentIndex, random, requestIndex, state.mode, tracks.length],
  )

  const previous = useCallback(() => move(-1), [move])
  const next = useCallback(() => move(1), [move])
  const ended = useCallback(() => {
    const index = currentIndex()
    const activeRequest = state.activeRequest
    if (state.mode === 'single' && index === null && activeRequest) {
      return requestTrack(activeRequest.track, { origin: activeRequest.origin })
    }
    return requestIndex(
      endedTrackIndex(state.mode, index, tracks.length, state.mode === 'shuffle' ? random() : 0),
    )
  }, [
    currentIndex,
    random,
    requestIndex,
    requestTrack,
    state.activeRequest,
    state.mode,
    tracks.length,
  ])

  const pause = useCallback(
    (resumeAtSeconds: number) => dispatch({ type: 'playback/pause', resumeAtSeconds }),
    [],
  )
  const resume = useCallback(() => dispatch({ type: 'playback/resume' }), [])
  const showDock = useCallback(() => dispatch({ type: 'dock/set', expanded: true }), [])
  const hideDock = useCallback(() => dispatch({ type: 'dock/set', expanded: false }), [])
  const stop = useCallback(() => dispatch({ type: 'player/stop' }), [])

  const controller = useMemo(
    () => ({
      state,
      setMode,
      requestTrack,
      selectTrack,
      previous,
      next,
      ended,
      pause,
      resume,
      showDock,
      hideDock,
      stop,
    }),
    [
      ended,
      hideDock,
      next,
      pause,
      previous,
      requestTrack,
      resume,
      selectTrack,
      setMode,
      showDock,
      state,
      stop,
    ],
  )

  return <BilibiliPlayerContext value={controller}>{children}</BilibiliPlayerContext>
}
