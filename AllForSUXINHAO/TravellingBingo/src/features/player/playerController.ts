import type {
  BilibiliPlaybackMode,
  BilibiliPlayerTrack,
  NamedBilibiliPlaylist,
} from './playerModel'

export interface BilibiliPlayerRequest {
  readonly requestId: number
  readonly track: BilibiliPlayerTrack
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

/** GameState 投影与播放器唯一运行态合并后的只读视图。 */
export interface BilibiliPlayerState {
  readonly playlist: NamedBilibiliPlaylist
  readonly selectedBvid: string | null
  readonly mode: BilibiliPlaybackMode
  readonly activeRequest: BilibiliPlayerRequest | null
  readonly dockExpanded: boolean
}

export interface BilibiliPlayerRuntimeState {
  readonly activeRequest: BilibiliPlayerRequest | null
  readonly dockExpanded: boolean
}

export interface RequestBilibiliTrackOptions {
  readonly expandDock?: boolean
  readonly origin?: BilibiliPlayerRequestOrigin
}

export interface BilibiliPlayerController {
  readonly state: BilibiliPlayerState
  loadPlaylist: (playlist: NamedBilibiliPlaylist) => BilibiliPlayerRequest | null
  selectPlaylist: (playlistId: string | null) => BilibiliPlayerRequest | null
  setMode: (mode: BilibiliPlaybackMode) => void
  requestTrack: (
    track: BilibiliPlayerTrack,
    options?: RequestBilibiliTrackOptions,
  ) => BilibiliPlayerRequest
  selectTrack: (bvid: string, options?: RequestBilibiliTrackOptions) => BilibiliPlayerRequest | null
  previous: () => BilibiliPlayerRequest | null
  next: () => BilibiliPlayerRequest | null
  ended: () => BilibiliPlayerRequest | null
  showDock: () => void
  hideDock: () => void
  stop: () => void
}

export type BilibiliPlayerRuntimeAction =
  | {
      readonly type: 'track/request'
      readonly request: BilibiliPlayerRequest
      readonly expandDock: boolean
    }
  | { readonly type: 'dock/set'; readonly expanded: boolean }
  | { readonly type: 'player/stop' }

export function createInitialBilibiliPlayerRuntimeState(): BilibiliPlayerRuntimeState {
  return {
    activeRequest: null,
    dockExpanded: true,
  }
}

export function reduceBilibiliPlayerRuntimeState(
  state: BilibiliPlayerRuntimeState,
  action: BilibiliPlayerRuntimeAction,
): BilibiliPlayerRuntimeState {
  switch (action.type) {
    case 'track/request':
      return {
        activeRequest: action.request,
        dockExpanded: action.expandDock,
      }
    case 'dock/set':
      return { ...state, dockExpanded: action.expanded }
    case 'player/stop':
      return { activeRequest: null, dockExpanded: true }
  }
}
