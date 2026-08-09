import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import type { GameAction, MusicPlayerState } from '@/domain/game/types'

import { BilibiliPlayerProvider } from './BilibiliPlayerProvider'
import playlistStyles from './BilibiliPlaylistPanel.css?raw'
import { BilibiliPlaylistPanel } from './BilibiliPlaylistPanel'
import type { BilibiliPlayerTrack } from './playerModel'

type MusicAction = Extract<GameAction, { type: `music/${string}` }>

const tracks: readonly BilibiliPlayerTrack[] = [
  {
    bvid: 'BV1xx411c7mD',
    title: '全站第一一号',
    sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD/',
    durationSeconds: 183,
  },
  {
    bvid: 'BV1B7411m7LV',
    title: '全站第一二号',
    sourceUrl: 'https://www.bilibili.com/video/BV1B7411m7LV/',
    durationSeconds: 198,
  },
]

function Harness({ onTrackOpened }: { onTrackOpened?: (bvid: string) => void }) {
  const [state, setState] = useState<MusicPlayerState>({
    currentBvid: null,
    currentIndex: 0,
    loopMode: 'list',
  })
  const apply = (action: MusicAction) => {
    if (action.type === 'music/track-select') {
      setState((current) => ({
        ...current,
        currentBvid: action.bvid,
        currentIndex: action.index,
      }))
    } else if (action.type === 'music/loop-set') {
      setState((current) => ({ ...current, loopMode: action.loopMode }))
    }
  }
  return (
    <BilibiliPlayerProvider state={state} onAction={apply} tracks={tracks}>
      <BilibiliPlaylistPanel onTrackOpened={onTrackOpened} />
    </BilibiliPlayerProvider>
  )
}

describe('BilibiliPlaylistPanel', () => {
  it('只展示唯一全站第一曲库，不再提供自定义 BV 或列表编辑入口', () => {
    render(<Harness />)

    expect(screen.getByRole('heading', { name: '八首全站第一' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('模式、选曲和手动上下首共用唯一曲目顺序', () => {
    const onTrackOpened = vi.fn()
    render(<Harness onTrackOpened={onTrackOpened} />)

    fireEvent.click(screen.getByRole('button', { name: '单曲' }))
    expect(screen.getByRole('button', { name: '单曲' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '全站第一一号' }))
    fireEvent.click(screen.getByRole('button', { name: '下一首' }))
    expect(onTrackOpened).toHaveBeenNthCalledWith(1, tracks[0]!.bvid)
    expect(onTrackOpened).toHaveBeenNthCalledWith(2, tracks[1]!.bvid)

    fireEvent.click(screen.getByRole('button', { name: '上一首' }))
    expect(onTrackOpened).toHaveBeenNthCalledWith(3, tracks[0]!.bvid)
  })

  it('把上一首与下一首收进同一个传输控制组，并保留完整标题提示', () => {
    render(<Harness />)

    const transport = screen.getByRole('group', { name: '上下首' })
    expect(transport).toContainElement(screen.getByRole('button', { name: '上一首' }))
    expect(transport).toContainElement(screen.getByRole('button', { name: '下一首' }))
    expect(screen.getByRole('button', { name: tracks[0]!.title })).toHaveAttribute(
      'title',
      tracks[0]!.title,
    )
  })

  it('外层不裁切按钮向外延伸的全局焦点环', () => {
    const { container } = render(<Harness />)

    expect(container.querySelector('.bilibili-playlist-panel')).toBeInTheDocument()
    expect(playlistStyles).not.toMatch(
      /\.bilibili-playlist-panel\s*\{[^}]*overflow:\s*hidden\s*;/su,
    )
  })
})
