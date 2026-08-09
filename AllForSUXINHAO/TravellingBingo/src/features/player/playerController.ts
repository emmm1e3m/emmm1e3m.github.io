import type {
  BilibiliPlaybackMode,
  BilibiliPlayerTrack,
  NamedBilibiliPlaylist,
} from './playerModel'

export const BILIBILI_PLAYER_CAPABILITIES = Object.freeze({
  canRequestAutoplay: true,
  canRequestStartAt: true,
  canStopByUnmounting: true,
  canPauseFromParent: false,
  canObservePlayback: false,
  canObserveProgress: false,
  canObserveEnded: false,
  canAutoAdvance: false,
})

export interface BilibiliPlayerRequest {
  readonly requestId: number
  readonly track: BilibiliPlayerTrack
  readonly autoplay: boolean
  readonly startAtSeconds: number
  readonly origin: BilibiliPlayerRequestOrigin
}

export type BilibiliPlayerRequestOrigin =
  | { readonly kind: 'direct' }
  | { readonly kind: 'record-player' }
  | { readonly kind: 'collection'; readonly collectionId: string }
  | { readonly kind: 'playlist'; readonly playlistName: string }

export function bilibiliPlayerRequestIdentity(bvid: string, origin: BilibiliPlayerRequestOrigin) {
  switch (origin.kind) {
    case 'direct':
    case 'record-player':
      return `${bvid}:${origin.kind}`
    case 'collection':
      return `${bvid}:collection:${origin.collectionId}`
    case 'playlist':
      return `${bvid}:playlist:${origin.playlistName}`
  }
}

export interface BilibiliPlayerState {
  readonly playlist: NamedBilibiliPlaylist
  /** 业务层明确选中的曲目；与 iframe 当前请求分开，避免把跨域状态当作真实播放状态。 */
  readonly selectedBvid: string | null
  readonly mode: BilibiliPlaybackMode
  readonly defaultStartAtSeconds: number
  readonly activeRequest: BilibiliPlayerRequest | null
  readonly dockExpanded: boolean
}

export interface RequestBilibiliTrackOptions {
  readonly startAtSeconds?: number
  readonly expandDock?: boolean
  readonly origin?: BilibiliPlayerRequestOrigin
}

export interface BilibiliPlayerController {
  readonly state: BilibiliPlayerState
  readonly capabilities: typeof BILIBILI_PLAYER_CAPABILITIES
  loadPlaylist: (playlist: NamedBilibiliPlaylist) => BilibiliPlayerRequest | null
  selectPlaylist: (playlistId: string | null) => BilibiliPlayerRequest | null
  setMode: (mode: BilibiliPlaybackMode) => void
  setDefaultStartAtSeconds: (seconds: number) => void
  requestTrack: (
    track: BilibiliPlayerTrack,
    options?: RequestBilibiliTrackOptions,
  ) => BilibiliPlayerRequest
  selectTrack: (bvid: string, options?: RequestBilibiliTrackOptions) => BilibiliPlayerRequest | null
  previous: () => BilibiliPlayerRequest | null
  next: () => BilibiliPlayerRequest | null
  restartAt: (seconds: number) => BilibiliPlayerRequest | null
  showDock: () => void
  hideDock: () => void
  stop: () => void
}

export type BilibiliPlayerAction =
  | { readonly type: 'playlist/load'; readonly playlist: NamedBilibiliPlaylist }
  | { readonly type: 'mode/set'; readonly mode: BilibiliPlaybackMode }
  | { readonly type: 'start-default/set'; readonly seconds: number }
  | {
      readonly type: 'track/request'
      readonly request: BilibiliPlayerRequest
      readonly expandDock: boolean
    }
  | { readonly type: 'dock/set'; readonly expanded: boolean }
  | { readonly type: 'player/stop' }

export function createInitialBilibiliPlayerState(
  playlist: NamedBilibiliPlaylist,
  mode: BilibiliPlaybackMode,
): BilibiliPlayerState {
  return {
    playlist,
    selectedBvid: null,
    mode,
    defaultStartAtSeconds: 0,
    activeRequest: null,
    dockExpanded: true,
  }
}

export function reduceBilibiliPlayerState(
  state: BilibiliPlayerState,
  action: BilibiliPlayerAction,
): BilibiliPlayerState {
  switch (action.type) {
    case 'playlist/load':
      return {
        ...state,
        playlist: action.playlist,
        selectedBvid: action.playlist.tracks.some((track) => track.bvid === state.selectedBvid)
          ? state.selectedBvid
          : null,
      }
    case 'mode/set':
      return { ...state, mode: action.mode }
    case 'start-default/set':
      return { ...state, defaultStartAtSeconds: action.seconds }
    case 'track/request':
      return {
        ...state,
        selectedBvid: action.request.track.bvid,
        activeRequest: action.request,
        dockExpanded: action.expandDock,
      }
    case 'dock/set':
      return { ...state, dockExpanded: action.expanded }
    case 'player/stop':
      return { ...state, activeRequest: null, dockExpanded: true }
  }
}
