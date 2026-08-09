import { act, fireEvent, render, screen } from '@testing-library/react'
import { type PropsWithChildren, useState } from 'react'

import type { GameAction, MusicPlayerState } from '@/domain/game/types'
import videoCatalogJson from '../../../public/data/video-catalog.json'

import {
  BilibiliPlayerProvider,
  PersistentPlayerDock,
  type BilibiliPlayerProviderProps,
} from './BilibiliPlayerProvider'
import { useBilibiliPlayerController } from './playerContext'
import playerStyles from './player.css?raw'
import { parseBilibiliTrackReference, type BilibiliPlayerTrack } from './playerModel'

type MusicPlayerAction = Extract<GameAction, { type: `music/${string}` }>

const tracks = [
  parseBilibiliTrackReference('BV1xx411c7mD')!,
  parseBilibiliTrackReference('BV1B7411m7LV')!,
  parseBilibiliTrackReference('BV17x411w7KC')!,
].map((track, index) => ({
  ...track,
  title: `曲目 ${index + 1}`,
  durationSeconds: 2,
}))

const manualShortTracks: readonly BilibiliPlayerTrack[] = videoCatalogJson.extraTracks.items.map(
  (video) => ({
    bvid: video.bvid,
    title: video.title,
    sourceUrl: video.sourceUrl,
    authorName: video.authorName,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
  }),
)

function createMusicState(overrides: Partial<MusicPlayerState> = {}): MusicPlayerState {
  return {
    playlists: {},
    order: [],
    activePlaylistId: null,
    currentBvid: null,
    currentIndex: 0,
    loopMode: 'list',
    ...overrides,
  }
}

function applyMusicAction(state: MusicPlayerState, action: MusicPlayerAction): MusicPlayerState {
  switch (action.type) {
    case 'music/playlist-create':
      return {
        ...state,
        playlists: {
          ...state.playlists,
          [action.playlistId]: {
            id: action.playlistId,
            name: action.name,
            bvids: [...(action.bvids ?? [])],
            createdAt: action.now,
            updatedAt: action.now,
          },
        },
        order: [...state.order, action.playlistId],
      }
    case 'music/playlist-update': {
      const previous = state.playlists[action.playlistId]
      if (!previous) return state
      return {
        ...state,
        playlists: {
          ...state.playlists,
          [action.playlistId]: {
            ...previous,
            name: action.name ?? previous.name,
            bvids: [...(action.bvids ?? previous.bvids)],
            updatedAt: action.now,
          },
        },
      }
    }
    case 'music/playlist-select':
      return { ...state, activePlaylistId: action.playlistId, currentBvid: null, currentIndex: 0 }
    case 'music/track-select':
      return { ...state, currentBvid: action.bvid, currentIndex: action.index }
    case 'music/loop-set':
      return { ...state, loopMode: action.loopMode }
    default:
      return state
  }
}

interface PlayerHarnessProps
  extends
    PropsWithChildren,
    Pick<BilibiliPlayerProviderProps, 'random' | 'now' | 'onPlayerRequested' | 'resolveTrack'> {
  initialState?: MusicPlayerState
  dock?: boolean
  compact?: boolean
  onAction?: (action: MusicPlayerAction) => void
  onExpandRequest?: () => void
  builtInTracks?: readonly BilibiliPlayerTrack[]
}

function PlayerHarness({
  children,
  initialState = createMusicState(),
  dock = true,
  compact,
  onAction,
  onExpandRequest,
  builtInTracks = tracks,
  ...providerProps
}: PlayerHarnessProps) {
  const [state, setState] = useState(initialState)
  return (
    <BilibiliPlayerProvider
      {...providerProps}
      state={state}
      onAction={(action) => {
        onAction?.(action)
        setState((current) => applyMusicAction(current, action))
      }}
      builtInTracks={builtInTracks}
    >
      {children}
      {dock && <PersistentPlayerDock compact={compact} onExpandRequest={onExpandRequest} />}
    </BilibiliPlayerProvider>
  )
}

function CatalogTrackProbe() {
  const controller = useBilibiliPlayerController()
  const firstTrack = controller.state.playlist.tracks[0]
  return (
    <>
      <output data-testid="catalog-active-bvid">
        {controller.state.activeRequest?.track.bvid ?? ''}
      </output>
      <output data-testid="catalog-request-id">
        {controller.state.activeRequest?.requestId ?? 0}
      </output>
      <button
        type="button"
        disabled={!firstTrack}
        onClick={() => firstTrack && controller.selectTrack(firstTrack.bvid)}
      >
        播放目录第一首
      </button>
    </>
  )
}

function Probe() {
  const controller = useBilibiliPlayerController()
  return (
    <section aria-label="播放器测试控制">
      <output data-testid="playlist-name">{controller.state.playlist.name}</output>
      <output data-testid="active-bvid">{controller.state.activeRequest?.track.bvid ?? ''}</output>
      <output data-testid="request-id">{controller.state.activeRequest?.requestId ?? 0}</output>
      <button type="button" onClick={() => controller.selectTrack(tracks[0]!.bvid)}>
        选择第一首
      </button>
      <button type="button" onClick={controller.next}>
        下一首
      </button>
      <button type="button" onClick={() => controller.setMode('single')}>
        单曲模式
      </button>
      <button type="button" onClick={() => controller.setMode('shuffle')}>
        随机模式
      </button>
      <button
        type="button"
        onClick={() =>
          controller.loadPlaylist({ name: '新列表', tracks: [tracks[0]!, tracks[0]!, tracks[2]!] })
        }
      >
        创建列表
      </button>
    </section>
  )
}

describe('持久播放器样式', () => {
  it('按钮保留触控尺寸，层级高于收藏墙且低于完整图片层', () => {
    expect(playerStyles).toContain(
      '.persistent-bilibili-player button {\n  min-width: 44px;\n  min-height: 44px;',
    )
    expect(playerStyles).toContain('z-index: 105;')
    expect(playerStyles).toContain('z-index: 79;')
    expect(playerStyles).toContain(':not(.collectible-detail-backdrop)')
    expect(playerStyles).toContain('--player-dock-bottom: calc(var(--player-edge-block) + 4.5rem);')
    expect(playerStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));')
  })
})

describe('BilibiliPlayerProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('Provider 不再隐式渲染宿主，显式 Dock 才创建唯一 iframe', () => {
    const { rerender } = render(
      <PlayerHarness dock={false}>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    expect(screen.queryByTitle(/Bilibili 外链播放器/u)).not.toBeInTheDocument()

    rerender(
      <PlayerHarness>
        <Probe />
      </PlayerHarness>,
    )
    expect(screen.getAllByTitle(/Bilibili 外链播放器/u)).toHaveLength(1)
  })

  it('隐藏与显示画面保留同一 iframe，停止才卸载', () => {
    const onExpandRequest = vi.fn()
    render(
      <PlayerHarness onExpandRequest={onExpandRequest}>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    const iframe = screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：曲目 1')
    expect(new URL(iframe.src).searchParams.get('t')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '隐藏画面' }))
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)
    expect(iframe).toHaveAttribute('tabindex', '-1')

    fireEvent.click(screen.getByRole('button', { name: '显示画面' }))
    expect(onExpandRequest).toHaveBeenCalledOnce()
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)
    expect(iframe).toHaveAttribute('tabindex', '0')

    fireEvent.click(screen.getByRole('button', { name: '停止播放' }))
    expect(screen.queryByTitle(/Bilibili 外链播放器/u)).not.toBeInTheDocument()
  })

  it('宿主布局切换既不重建 iframe，也不重启已开始的结束计时', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <PlayerHarness compact={false}>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    const iframe = screen.getByTitle('Bilibili 外链播放器：曲目 1')
    const requestId = Number(screen.getByTestId('request-id').textContent)
    fireEvent.load(iframe)

    act(() => vi.advanceTimersByTime(1_000))
    rerender(
      <PlayerHarness compact>
        <Probe />
      </PlayerHarness>,
    )
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)

    act(() => vi.advanceTimersByTime(999))
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestId)
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByTestId('active-bvid')).toHaveTextContent(tracks[1]!.bvid)
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestId + 1)
  })

  it('单曲模式下手动下一首仍切相邻曲目', () => {
    render(
      <PlayerHarness>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    fireEvent.click(screen.getByRole('button', { name: '单曲模式' }))
    fireEvent.click(screen.getByRole('button', { name: '下一首' }))
    expect(screen.getByTestId('active-bvid')).toHaveTextContent(tracks[1]!.bvid)
  })

  it.each([
    ['list', tracks[1]!.bvid],
    ['single', tracks[0]!.bvid],
    ['shuffle', tracks[1]!.bvid],
  ] as const)('静态时长到点后按 %s 策略续播', (mode, expectedBvid) => {
    vi.useFakeTimers()
    render(
      <PlayerHarness random={() => 0}>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    if (mode === 'single') fireEvent.click(screen.getByRole('button', { name: '单曲模式' }))
    if (mode === 'shuffle') fireEvent.click(screen.getByRole('button', { name: '随机模式' }))
    const requestId = Number(screen.getByTestId('request-id').textContent)
    fireEvent.load(screen.getByTitle('Bilibili 外链播放器：曲目 1'))

    act(() => vi.advanceTimersByTime(2_000))

    expect(screen.getByTestId('active-bvid')).toHaveTextContent(expectedBvid)
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestId + 1)
  })

  it('停止播放会取消静态结束计时', () => {
    vi.useFakeTimers()
    const onPlayerRequested = vi.fn()
    render(
      <PlayerHarness onPlayerRequested={onPlayerRequested}>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    fireEvent.load(screen.getByTitle('Bilibili 外链播放器：曲目 1'))
    fireEvent.click(screen.getByRole('button', { name: '停止播放' }))
    act(() => vi.advanceTimersByTime(2_000))
    expect(onPlayerRequested).toHaveBeenCalledOnce()
  })

  it('静态目录中的 21 秒测试视频会在完整时长后续播', () => {
    vi.useFakeTimers()
    expect(manualShortTracks.map((track) => [track.bvid, track.durationSeconds])).toEqual([
      ['BV13FdBBAEUF', 21],
      ['BV16VDdBUEfC', 21],
    ])
    render(
      <PlayerHarness builtInTracks={manualShortTracks}>
        <CatalogTrackProbe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '播放目录第一首' }))
    const requestId = Number(screen.getByTestId('catalog-request-id').textContent)
    fireEvent.load(screen.getByTitle(`Bilibili 外链播放器：${manualShortTracks[0]!.title}`))

    act(() => vi.advanceTimersByTime(20_999))
    expect(screen.getByTestId('catalog-active-bvid')).toHaveTextContent('BV13FdBBAEUF')
    expect(Number(screen.getByTestId('catalog-request-id').textContent)).toBe(requestId)

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByTestId('catalog-active-bvid')).toHaveTextContent('BV16VDdBUEfC')
    expect(Number(screen.getByTestId('catalog-request-id').textContent)).toBe(requestId + 1)
  })

  it('受控 GameState 接收选曲、模式与去重后的新列表 action', () => {
    const onAction = vi.fn()
    const onPlayerRequested = vi.fn()
    render(
      <PlayerHarness now={() => 1234} onAction={onAction} onPlayerRequested={onPlayerRequested}>
        <Probe />
      </PlayerHarness>,
    )
    expect(screen.getByTestId('playlist-name')).toHaveTextContent('全站第一')

    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'music/track-select',
      bvid: tracks[0]!.bvid,
      index: 0,
    })
    expect(onPlayerRequested).toHaveBeenCalledWith(
      expect.objectContaining({ track: tracks[0], origin: { kind: 'direct' } }),
    )

    fireEvent.click(screen.getByRole('button', { name: '随机模式' }))
    expect(onAction).toHaveBeenCalledWith({ type: 'music/loop-set', loopMode: 'shuffle' })

    fireEvent.click(screen.getByRole('button', { name: '创建列表' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'music/playlist-create',
      playlistId: 'playlist-ya-1',
      name: '新列表',
      bvids: [tracks[0]!.bvid, tracks[2]!.bvid],
      now: 1234,
    })
  })
})
