import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { type PropsWithChildren, useLayoutEffect, useState } from 'react'

import type { GameAction, MusicPlayerState } from '@/domain/game/types'

import {
  BilibiliPlayerProvider,
  PersistentPlayerDock,
  type BilibiliPlayerProviderProps,
} from './BilibiliPlayerProvider'
import { useBilibiliPlayerController } from './playerContext'
import playerStyles from './player.css?raw'
import type { BilibiliPlayerTrack } from './playerModel'

type MusicPlayerAction = Extract<GameAction, { type: `music/${string}` }>

const tracks: readonly BilibiliPlayerTrack[] = [
  {
    bvid: 'BV1xx411c7mD',
    title: '曲目 1',
    sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD/',
    durationSeconds: 3,
  },
  {
    bvid: 'BV1B7411m7LV',
    title: '曲目 2',
    sourceUrl: 'https://www.bilibili.com/video/BV1B7411m7LV/',
    durationSeconds: 2,
  },
  {
    bvid: 'BV17x411w7KC',
    title: '曲目 3',
    sourceUrl: 'https://www.bilibili.com/video/BV17x411w7KC/',
    durationSeconds: 4,
  },
]

const externalCollectionTrack: BilibiliPlayerTrack = {
  bvid: 'BV1ABCdef234',
  title: '固定曲库外的收藏视频',
  sourceUrl: 'https://www.bilibili.com/video/BV1ABCdef234/',
  durationSeconds: 1,
}

function createMusicState(overrides: Partial<MusicPlayerState> = {}): MusicPlayerState {
  return {
    currentBvid: null,
    currentIndex: 0,
    loopMode: 'list',
    ...overrides,
  }
}

function applyMusicAction(state: MusicPlayerState, action: MusicPlayerAction): MusicPlayerState {
  switch (action.type) {
    case 'music/track-select':
      return { ...state, currentBvid: action.bvid, currentIndex: action.index }
    case 'music/loop-set':
      return { ...state, loopMode: action.loopMode }
  }
}

interface PlayerHarnessProps
  extends PropsWithChildren, Pick<BilibiliPlayerProviderProps, 'random' | 'onPlayerRequested'> {
  initialState?: MusicPlayerState
  dock?: boolean
  compact?: boolean
  onAction?: (action: MusicPlayerAction) => void
  onExpandRequest?: () => void
  playerTracks?: readonly BilibiliPlayerTrack[]
  loadImmediately?: boolean
}

function PlayerHarness({
  children,
  initialState = createMusicState(),
  dock = true,
  compact,
  onAction,
  onExpandRequest,
  playerTracks = tracks,
  loadImmediately = false,
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
      tracks={playerTracks}
    >
      {children}
      {dock && <PersistentPlayerDock compact={compact} onExpandRequest={onExpandRequest} />}
      {loadImmediately && <ImmediateIframeLoad />}
    </BilibiliPlayerProvider>
  )
}

/** 在同一次 commit 的 layout 阶段触发 load，覆盖 iframe 比被动 effect 更快完成的情况。 */
function ImmediateIframeLoad() {
  const controller = useBilibiliPlayerController()
  const requestId = controller.state.activeRequest?.requestId ?? null
  const playbackRevision = controller.state.playbackRevision

  useLayoutEffect(() => {
    if (requestId === null || !controller.state.playing) return
    const iframe = document.querySelector<HTMLIFrameElement>(
      `[data-testid="persistent-bilibili-player"] iframe[data-request-id="${requestId}"][data-playback-revision="${playbackRevision}"]`,
    )
    iframe?.dispatchEvent(new Event('load'))
  }, [controller.state.playing, playbackRevision, requestId])

  return null
}

function Probe() {
  const controller = useBilibiliPlayerController()
  return (
    <section aria-label="播放器测试控制">
      <output data-testid="active-bvid">{controller.state.activeRequest?.track.bvid ?? ''}</output>
      <output data-testid="request-id">{controller.state.activeRequest?.requestId ?? 0}</output>
      <button type="button" onClick={() => controller.selectTrack(tracks[0]!.bvid)}>
        选择第一首
      </button>
      <button
        type="button"
        onClick={() =>
          controller.requestTrack(externalCollectionTrack, {
            origin: { kind: 'collection', collectionId: 'external-collection' },
          })
        }
      >
        选择收藏视频
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
    </section>
  )
}

function DirectTrackProbe({ track }: { track: BilibiliPlayerTrack }) {
  const controller = useBilibiliPlayerController()
  return (
    <button type="button" onClick={() => controller.requestTrack(track)}>
      播放指定曲目
    </button>
  )
}

describe('持久播放器样式', () => {
  it('按钮保留触控尺寸，展开的 iframe 可交互且收起容器不接收指针', () => {
    expect(playerStyles).toContain(
      '.persistent-bilibili-player button {\n  min-width: 44px;\n  min-height: 44px;',
    )
    expect(playerStyles).toContain('z-index: 105;')
    expect(playerStyles).not.toMatch(
      /\.persistent-bilibili-player__frame iframe\s*\{[^}]*pointer-events:\s*none;/su,
    )
    expect(playerStyles).toMatch(
      /\.persistent-bilibili-player\.is-collapsed \.persistent-bilibili-player__frame\s*\{[^}]*pointer-events:\s*none;/su,
    )
    expect(playerStyles).not.toMatch(
      /\.persistent-bilibili-player\.is-collapsed\s*\{[^}]*\bwidth:/su,
    )
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

  it('图标按钮具有明确名称，显示/隐藏不重建 iframe，取消才卸载', () => {
    const onExpandRequest = vi.fn()
    render(
      <PlayerHarness onExpandRequest={onExpandRequest}>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    const dock = screen.getByTestId('persistent-bilibili-player')
    const iframe = screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：曲目 1')
    expect(new URL(iframe.src).searchParams.get('t')).toBe('0')
    expect(iframe).not.toHaveAttribute('tabindex')
    expect(iframe).not.toHaveAttribute('inert')
    expect(iframe).not.toHaveAttribute('aria-hidden')
    const frame = iframe.closest('.persistent-bilibili-player__frame')
    expect(frame).toHaveAttribute('data-interaction-state', 'enabled')
    expect(frame).not.toHaveAttribute('inert')

    const barButtons = within(dock).getAllByRole('button')
    expect(barButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '隐藏画面',
      '暂停播放',
      '取消播放',
    ])
    expect(screen.getByRole('button', { name: '隐藏画面' })).toHaveTextContent('⏬')
    expect(screen.getByRole('button', { name: '暂停播放' })).toHaveTextContent('⏸️')
    expect(screen.getByRole('button', { name: '取消播放' })).toHaveTextContent('❌')

    fireEvent.click(screen.getByRole('button', { name: '隐藏画面' }))
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)
    expect(screen.getByRole('button', { name: '显示画面' })).toHaveTextContent('⏫')
    expect(frame).toHaveAttribute('data-interaction-state', 'disabled')
    expect(frame).toHaveAttribute('inert')
    expect(frame).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(screen.getByRole('button', { name: '显示画面' }))
    expect(onExpandRequest).toHaveBeenCalledOnce()
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)
    expect(frame).toHaveAttribute('data-interaction-state', 'enabled')
    expect(frame).not.toHaveAttribute('inert')
    expect(frame).not.toHaveAttribute('aria-hidden')

    fireEvent.click(screen.getByRole('button', { name: '取消播放' }))
    expect(screen.queryByTitle(/Bilibili 外链播放器/u)).not.toBeInTheDocument()
  })

  it('播放器摘要显示简短作品名，同时保留完整原始标题', () => {
    const track: BilibiliPlayerTrack = {
      bvid: 'BV1rtDRBJE7s',
      title: '【苏新皓｜4K直拍】Talk WORTHY? Talk DIRTY! 直拍｜浪漫主义·演唱会',
      displayTitle: 'Talk WORTHY? Talk DIRTY! 直拍',
      sourceUrl: 'https://www.bilibili.com/video/BV1rtDRBJE7s/',
      durationSeconds: 542,
    }
    render(
      <PlayerHarness playerTracks={[track]}>
        <DirectTrackProbe track={track} />
      </PlayerHarness>,
    )

    fireEvent.click(screen.getByRole('button', { name: '播放指定曲目' }))
    const dock = screen.getByTestId('persistent-bilibili-player')
    const summary = dock.querySelector('.persistent-bilibili-player__bar p')
    expect(summary).toHaveTextContent('Talk WORTHY? Talk DIRTY! 直拍')
    expect(summary?.textContent).toBe('Talk WORTHY? Talk DIRTY! 直拍')
    expect(summary).toHaveAttribute('title', track.title)
    expect(summary).toHaveAttribute('aria-label', track.title)
    expect(screen.getByTitle(`Bilibili 外链播放器：${track.title}`)).toBeInTheDocument()
  })

  it('暂停会卸载 iframe 停止声音，继续从同一已播秒数重建并恢复剩余计时', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    render(
      <PlayerHarness>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    const initialIframe = screen.getByTitle('Bilibili 外链播放器：曲目 1')
    const requestId = Number(screen.getByTestId('request-id').textContent)
    fireEvent.load(initialIframe)

    act(() => vi.advanceTimersByTime(1_250))
    fireEvent.click(screen.getByRole('button', { name: '暂停播放' }))
    expect(screen.queryByTitle(/Bilibili 外链播放器/u)).not.toBeInTheDocument()
    expect(screen.getByTestId('persistent-bilibili-player')).toHaveAttribute(
      'data-playback-state',
      'paused',
    )

    act(() => vi.advanceTimersByTime(10_000))
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestId)

    fireEvent.click(screen.getByRole('button', { name: '继续播放' }))
    const resumedIframe = screen.getByTitle('Bilibili 外链播放器：曲目 1')
    expect(resumedIframe).not.toBe(initialIframe)
    expect(new URL((resumedIframe as HTMLIFrameElement).src).searchParams.get('t')).toBe('1')
    fireEvent.load(resumedIframe)

    act(() => vi.advanceTimersByTime(1_999))
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestId)
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByTestId('active-bvid')).toHaveTextContent(tracks[1]!.bvid)
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestId + 1)
    expect(
      new URL(
        (screen.getByTitle('Bilibili 外链播放器：曲目 2') as HTMLIFrameElement).src,
      ).searchParams.get('t'),
    ).toBe('0')
  })

  it('跨 compact 布局切换既不重建 iframe，也不重启已开始的计时', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { rerender } = render(
      <PlayerHarness compact={false}>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    const iframe = screen.getByTitle('Bilibili 外链播放器：曲目 1')
    const requestId = Number(screen.getByTestId('request-id').textContent)
    fireEvent.load(iframe)

    act(() => vi.advanceTimersByTime(1_500))
    rerender(
      <PlayerHarness compact>
        <Probe />
      </PlayerHarness>,
    )
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)

    act(() => vi.advanceTimersByTime(1_499))
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestId)
    act(() => vi.advanceTimersByTime(1))
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
    expect(
      new URL(
        (screen.getByTitle('Bilibili 外链播放器：曲目 2') as HTMLIFrameElement).src,
      ).searchParams.get('t'),
    ).toBe('0')
  })

  it.each([
    ['list', tracks[1]!.bvid],
    ['single', tracks[0]!.bvid],
    ['shuffle', tracks[1]!.bvid],
  ] as const)('到达实际时长后按 %s 策略续播', (mode, expectedBvid) => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
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

    act(() => vi.advanceTimersByTime(3_000))

    expect(screen.getByTestId('active-bvid')).toHaveTextContent(expectedBvid)
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestId + 1)
    const nextIframe = screen.getByTitle(
      `Bilibili 外链播放器：${mode === 'single' ? '曲目 1' : '曲目 2'}`,
    )
    expect(new URL((nextIframe as HTMLIFrameElement).src).searchParams.get('t')).toBe('0')
  })

  it('新请求的 iframe 在 commit 后立即 load 仍会启动结束计时', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    render(
      <PlayerHarness loadImmediately>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一首' }))
    const requestId = Number(screen.getByTestId('request-id').textContent)

    act(() => vi.advanceTimersByTime(3_000))

    expect(screen.getByTestId('active-bvid')).toHaveTextContent(tracks[1]!.bvid)
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestId + 1)
  })

  it('固定曲库外的收藏视频在单曲模式播完后以相同来源从 0 秒重播', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const onPlayerRequested = vi.fn()
    render(
      <PlayerHarness onPlayerRequested={onPlayerRequested}>
        <Probe />
      </PlayerHarness>,
    )
    fireEvent.click(screen.getByRole('button', { name: '单曲模式' }))
    fireEvent.click(screen.getByRole('button', { name: '选择收藏视频' }))
    const requestId = Number(screen.getByTestId('request-id').textContent)
    fireEvent.load(screen.getByTitle(`Bilibili 外链播放器：${externalCollectionTrack.title}`))

    act(() => vi.advanceTimersByTime(1_000))

    expect(screen.getByTestId('active-bvid')).toHaveTextContent(externalCollectionTrack.bvid)
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestId + 1)
    expect(onPlayerRequested.mock.calls.at(-1)?.[0]).toMatchObject({
      track: externalCollectionTrack,
      origin: { kind: 'collection', collectionId: 'external-collection' },
    })
    const replayed = screen.getByTitle<HTMLIFrameElement>(
      `Bilibili 外链播放器：${externalCollectionTrack.title}`,
    )
    expect(new URL(replayed.src).searchParams.get('t')).toBe('0')
  })

  it.each([
    ['list', 0, tracks[0]!],
    ['shuffle', 0.5, tracks[1]!],
  ] as const)('固定曲库外的收藏视频按 %s 模式接入固定曲库', (mode, randomValue, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    render(
      <PlayerHarness random={() => randomValue}>
        <Probe />
      </PlayerHarness>,
    )
    if (mode === 'shuffle') fireEvent.click(screen.getByRole('button', { name: '随机模式' }))
    fireEvent.click(screen.getByRole('button', { name: '选择收藏视频' }))
    fireEvent.load(screen.getByTitle(`Bilibili 外链播放器：${externalCollectionTrack.title}`))

    act(() => vi.advanceTimersByTime(1_000))

    expect(screen.getByTestId('active-bvid')).toHaveTextContent(expected.bvid)
    const nextIframe = screen.getByTitle<HTMLIFrameElement>(
      `Bilibili 外链播放器：${expected.title}`,
    )
    expect(new URL(nextIframe.src).searchParams.get('t')).toBe('0')
  })
})
