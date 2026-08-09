import { fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'

import type { BilibiliVideo } from '@/content'
import type { MusicPlayerState } from '@/domain/game/types'
import { BilibiliPlayerProvider, PersistentPlayerDock } from '@/features/player'

import { BilibiliPlayer } from './BilibiliPlayer'

const video: BilibiliVideo = {
  bvid: 'BV1xx411c7mD',
  title: '测试舞台',
  authorName: '苏新皓',
  authorMid: 1,
  publishedAt: '2026-06-19T12:00:00.000Z',
  durationSeconds: 112,
  coverUrl: 'https://i0.hdslb.com/test.jpg',
  sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
  favoriteId: 1,
  favoriteOrder: 1,
}

const playerState: MusicPlayerState = {
  currentBvid: null,
  currentIndex: 0,
  loopMode: 'list',
}

const collectionOrigin = {
  kind: 'collection',
  collectionId: 'site-first-001',
} as const

function renderTree(
  detailVisible: boolean,
  collectionId: string = collectionOrigin.collectionId,
  onOpened = vi.fn(),
) {
  return (
    <StrictMode>
      <BilibiliPlayerProvider state={playerState} onAction={() => undefined} tracks={[video]}>
        {detailVisible && (
          <BilibiliPlayer
            video={video}
            origin={{ kind: 'collection', collectionId }}
            onOpened={onOpened}
          />
        )}
        <PersistentPlayerDock />
      </BilibiliPlayerProvider>
    </StrictMode>
  )
}

describe('BilibiliPlayer', () => {
  it('详情组件只负责选曲，唯一 Dock 承载 iframe 且不展示技术元文案', () => {
    const onOpened = vi.fn()
    render(renderTree(true, collectionOrigin.collectionId, onOpened))

    expect(onOpened).toHaveBeenCalledOnce()
    expect(onOpened).toHaveBeenCalledWith(video.bvid)
    const iframe = screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：测试舞台')
    expect(screen.getAllByTitle(/Bilibili 外链播放器/u)).toEqual([iframe])
    const playerUrl = new URL(iframe.src)
    expect(playerUrl.origin).toBe('https://player.bilibili.com')
    expect(playerUrl.searchParams.get('bvid')).toBe(video.bvid)
    expect(playerUrl.searchParams.get('autoplay')).toBe('1')
    expect(playerUrl.searchParams.get('danmaku')).toBe('0')
    expect(playerUrl.searchParams.get('t')).toBe('0')
    expect(iframe).toHaveAttribute('tabindex', '-1')
    expect(iframe).toHaveAttribute('inert')
    expect(iframe).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText(video.title, { selector: '.bilibili-player-summary' })).toBeVisible()
    expect(screen.queryByText(video.authorName)).not.toBeInTheDocument()
    expect(screen.queryByText(video.bvid)).not.toBeInTheDocument()
    expect(screen.queryByText(/已请求|来源页|跨域|真实进度/u)).not.toBeInTheDocument()
  })

  it('同一详情实例重渲染不重载，重新打开详情或切换来源都从头创建请求', () => {
    const onOpened = vi.fn()
    const { rerender } = render(renderTree(true, collectionOrigin.collectionId, onOpened))
    const iframe = screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：测试舞台')

    fireEvent.click(screen.getByRole('button', { name: '隐藏画面' }))
    expect(iframe).toHaveAttribute('tabindex', '-1')
    rerender(renderTree(false, collectionOrigin.collectionId, onOpened))
    expect(screen.getByTitle('Bilibili 外链播放器：测试舞台')).toBe(iframe)

    rerender(renderTree(true, collectionOrigin.collectionId, onOpened))
    const reopenedIframe = screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：测试舞台')
    expect(reopenedIframe).not.toBe(iframe)
    expect(new URL(reopenedIframe.src).searchParams.get('t')).toBe('0')
    expect(onOpened).toHaveBeenCalledTimes(2)

    rerender(renderTree(true, collectionOrigin.collectionId, onOpened))
    expect(screen.getByTitle('Bilibili 外链播放器：测试舞台')).toBe(reopenedIframe)
    expect(onOpened).toHaveBeenCalledTimes(2)

    rerender(renderTree(true, 'site-first-002', onOpened))
    expect(screen.getByTitle('Bilibili 外链播放器：测试舞台')).not.toBe(reopenedIframe)
    expect(onOpened).toHaveBeenCalledTimes(3)
  })
})
