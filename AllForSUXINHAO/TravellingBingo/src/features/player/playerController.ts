import type { BilibiliPlaybackMode, BilibiliPlayerTrack } from './playerModel'

export interface BilibiliPlayerRequest {
  readonly requestId: number
  readonly track: BilibiliPlayerTrack
  readonly origin: BilibiliPlayerRequestOrigin
}

export type BilibiliPlayerRequestOrigin =
  | { readonly kind: 'direct' }
  | { readonly kind: 'record-player' }
  | { readonly kind: 'collection'; readonly collectionId: string }

export function bilibiliPlayerRequestIdentity(bvid: string, origin: BilibiliPlayerRequestOrigin) {
  return origin.kind === 'collection'
    ? `${bvid}:collection:${origin.collectionId}`
    : `${bvid}:${origin.kind}`
}

/** GameState 投影与播放器唯一运行态合并后的只读视图。 */
interface BilibiliPlayerState {
  readonly tracks: readonly BilibiliPlayerTrack[]
  readonly selectedBvid: string | null
  readonly mode: BilibiliPlaybackMode
  readonly activeRequest: BilibiliPlayerRequest | null
  readonly dockExpanded: boolean
  readonly playing: boolean
  /** 暂停后继续使用的易失整秒起点，不进入 GameState。 */
  readonly resumeAtSeconds: number
  /** 同一请求暂停后继续时递增，只用于重建 iframe。 */
  readonly playbackRevision: number
}

interface BilibiliPlayerRuntimeState {
  readonly activeRequest: BilibiliPlayerRequest | null
  readonly dockExpanded: boolean
  readonly playing: boolean
  readonly resumeAtSeconds: number
  readonly playbackRevision: number
}

export interface RequestBilibiliTrackOptions {
  readonly expandDock?: boolean
  readonly origin?: BilibiliPlayerRequestOrigin
}

export interface BilibiliPlayerController {
  readonly state: BilibiliPlayerState
  setMode: (mode: BilibiliPlaybackMode) => void
  requestTrack: (
    track: BilibiliPlayerTrack,
    options?: RequestBilibiliTrackOptions,
  ) => BilibiliPlayerRequest
  selectTrack: (bvid: string, options?: RequestBilibiliTrackOptions) => BilibiliPlayerRequest | null
  previous: () => BilibiliPlayerRequest | null
  next: () => BilibiliPlayerRequest | null
  ended: () => BilibiliPlayerRequest | null
  pause: (resumeAtSeconds: number) => void
  resume: () => void
  showDock: () => void
  hideDock: () => void
  stop: () => void
}

type BilibiliPlayerRuntimeAction =
  | {
      readonly type: 'track/request'
      readonly request: BilibiliPlayerRequest
      readonly expandDock: boolean
    }
  | { readonly type: 'playback/pause'; readonly resumeAtSeconds: number }
  | { readonly type: 'playback/resume' }
  | { readonly type: 'dock/set'; readonly expanded: boolean }
  | { readonly type: 'player/stop' }

export function createInitialBilibiliPlayerRuntimeState(): BilibiliPlayerRuntimeState {
  return {
    activeRequest: null,
    dockExpanded: true,
    playing: false,
    resumeAtSeconds: 0,
    playbackRevision: 0,
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
        playing: true,
        resumeAtSeconds: 0,
        playbackRevision: state.playbackRevision + 1,
      }
    case 'playback/pause':
      return state.activeRequest && state.playing
        ? {
            ...state,
            playing: false,
            resumeAtSeconds: Number.isFinite(action.resumeAtSeconds)
              ? Math.max(0, Math.floor(action.resumeAtSeconds))
              : 0,
          }
        : state
    case 'playback/resume':
      return state.activeRequest && !state.playing
        ? { ...state, playing: true, playbackRevision: state.playbackRevision + 1 }
        : state
    case 'dock/set':
      return { ...state, dockExpanded: action.expanded }
    case 'player/stop':
      return {
        ...state,
        activeRequest: null,
        dockExpanded: true,
        playing: false,
        resumeAtSeconds: 0,
      }
  }
}
