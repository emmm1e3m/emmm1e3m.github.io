import { type PropsWithChildren, useCallback, useMemo, useReducer, useRef } from 'react'

import type { GameAction, MusicPlayerState } from '@/domain/game/types'

import {
  adjacentTrackIndex,
  buildBilibiliPlayerUrl,
  canonicalBilibiliVideoUrl,
  createNamedBilibiliPlaylist,
  normalizeStartAtSeconds,
  type BilibiliPlaybackMode,
  type BilibiliPlayerTrack,
  type NamedBilibiliPlaylist,
} from './playerModel'
import {
  BILIBILI_PLAYER_CAPABILITIES,
  createInitialBilibiliPlayerState,
  reduceBilibiliPlayerState,
  type BilibiliPlayerRequest,
  type RequestBilibiliTrackOptions,
} from './playerController'
import { BilibiliPlayerContext } from './playerContext'

import './player.css'

type MusicPlayerAction = Extract<GameAction, { type: `music/${string}` }>

interface SharedProviderProps {
  builtInTracks?: readonly BilibiliPlayerTrack[]
  builtInPlaylistName?: string
  resolveTrack?: (bvid: string) => BilibiliPlayerTrack | undefined
  random?: () => number
  now?: () => number
  onPlayerRequested?: (request: BilibiliPlayerRequest) => void
  compactDock?: boolean
  onDockExpandRequest?: () => void
}

interface ControlledProviderProps extends SharedProviderProps {
  state: MusicPlayerState
  onAction: (action: MusicPlayerAction) => void
  initialPlaylist?: never
  initialMode?: never
}

interface UncontrolledProviderProps extends SharedProviderProps {
  state?: never
  onAction?: never
  initialPlaylist?: NamedBilibiliPlaylist
  initialMode?: BilibiliPlaybackMode
}

type BilibiliPlayerProviderProps = PropsWithChildren<
  ControlledProviderProps | UncontrolledProviderProps
>

const EMPTY_PLAYLIST = createNamedBilibiliPlaylist('默认播放列表', [])

function PersistentPlayerHost({
  request,
  expanded,
  compact,
  onShow,
  onHide,
  onStop,
}: {
  request: BilibiliPlayerRequest | null
  expanded: boolean
  compact: boolean
  onShow: () => void
  onHide: () => void
  onStop: () => void
}) {
  if (!request) return null

  const displayExpanded = expanded && !compact

  const playerUrl = buildBilibiliPlayerUrl({
    bvid: request.track.bvid,
    startAtSeconds: request.startAtSeconds,
  })

  return (
    <aside
      className={`persistent-bilibili-player ${displayExpanded ? 'is-expanded' : 'is-collapsed'}`}
      aria-label="持久播放器"
      data-testid="persistent-bilibili-player"
      data-dock-state={displayExpanded ? 'expanded' : 'collapsed'}
    >
      <div className="persistent-bilibili-player__bar">
        <p>
          <strong>{request.track.title}</strong>
          <small>
            已请求从第 <span className="numeric-copy">{request.startAtSeconds}</span> 秒打开
          </small>
        </p>
        {displayExpanded ? (
          <button type="button" onClick={onHide}>
            隐藏画面，保持连接
          </button>
        ) : (
          <button type="button" onClick={onShow}>
            显示播放器画面
          </button>
        )}
        <button type="button" onClick={onStop}>
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
        />
      </div>
      {displayExpanded && (
        <div className="persistent-bilibili-player__footnote">
          <span role="status">已请求自动播放；浏览器可能要求你在播放器内确认。</span>
          <a href={request.track.sourceUrl} target="_blank" rel="noopener noreferrer">
            在来源页打开
          </a>
        </div>
      )}
    </aside>
  )
}

function trackFallback(bvid: string): BilibiliPlayerTrack {
  return { bvid, title: bvid, sourceUrl: canonicalBilibiliVideoUrl(bvid) }
}

/**
 * Provider 持有唯一 iframe。受控模式下，列表、选曲和设置全部来自 GameState；本地只保存 iframe 请求与展开状态。
 */
export function BilibiliPlayerProvider(props: BilibiliPlayerProviderProps) {
  const {
    children,
    builtInTracks = [],
    builtInPlaylistName = '百万直拍精选',
    resolveTrack,
    random = Math.random,
    now = Date.now,
    onPlayerRequested,
    compactDock = false,
    onDockExpandRequest,
  } = props
  const controlledState = props.state
  const onAction = props.onAction
  const [localState, dispatch] = useReducer(
    reduceBilibiliPlayerState,
    createInitialBilibiliPlayerState(
      'initialPlaylist' in props && props.initialPlaylist ? props.initialPlaylist : EMPTY_PLAYLIST,
      'initialMode' in props && props.initialMode ? props.initialMode : 'list',
    ),
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

  const controlledPlaylist = useMemo(() => {
    if (!controlledState) return null
    if (controlledState.activePlaylistId === null) {
      return createNamedBilibiliPlaylist(builtInPlaylistName, builtInTracks)
    }
    const source = controlledState.playlists[controlledState.activePlaylistId]
    if (!source) return createNamedBilibiliPlaylist('空播放列表', [])
    return createNamedBilibiliPlaylist(source.name, source.bvids.map(resolveBvid))
  }, [builtInPlaylistName, builtInTracks, controlledState, resolveBvid])

  const state = useMemo(
    () =>
      controlledState && controlledPlaylist
        ? {
            ...localState,
            playlist: controlledPlaylist,
            selectedBvid: controlledState.currentBvid,
            mode: controlledState.loopMode,
            defaultStartAtSeconds: controlledState.startAtSeconds,
          }
        : localState,
    [controlledPlaylist, controlledState, localState],
  )

  const requestTrack = useCallback(
    (track: BilibiliPlayerTrack, options: RequestBilibiliTrackOptions = {}) => {
      const request: BilibiliPlayerRequest = {
        requestId: (requestSequenceRef.current += 1),
        track,
        // 产品始终向外链播放器请求自动播放；浏览器仍可能要求用户在 iframe 内确认。
        autoplay: true,
        startAtSeconds: normalizeStartAtSeconds(
          options.startAtSeconds ?? state.defaultStartAtSeconds,
        ),
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
    [onPlayerRequested, state.defaultStartAtSeconds],
  )

  const selectPlaylist = useCallback(
    (playlistId: string | null) => {
      if (!controlledState || !onAction) return null

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
    [builtInPlaylistName, builtInTracks, controlledState, onAction, requestTrack, resolveBvid],
  )

  const loadPlaylist = useCallback(
    (playlist: NamedBilibiliPlaylist) => {
      const normalized = createNamedBilibiliPlaylist(playlist.name, playlist.tracks)
      const firstTrack = normalized.tracks[0]
      if (!controlledState || !onAction) {
        dispatch({ type: 'playlist/load', playlist: normalized })
        return firstTrack
          ? requestTrack(firstTrack, {
              origin: { kind: 'playlist', playlistName: normalized.name },
            })
          : null
      }

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
    [controlledState, now, onAction, requestTrack],
  )

  const setMode = useCallback(
    (mode: BilibiliPlaybackMode) => {
      if (controlledState && onAction) {
        onAction({ type: 'music/loop-set', loopMode: mode })
        return
      }
      dispatch({ type: 'mode/set', mode })
    },
    [controlledState, onAction],
  )

  const setDefaultStartAtSeconds = useCallback(
    (seconds: number) => {
      const normalized = normalizeStartAtSeconds(seconds)
      if (controlledState && onAction) {
        onAction({ type: 'music/seek-set', startAtSeconds: normalized })
        return
      }
      dispatch({ type: 'start-default/set', seconds: normalized })
    },
    [controlledState, onAction],
  )

  const selectTrack = useCallback(
    (bvid: string, options?: RequestBilibiliTrackOptions) => {
      const index = state.playlist.tracks.findIndex((candidate) => candidate.bvid === bvid)
      const track = index >= 0 ? state.playlist.tracks[index] : undefined
      if (!track) return null
      if (controlledState && onAction) {
        onAction({ type: 'music/track-select', bvid, index })
      }
      return requestTrack(track, options)
    },
    [controlledState, onAction, requestTrack, state.playlist.tracks],
  )

  const move = useCallback(
    (direction: 1 | -1) => {
      const tracks = state.playlist.tracks
      const currentIndex = controlledState
        ? controlledState.currentIndex >= 0 &&
          controlledState.currentIndex < tracks.length &&
          tracks[controlledState.currentIndex]?.bvid === controlledState.currentBvid
          ? controlledState.currentIndex
          : controlledState.currentBvid
            ? tracks.findIndex((track) => track.bvid === controlledState.currentBvid)
            : -1
        : state.selectedBvid
          ? tracks.findIndex((track) => track.bvid === state.selectedBvid)
          : -1
      const nextIndex = adjacentTrackIndex(
        state.mode,
        currentIndex >= 0 ? currentIndex : null,
        tracks.length,
        direction,
        state.mode === 'shuffle' ? random() : 0,
      )
      const track = nextIndex === null ? undefined : tracks[nextIndex]
      return track ? selectTrack(track.bvid) : null
    },
    [controlledState, random, selectTrack, state.mode, state.playlist, state.selectedBvid],
  )

  const previous = useCallback(() => move(-1), [move])
  const next = useCallback(() => move(1), [move])

  const restartAt = useCallback(
    (seconds: number) => {
      const selectedBvid = controlledState?.currentBvid ?? state.selectedBvid
      if (!selectedBvid) return null
      const track = state.playlist.tracks.find((candidate) => candidate.bvid === selectedBvid)
      if (!track) return null
      setDefaultStartAtSeconds(seconds)
      return requestTrack(track, { startAtSeconds: seconds })
    },
    [
      controlledState?.currentBvid,
      requestTrack,
      setDefaultStartAtSeconds,
      state.playlist,
      state.selectedBvid,
    ],
  )

  const showDock = useCallback(() => dispatch({ type: 'dock/set', expanded: true }), [])
  const hideDock = useCallback(() => dispatch({ type: 'dock/set', expanded: false }), [])
  const stop = useCallback(() => dispatch({ type: 'player/stop' }), [])

  const controller = useMemo(
    () => ({
      state,
      capabilities: BILIBILI_PLAYER_CAPABILITIES,
      loadPlaylist,
      selectPlaylist,
      setMode,
      setDefaultStartAtSeconds,
      requestTrack,
      selectTrack,
      previous,
      next,
      restartAt,
      showDock,
      hideDock,
      stop,
    }),
    [
      hideDock,
      loadPlaylist,
      next,
      previous,
      requestTrack,
      restartAt,
      selectTrack,
      selectPlaylist,
      setDefaultStartAtSeconds,
      setMode,
      showDock,
      state,
      stop,
    ],
  )

  return (
    <BilibiliPlayerContext value={controller}>
      {children}
      <PersistentPlayerHost
        request={state.activeRequest}
        expanded={state.dockExpanded}
        compact={compactDock}
        onShow={() => {
          onDockExpandRequest?.()
          showDock()
        }}
        onHide={hideDock}
        onStop={stop}
      />
    </BilibiliPlayerContext>
  )
}
