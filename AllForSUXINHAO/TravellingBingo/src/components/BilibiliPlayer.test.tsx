import { fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'

import type { BilibiliVideo } from '@/content'
import { BilibiliPlayerProvider, createNamedBilibiliPlaylist } from '@/features/player'

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

const collectionOrigin = {
  kind: 'collection',
  collectionId: 'site-first-001',
} as const

describe('BilibiliPlayer', () => {
  it('独立挂载即展示 iframe 并同步报告一次，重渲染和 iframe 事件不重复请求', () => {
    const onOpened = vi.fn()
    const { rerender } = render(
      <BilibiliPlayer
        video={video}
        startAtSeconds={18}
        origin={collectionOrigin}
        onOpened={onOpened}
      />,
    )

    expect(onOpened).toHaveBeenCalledOnce()
    expect(onOpened).toHaveBeenCalledWith(video.bvid)

    const iframe = screen.getByTitle<HTMLIFrameElement>('测试舞台播放器')
    const playerUrl = new URL(iframe.src)
    expect(playerUrl.origin).toBe('https://player.bilibili.com')
    expect(playerUrl.searchParams.get('bvid')).toBe(video.bvid)
    expect(playerUrl.searchParams.get('autoplay')).toBe('1')
    expect(playerUrl.searchParams.get('danmaku')).toBe('0')
    expect(playerUrl.searchParams.get('t')).toBe('18')
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SMALL' &&
          element.textContent === '苏新皓 · 2026.06.19 · BV1xx411c7mD',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /打开|关闭|停止/u })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('已请求自动播放')

    fireEvent.load(iframe)
    fireEvent.error(iframe)
    fireEvent.abort(iframe)
    rerender(
      <BilibiliPlayer
        video={{ ...video }}
        startAtSeconds={18}
        origin={{ ...collectionOrigin }}
        onOpened={onOpened}
      />,
    )
    expect(screen.getByTitle('测试舞台播放器')).toBe(iframe)
    expect(onOpened).toHaveBeenCalledOnce()
  })

  it('共享 Provider 只挂载一个 iframe，详情关闭与同一来源重开都不重载', () => {
    const onOpened = vi.fn()
    const playlist = createNamedBilibiliPlaylist('测试列表', [video])
    const renderTree = (
      detailVisible: boolean,
      collectionId: string = collectionOrigin.collectionId,
    ) => (
      <BilibiliPlayerProvider initialPlaylist={playlist}>
        {detailVisible && (
          <BilibiliPlayer
            video={video}
            origin={{ kind: 'collection', collectionId }}
            onOpened={onOpened}
          />
        )}
      </BilibiliPlayerProvider>
    )
    const strictTree = (detailVisible: boolean, collectionId?: string) => (
      <StrictMode>{renderTree(detailVisible, collectionId)}</StrictMode>
    )
    const { rerender } = render(strictTree(true))

    expect(onOpened).toHaveBeenCalledOnce()
    const iframe = screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：测试舞台')
    expect(screen.getAllByTitle(/播放器/u)).toEqual([iframe])
    expect(new URL(iframe.src).searchParams.get('autoplay')).toBe('1')
    expect(screen.queryByTitle('测试舞台播放器')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '隐藏画面，保持连接' }))
    expect(iframe).toHaveAttribute('tabindex', '-1')

    rerender(strictTree(false))
    expect(screen.getByTitle('Bilibili 外链播放器：测试舞台')).toBe(iframe)
    expect(iframe).toHaveAttribute('tabindex', '-1')

    rerender(strictTree(true))
    expect(screen.getByTitle('Bilibili 外链播放器：测试舞台')).toBe(iframe)
    expect(iframe).toHaveAttribute('tabindex', '0')
    expect(onOpened).toHaveBeenCalledOnce()

    rerender(strictTree(true, 'site-first-002'))
    expect(screen.getByTitle('Bilibili 外链播放器：测试舞台')).not.toBe(iframe)
    expect(onOpened).toHaveBeenCalledTimes(2)
  })
})
