import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import type { MusicPlayerState } from '@/domain/game/types'

import { BilibiliPlayerProvider } from './BilibiliPlayerProvider'
import { useBilibiliPlayerController } from './playerContext'
import playerStyles from './player.css?raw'
import {
  createNamedBilibiliPlaylist,
  parseBilibiliTrackReference,
  type BilibiliPlayerTrack,
} from './playerModel'

const tracks = [
  parseBilibiliTrackReference('BV1xx411c7mD')!,
  parseBilibiliTrackReference('BV1B7411m7LV')!,
  parseBilibiliTrackReference('BV17x411w7KC')!,
].map((track, index) => ({ ...track, title: `曲目 ${index + 1}` }))

const playlist = createNamedBilibiliPlaylist('测试列表', tracks)

describe('持久播放器移动触控', () => {
  it('按钮至少 44px，窄屏控制区换成不压缩的两列', () => {
    expect(playerStyles).toContain(
      '.persistent-bilibili-player button {\n  min-width: 44px;\n  min-height: 44px;\n  flex: 0 0 auto;',
    )
    expect(playerStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));')
    expect(playerStyles).toContain('.persistent-bilibili-player__bar p {\n    grid-column: 1 / -1;')
  })
})

function PanelControls({ tracks: panelTracks }: { tracks: readonly BilibiliPlayerTrack[] }) {
  const controller = useBilibiliPlayerController()
  return (
    <section aria-label="测试选曲面板">
      {panelTracks.map((track) => (
        <button
          key={track.bvid}
          type="button"
          onClick={() =>
            controller.selectTrack(track.bvid, {
              origin: { kind: 'playlist', playlistName: controller.state.playlist.name },
            })
          }
        >
          选择 {track.title}
        </button>
      ))}
      <button type="button" onClick={() => controller.setDefaultStartAtSeconds(35)}>
        起播设为 35 秒
      </button>
      <button type="button" onClick={() => controller.setMode('single')}>
        设为单曲
      </button>
      <button type="button" onClick={() => controller.setMode('shuffle')}>
        设为随机
      </button>
      <button type="button" onClick={controller.next}>
        测试下一首
      </button>
    </section>
  )
}

function ProviderHarness() {
  const [panelVisible, setPanelVisible] = useState(true)
  const controller = useBilibiliPlayerController()
  return (
    <>
      {panelVisible && <PanelControls tracks={controller.state.playlist.tracks} />}
      <button type="button" onClick={() => setPanelVisible(false)}>
        关闭测试面板
      </button>
      <output data-testid="active-bvid">{controller.state.activeRequest?.track.bvid ?? ''}</output>
      <output data-testid="request-id">{controller.state.activeRequest?.requestId ?? 0}</output>
      <output data-testid="can-observe-ended">
        {String(controller.capabilities.canObserveEnded)}
      </output>
    </>
  )
}

function ControlledProbe() {
  const controller = useBilibiliPlayerController()
  return (
    <>
      <output data-testid="controlled-list-name">{controller.state.playlist.name}</output>
      <output data-testid="controlled-track-count">
        {controller.state.playlist.tracks.length}
      </output>
      <output data-testid="controlled-selected-bvid">{controller.state.selectedBvid ?? ''}</output>
      <button
        type="button"
        onClick={() =>
          controller.selectTrack(tracks[1]!.bvid, {
            origin: { kind: 'record-player' },
          })
        }
      >
        受控选择第二首
      </button>
      <button type="button" onClick={() => controller.setMode('shuffle')}>
        受控随机
      </button>
      <button type="button" onClick={() => controller.setDefaultStartAtSeconds(27)}>
        受控起点
      </button>
      <button type="button" onClick={controller.next}>
        受控下一首
      </button>
      <button type="button" onClick={() => controller.restartAt(9)}>
        受控从 9 秒重新打开
      </button>
      <button
        type="button"
        onClick={() =>
          controller.loadPlaylist(
            createNamedBilibiliPlaylist('新列表', [tracks[0]!, tracks[0]!, tracks[2]!]),
          )
        }
      >
        创建自定义列表
      </button>
      <button type="button" onClick={() => controller.selectPlaylist('custom-list')}>
        切换自定义曲库
      </button>
      <button type="button" onClick={() => controller.selectPlaylist(null)}>
        切换内置精选
      </button>
    </>
  )
}

describe('BilibiliPlayerProvider', () => {
  it('面板卸载或播放器画面隐藏时保留同一个 iframe，只有停止才卸载', () => {
    const onPlayerRequested = vi.fn()
    render(
      <BilibiliPlayerProvider initialPlaylist={playlist} onPlayerRequested={onPlayerRequested}>
        <ProviderHarness />
      </BilibiliPlayerProvider>,
    )

    expect(screen.queryByTitle(/Bilibili 外链播放器/u)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '起播设为 35 秒' }))
    fireEvent.click(screen.getByRole('button', { name: '选择 曲目 1' }))

    expect(onPlayerRequested).toHaveBeenCalledOnce()
    expect(onPlayerRequested.mock.calls[0]?.[0]).toMatchObject({
      autoplay: true,
      startAtSeconds: 35,
      origin: { kind: 'playlist', playlistName: '测试列表' },
    })
    const iframe = screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：曲目 1')
    const url = new URL(iframe.src)
    expect(url.searchParams.get('autoplay')).toBe('1')
    expect(url.searchParams.get('t')).toBe('35')
    expect(screen.getByTestId('can-observe-ended')).toHaveTextContent('false')

    fireEvent.load(iframe)
    fireEvent.error(iframe)
    fireEvent.abort(iframe)
    expect(onPlayerRequested).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '隐藏画面，保持连接' }))
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)
    expect(iframe).toHaveAttribute('tabindex', '-1')

    fireEvent.click(screen.getByRole('button', { name: '显示播放器画面' }))
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)
    expect(iframe).toHaveAttribute('tabindex', '0')

    fireEvent.click(screen.getByRole('button', { name: '关闭测试面板' }))
    expect(screen.queryByRole('region', { name: '测试选曲面板' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)

    fireEvent.click(screen.getByRole('button', { name: '停止播放' }))
    expect(screen.queryByTitle('Bilibili 外链播放器：曲目 1')).not.toBeInTheDocument()
  })

  it('房间待机时只收起画面并保留 iframe，重新显示会先请求打开唱片机面板', () => {
    const onDockExpandRequest = vi.fn()
    const renderTree = (compactDock: boolean) => (
      <BilibiliPlayerProvider
        initialPlaylist={playlist}
        compactDock={compactDock}
        onDockExpandRequest={onDockExpandRequest}
      >
        <PanelControls tracks={tracks} />
      </BilibiliPlayerProvider>
    )
    const { rerender } = render(renderTree(false))

    fireEvent.click(screen.getByRole('button', { name: '选择 曲目 1' }))
    const iframe = screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：曲目 1')
    expect(screen.getByTestId('persistent-bilibili-player')).toHaveAttribute(
      'data-dock-state',
      'expanded',
    )

    rerender(renderTree(true))
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)
    expect(iframe).toHaveAttribute('tabindex', '-1')
    expect(screen.getByTestId('persistent-bilibili-player')).toHaveAttribute(
      'data-dock-state',
      'collapsed',
    )

    fireEvent.click(screen.getByRole('button', { name: '显示播放器画面' }))
    expect(onDockExpandRequest).toHaveBeenCalledOnce()
    rerender(renderTree(false))
    expect(screen.getByTitle('Bilibili 外链播放器：曲目 1')).toBe(iframe)
    expect(iframe).toHaveAttribute('tabindex', '0')
  })

  it('列表、单曲和随机模式只在用户主动切歌时发出新请求', () => {
    const onPlayerRequested = vi.fn()
    render(
      <BilibiliPlayerProvider
        initialPlaylist={playlist}
        random={() => 0}
        onPlayerRequested={onPlayerRequested}
      >
        <ProviderHarness />
      </BilibiliPlayerProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '选择 曲目 1' }))
    fireEvent.click(screen.getByRole('button', { name: '测试下一首' }))
    expect(screen.getByTestId('active-bvid')).toHaveTextContent('BV1B7411m7LV')

    fireEvent.click(screen.getByRole('button', { name: '设为单曲' }))
    const requestBeforeSingle = Number(screen.getByTestId('request-id').textContent)
    fireEvent.click(screen.getByRole('button', { name: '测试下一首' }))
    expect(screen.getByTestId('active-bvid')).toHaveTextContent('BV1B7411m7LV')
    expect(Number(screen.getByTestId('request-id').textContent)).toBe(requestBeforeSingle + 1)

    fireEvent.click(screen.getByRole('button', { name: '设为随机' }))
    fireEvent.click(screen.getByRole('button', { name: '测试下一首' }))
    expect(screen.getByTestId('active-bvid')).toHaveTextContent('BV17x411w7KC')
    expect(onPlayerRequested).toHaveBeenCalledTimes(4)
  })

  it('受控模式从 GameState 投影内置列表，并把业务变更全部交还领域 action', () => {
    const state: MusicPlayerState = {
      playlists: {},
      order: [],
      activePlaylistId: null,
      currentBvid: tracks[0]!.bvid,
      currentIndex: 0,
      loopMode: 'list',
      startAtSeconds: 0,
      autoplay: false,
    }
    const onAction = vi.fn()
    const onPlayerRequested = vi.fn()
    render(
      <BilibiliPlayerProvider
        state={state}
        onAction={onAction}
        builtInTracks={tracks}
        now={() => 1234}
        onPlayerRequested={onPlayerRequested}
      >
        <ControlledProbe />
      </BilibiliPlayerProvider>,
    )

    expect(screen.getByTestId('controlled-list-name')).toHaveTextContent('百万直拍精选')
    expect(screen.getByTestId('controlled-track-count')).toHaveTextContent('3')

    fireEvent.click(screen.getByRole('button', { name: '受控选择第二首' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'music/track-select',
      bvid: tracks[1]!.bvid,
      index: 1,
    })
    expect(onPlayerRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        track: tracks[1],
        autoplay: true,
        origin: { kind: 'record-player' },
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '受控随机' }))
    fireEvent.click(screen.getByRole('button', { name: '受控起点' }))
    expect(onAction).toHaveBeenCalledWith({ type: 'music/loop-set', loopMode: 'shuffle' })
    expect(onAction).toHaveBeenCalledWith({ type: 'music/seek-set', startAtSeconds: 27 })

    fireEvent.click(screen.getByRole('button', { name: '创建自定义列表' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'music/playlist-create',
      playlistId: 'playlist-ya-1',
      name: '新列表',
      bvids: [tracks[0]!.bvid, tracks[2]!.bvid],
      now: 1234,
    })
    expect(onAction).toHaveBeenCalledWith({
      type: 'music/playlist-select',
      playlistId: 'playlist-ya-1',
    })
    expect(onPlayerRequested).toHaveBeenLastCalledWith(
      expect.objectContaining({ track: tracks[0], autoplay: true }),
    )
  })

  it('切换曲库立即以持久起点自动请求第一首，并用唯一新 iframe 替换旧请求', () => {
    const state: MusicPlayerState = {
      playlists: {
        'custom-list': {
          id: 'custom-list',
          name: '自定义夜曲',
          bvids: [tracks[2]!.bvid],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      order: ['custom-list'],
      activePlaylistId: null,
      currentBvid: tracks[0]!.bvid,
      currentIndex: 0,
      loopMode: 'list',
      startAtSeconds: 12,
      // 旧存档中的 false 不能关闭产品的自动播放请求。
      autoplay: false,
    }
    const onAction = vi.fn()
    const onPlayerRequested = vi.fn()
    render(
      <BilibiliPlayerProvider
        state={state}
        onAction={onAction}
        builtInTracks={tracks}
        onPlayerRequested={onPlayerRequested}
      >
        <ControlledProbe />
      </BilibiliPlayerProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '受控选择第二首' }))
    const oldIframe = screen.getByTitle('Bilibili 外链播放器：曲目 2')
    expect(new URL((oldIframe as HTMLIFrameElement).src).searchParams.get('t')).toBe('12')

    fireEvent.click(screen.getByRole('button', { name: '切换自定义曲库' }))

    expect(onAction).toHaveBeenCalledWith({
      type: 'music/playlist-select',
      playlistId: 'custom-list',
    })
    expect(onAction).toHaveBeenCalledWith({
      type: 'music/track-select',
      bvid: tracks[2]!.bvid,
      index: 0,
    })
    expect(onPlayerRequested).toHaveBeenLastCalledWith(
      expect.objectContaining({
        track: tracks[2],
        autoplay: true,
        startAtSeconds: 12,
        origin: { kind: 'playlist', playlistName: '自定义夜曲' },
      }),
    )
    expect(screen.queryByTitle('Bilibili 外链播放器：曲目 2')).not.toBeInTheDocument()
    expect(screen.getAllByTitle(/Bilibili 外链播放器/u)).toHaveLength(1)
    const nextIframe = screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：曲目 3')
    const nextUrl = new URL(nextIframe.src)
    expect(nextUrl.searchParams.get('autoplay')).toBe('1')
    expect(nextUrl.searchParams.get('t')).toBe('12')
  })

  it('受控外部选曲覆盖本地旧 iframe 请求，切歌与重开始终以 GameState 为准', () => {
    const initialState: MusicPlayerState = {
      playlists: {},
      order: [],
      activePlaylistId: null,
      currentBvid: tracks[0]!.bvid,
      currentIndex: 0,
      loopMode: 'list',
      startAtSeconds: 0,
      autoplay: true,
    }
    const onAction = vi.fn()
    const onPlayerRequested = vi.fn()
    const renderTree = (state: MusicPlayerState) => (
      <BilibiliPlayerProvider
        state={state}
        onAction={onAction}
        builtInTracks={tracks}
        onPlayerRequested={onPlayerRequested}
      >
        <ControlledProbe />
      </BilibiliPlayerProvider>
    )
    const { rerender } = render(renderTree(initialState))

    fireEvent.click(screen.getByRole('button', { name: '受控选择第二首' }))
    expect(onPlayerRequested).toHaveBeenLastCalledWith(
      expect.objectContaining({ track: tracks[1] }),
    )

    const externallySelectedState: MusicPlayerState = {
      ...initialState,
      currentBvid: tracks[2]!.bvid,
      currentIndex: 2,
    }
    rerender(renderTree(externallySelectedState))
    expect(screen.getByTestId('controlled-selected-bvid')).toHaveTextContent(tracks[2]!.bvid)

    fireEvent.click(screen.getByRole('button', { name: '受控下一首' }))
    expect(onPlayerRequested).toHaveBeenLastCalledWith(
      expect.objectContaining({ track: tracks[0] }),
    )

    fireEvent.click(screen.getByRole('button', { name: '受控从 9 秒重新打开' }))
    expect(onPlayerRequested).toHaveBeenLastCalledWith(
      expect.objectContaining({ track: tracks[2], startAtSeconds: 9 }),
    )
  })
})
