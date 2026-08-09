import { fireEvent, render, screen, within } from '@testing-library/react'
import { type PropsWithChildren, useState } from 'react'

import type { GameAction, MusicPlayerState } from '@/domain/game/types'

import { BilibiliPlayerProvider, PersistentPlayerDock } from './BilibiliPlayerProvider'
import { BilibiliPlaylistPanel } from './BilibiliPlaylistPanel'
import { parseBilibiliTrackReference, type BilibiliPlayerTrack } from './playerModel'

type MusicPlayerAction = Extract<GameAction, { type: `music/${string}` }>

const resolvedTrack: BilibiliPlayerTrack = {
  ...parseBilibiliTrackReference('BV1xx411c7mD')!,
  title: '视频一',
  authorName: '测试作者',
  durationSeconds: 21,
}

function PanelHarness({ children }: PropsWithChildren) {
  const [state, setState] = useState<MusicPlayerState>({
    playlists: {},
    order: [],
    activePlaylistId: null,
    currentBvid: null,
    currentIndex: 0,
    loopMode: 'list',
  })

  function onAction(action: MusicPlayerAction) {
    setState((current) => {
      switch (action.type) {
        case 'music/playlist-create':
          return {
            ...current,
            playlists: {
              ...current.playlists,
              [action.playlistId]: {
                id: action.playlistId,
                name: action.name,
                bvids: [...(action.bvids ?? [])],
                createdAt: action.now,
                updatedAt: action.now,
              },
            },
            order: [...current.order, action.playlistId],
          }
        case 'music/playlist-select':
          return { ...current, activePlaylistId: action.playlistId }
        case 'music/track-select':
          return { ...current, currentBvid: action.bvid, currentIndex: action.index }
        case 'music/loop-set':
          return { ...current, loopMode: action.loopMode }
        default:
          return current
      }
    })
  }

  return (
    <BilibiliPlayerProvider
      state={state}
      onAction={onAction}
      resolveTrack={(bvid) => (bvid === resolvedTrack.bvid ? resolvedTrack : undefined)}
      now={() => 1234}
    >
      {children}
      <PersistentPlayerDock />
    </BilibiliPlayerProvider>
  )
}

describe('BilibiliPlaylistPanel', () => {
  it('可访问地命名、逐行解析、去重并立即选中第一首', () => {
    const onPlaylistLoaded = vi.fn()
    render(
      <PanelHarness>
        <BilibiliPlaylistPanel
          resolveTrack={(bvid) => (bvid === resolvedTrack.bvid ? resolvedTrack : undefined)}
          onPlaylistLoaded={onPlaylistLoaded}
        />
      </PanelHarness>,
    )

    fireEvent.change(screen.getByLabelText('播放列表名称'), {
      target: { value: '  舞台   收藏  ' },
    })
    fireEvent.change(screen.getByLabelText('BV 号或视频链接'), {
      target: {
        value: [
          'BV1xx411c7mD',
          'https://www.bilibili.com/video/BV1B7411m7LV',
          'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD',
          'https://b23.tv/unresolved',
        ].join('\n'),
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '载入这个列表' }))

    expect(screen.getByText('已载入 2 首；去重 1 行；跳过 1 行。')).toBeVisible()
    expect(screen.getByRole('list', { name: '未载入的行' })).toHaveTextContent(
      '第 4 行：短链接不含 BV 号',
    )
    expect(screen.getByRole('heading', { name: '舞台 收藏' })).toBeInTheDocument()
    const trackList = screen.getByRole('list', { name: '舞台 收藏曲目' })
    expect(within(trackList).getAllByRole('button')).toHaveLength(2)
    expect(onPlaylistLoaded).toHaveBeenCalledWith('舞台 收藏', ['BV1xx411c7mD', 'BV1B7411m7LV'])
    expect(screen.getByTitle('Bilibili 外链播放器：视频一')).toBeInTheDocument()

    expect(screen.queryByLabelText('起播位置（秒）')).not.toBeInTheDocument()
    expect(screen.queryByText('从这里重新打开')).not.toBeInTheDocument()
    expect(screen.queryByText(/外链播放器不会/u)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '随机' }))
    expect(screen.getByRole('button', { name: '随机' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('空输入和空名称使用明确错误，不替换现有列表', () => {
    render(
      <PanelHarness>
        <BilibiliPlaylistPanel initialName="" />
      </PanelHarness>,
    )

    fireEvent.click(screen.getByRole('button', { name: '载入这个列表' }))
    expect(screen.getByRole('alert')).toHaveTextContent('没有找到可以加入播放列表')

    fireEvent.change(screen.getByLabelText('BV 号或视频链接'), {
      target: { value: 'BV1xx411c7mD' },
    })
    fireEvent.click(screen.getByRole('button', { name: '载入这个列表' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请为播放列表取一个名字')
    expect(screen.getByRole('status')).toHaveTextContent('列表还是空的')
  })
})
