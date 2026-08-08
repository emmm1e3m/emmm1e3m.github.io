import { fireEvent, render, screen } from '@testing-library/react'

import type { BilibiliVideo } from '@/content'

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

describe('BilibiliPlayer', () => {
  it('用户点击时同步报告一次 BV，iframe 生命周期事件不会重复报告', () => {
    const onOpened = vi.fn()
    render(<BilibiliPlayer video={video} onOpened={onOpened} />)

    expect(screen.queryByTitle('测试舞台播放器')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打开播放器' }))
    expect(onOpened).toHaveBeenCalledOnce()
    expect(onOpened).toHaveBeenCalledWith(video.bvid)

    const iframe = screen.getByTitle<HTMLIFrameElement>('测试舞台播放器')
    expect(iframe.src).toBe(
      'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&p=1&autoplay=0&danmaku=0',
    )
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SMALL' &&
          element.textContent === '苏新皓 · 2026.06.19 · BV1xx411c7mD',
      ),
    ).toBeInTheDocument()

    fireEvent.load(iframe)
    fireEvent.error(iframe)
    fireEvent.abort(iframe)
    expect(onOpened).toHaveBeenCalledOnce()
  })
})
