import { type PropsWithChildren, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { createPortal } from 'react-dom'

import type { GameAction, MusicPlayerState } from '@/domain/game/types'

import {
  adjacentTrackIndex,
  buildBilibiliPlayerUrl,
  canonicalBilibiliVideoUrl,
  createNamedBilibiliPlaylist,
  endedTrackIndex,
  type BilibiliPlaybackMode,
  type BilibiliPlayerTrack,
  type NamedBilibiliPlaylist,
} from './playerModel'
import {
  createInitialBilibiliPlayerRuntimeState,
  reduceBilibiliPlayerRuntimeState,
  type BilibiliPlayerRequest,
  type RequestBilibiliTrackOptions,
} from './playerController'
import { BilibiliPlayerContext, useBilibiliPlayerController } from './playerContext'

import './player.css'

type MusicPlayerAction = Extract<GameAction, { type: `music/${string}` }>

export interface BilibiliPlayerProviderProps extends PropsWithChildren {
  state: MusicPlayerState
  onAction: (action: MusicPlayerAction) => void
  builtInTracks?: readonly BilibiliPlayerTrack[]
  builtInPlaylistName?: string
  resolveTrack?: (bvid: string) => BilibiliPlayerTrack | undefined
  random?: () => number
  now?: () => number
  onPlayerRequested?: (request: BilibiliPlayerRequest) => void
}

export interface PersistentPlayerDockProps {
  compact?: boolean
  className?: string
  onExpandRequest?: () => void
}

function trackFallback(bvid: string): BilibiliPlayerTrack {
  return { bvid, title: bvid, sourceUrl: canonicalBilibiliVideoUrl(bvid) }
}

/**
 * 唯一的 iframe 播放宿主固定挂到 body，页面分支切换时不会重建视频。
 * 外链播放器没有受支持的结束事件，静态时长计时仅用于最佳努力续播。
 */
export function PersistentPlayerDock({
  compact = false,
  className = '',
  onExpandRequest,
}: PersistentPlayerDockProps) {
  const controller = useBilibiliPlayerController()
  const controllerRef = useRef(controller)
  const endTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)

  useEffect(() => {
    controllerRef.current = controller
  }, [controller])

  const request = controller.state.activeRequest
  const displayExpanded = controller.state.dockExpanded && !compact

  const clearEndTimer = useCallback(() => {
    if (endTimerRef.current === null) return
    globalThis.clearTimeout(endTimerRef.current)
    endTimerRef.current = null
  }, [])

  useEffect(() => clearEndTimer, [clearEndTimer, request?.requestId])

  if (!request) return null

  const playerUrl = buildBilibiliPlayerUrl({ bvid: request.track.bvid })

  const startBestEffortEndTimer = () => {
    clearEndTimer()
    const durationSeconds = request.track.durationSeconds
    if (
      typeof durationSeconds !== 'number' ||
      !Number.isSafeInteger(durationSeconds) ||
      durationSeconds <= 0
    ) {
      return
    }

    const requestId = request.requestId
    endTimerRef.current = globalThis.setTimeout(() => {
      endTimerRef.current = null
      if (controllerRef.current.state.activeRequest?.requestId !== requestId) return
      controllerRef.current.ended()
    }, durationSeconds * 1000)
  }

  return createPortal(
    <aside
      className={`persistent-bilibili-player ${displayExpanded ? 'is-expanded' : 'is-collapsed'} ${className}`.trim()}
      aria-label="持久播放器"
      data-testid="persistent-bilibili-player"
      data-dock-state={displayExpanded ? 'expanded' : 'collapsed'}
      data-modal-focus-peer="persistent-player"
    >
      <div className="persistent-bilibili-player__bar">
        <p>
          <strong>{request.track.title}</strong>
        </p>
        {displayExpanded ? (
          <button type="button" onClick={controller.hideDock}>
            隐藏画面
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onExpandRequest?.()
              controller.showDock()
            }}
          >
            显示画面
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            clearEndTimer()
            controller.stop()
          }}
        >
          停止播放
        </button>
      </div>
      <div
        className="persistent-bilibili-player__frame"
        aria-hidden={displayExpanded ? undefined : true}
      >
        <iframe
          key={request.requestId}
          src={playerUrl}
          title={`Bilibili 外链播放器：${request.track.title}`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          tabIndex={displayExpanded ? 0 : -1}
          data-request-id={request.requestId}
          onLoad={startBestEffortEndTimer}
        />
      </div>
    </aside>,
    document.body,
  )
}

/**
 * Provider 只管理 GameState 投影与唯一播放器运行态；调用方仅挂载一次 Dock。
 */
export function BilibiliPlayerProvider({
  children,
  state: controlledState,
  onAction,
  builtInTracks = [],
  builtInPlaylistName = '全站第一',
  resolveTrack,
  random = Math.random,
  now = Date.now,
  onPlayerRequested,
}: BilibiliPlayerProviderProps) {
  const [runtime, dispatch] = useReducer(
    reduceBilibiliPlayerRuntimeState,
    undefined,
    createInitialBilibiliPlayerRuntimeState,
  )
  const requestSequenceRef = useRef(0)
  const playlistSequenceRef = useRef(0)

  const resolveBvid = useCallback(
    (bvid: string) =>
      resolveTrack?.(bvid) ??
      builtInTracks.find((track) => track.bvid === bvid) ??
      trackFallback(bvid),
    [builtInTracks, resolveTrack],
  )

  const playlist = useMemo(() => {
    if (controlledState.activePlaylistId === null) {
      return createNamedBilibiliPlaylist(builtInPlaylistName, builtInTracks)
    }
    const source = controlledState.playlists[controlledState.activePlaylistId]
    if (!source) return createNamedBilibiliPlaylist('空播放列表', [])
    return createNamedBilibiliPlaylist(source.name, source.bvids.map(resolveBvid))
  }, [builtInPlaylistName, builtInTracks, controlledState, resolveBvid])

  const selectedBvid = runtime.activeRequest?.track.bvid ?? controlledState.currentBvid
  const state = useMemo(
    () => ({
      playlist,
      selectedBvid,
      mode: controlledState.loopMode,
      activeRequest: runtime.activeRequest,
      dockExpanded: runtime.dockExpanded,
    }),
    [controlledState.loopMode, playlist, runtime, selectedBvid],
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

  const selectPlaylist = useCallback(
    (playlistId: string | null) => {
      const source = playlistId === null ? null : controlledState.playlists[playlistId]
      if (playlistId !== null && !source) return null
      const tracks = playlistId === null ? builtInTracks : (source?.bvids.map(resolveBvid) ?? [])
      const firstTrack = tracks[0]
      const playlistName = playlistId === null ? builtInPlaylistName : (source?.name ?? '')

      onAction({ type: 'music/playlist-select', playlistId })
      if (!firstTrack) return null
      onAction({ type: 'music/track-select', bvid: firstTrack.bvid, index: 0 })
      return requestTrack(firstTrack, {
        origin:
          playlistId === null ? { kind: 'record-player' } : { kind: 'playlist', playlistName },
      })
    },
    [
      builtInPlaylistName,
      builtInTracks,
      controlledState.playlists,
      onAction,
      requestTrack,
      resolveBvid,
    ],
  )

  const loadPlaylist = useCallback(
    (nextPlaylist: NamedBilibiliPlaylist) => {
      const normalized = createNamedBilibiliPlaylist(nextPlaylist.name, nextPlaylist.tracks)
      const firstTrack = normalized.tracks[0]
      const timestamp = now()
      if (controlledState.activePlaylistId !== null) {
        onAction({
          type: 'music/playlist-update',
          playlistId: controlledState.activePlaylistId,
          name: normalized.name,
          bvids: normalized.tracks.map((track) => track.bvid),
          now: timestamp,
        })
        if (!firstTrack) return null
        onAction({ type: 'music/track-select', bvid: firstTrack.bvid, index: 0 })
        return requestTrack(firstTrack, {
          origin: { kind: 'playlist', playlistName: normalized.name },
        })
      }

      playlistSequenceRef.current += 1
      const playlistId = `playlist-${Math.max(0, Math.floor(timestamp)).toString(36)}-${playlistSequenceRef.current.toString(36)}`
      onAction({
        type: 'music/playlist-create',
        playlistId,
        name: normalized.name,
        bvids: normalized.tracks.map((track) => track.bvid),
        now: timestamp,
      })
      onAction({ type: 'music/playlist-select', playlistId })
      if (!firstTrack) return null
      onAction({ type: 'music/track-select', bvid: firstTrack.bvid, index: 0 })
      return requestTrack(firstTrack, {
        origin: { kind: 'playlist', playlistName: normalized.name },
      })
    },
    [controlledState.activePlaylistId, now, onAction, requestTrack],
  )

  const setMode = useCallback(
    (mode: BilibiliPlaybackMode) => onAction({ type: 'music/loop-set', loopMode: mode }),
    [onAction],
  )

  const selectTrack = useCallback(
    (bvid: string, options?: RequestBilibiliTrackOptions) => {
      const index = state.playlist.tracks.findIndex((candidate) => candidate.bvid === bvid)
      const track = index >= 0 ? state.playlist.tracks[index] : undefined
      if (!track) return null
      onAction({ type: 'music/track-select', bvid, index })
      return requestTrack(track, options)
    },
    [onAction, requestTrack, state.playlist.tracks],
  )

  const currentIndex = useCallback(() => {
    if (!state.selectedBvid) return null
    const persistedIndex = controlledState.currentIndex
    if (
      persistedIndex >= 0 &&
      persistedIndex < state.playlist.tracks.length &&
      state.playlist.tracks[persistedIndex]?.bvid === state.selectedBvid
    ) {
      return persistedIndex
    }
    const resolved = state.playlist.tracks.findIndex((track) => track.bvid === state.selectedBvid)
    return resolved >= 0 ? resolved : null
  }, [controlledState.currentIndex, state.playlist.tracks, state.selectedBvid])

  const requestIndex = useCallback(
    (index: number | null) => {
      const track = index === null ? undefined : state.playlist.tracks[index]
      if (!track) return null
      return selectTrack(track.bvid, {
        origin: state.activeRequest?.origin ?? { kind: 'record-player' },
      })
    },
    [selectTrack, state.activeRequest?.origin, state.playlist.tracks],
  )

  const move = useCallback(
    (direction: 1 | -1) =>
      requestIndex(
        adjacentTrackIndex(
          state.mode,
          currentIndex(),
          state.playlist.tracks.length,
          direction,
          state.mode === 'shuffle' ? random() : 0,
        ),
      ),
    [currentIndex, random, requestIndex, state.mode, state.playlist.tracks.length],
  )

  const previous = useCallback(() => move(-1), [move])
  const next = useCallback(() => move(1), [move])
  const ended = useCallback(
    () =>
      requestIndex(
        endedTrackIndex(
          state.mode,
          currentIndex(),
          state.playlist.tracks.length,
          state.mode === 'shuffle' ? random() : 0,
        ),
      ),
    [currentIndex, random, requestIndex, state.mode, state.playlist.tracks.length],
  )

  const showDock = useCallback(() => dispatch({ type: 'dock/set', expanded: true }), [])
  const hideDock = useCallback(() => dispatch({ type: 'dock/set', expanded: false }), [])
  const stop = useCallback(() => dispatch({ type: 'player/stop' }), [])

  const controller = useMemo(
    () => ({
      state,
      loadPlaylist,
      selectPlaylist,
      setMode,
      requestTrack,
      selectTrack,
      previous,
      next,
      ended,
      showDock,
      hideDock,
      stop,
    }),
    [
      ended,
      hideDock,
      loadPlaylist,
      next,
      previous,
      requestTrack,
      selectPlaylist,
      selectTrack,
      setMode,
      showDock,
      state,
      stop,
    ],
  )

  return <BilibiliPlayerContext value={controller}>{children}</BilibiliPlayerContext>
}
