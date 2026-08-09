import { fireEvent, render, screen, within } from '@testing-library/react'

import { BilibiliPlayerProvider } from './BilibiliPlayerProvider'
import { BilibiliPlaylistPanel } from './BilibiliPlaylistPanel'
import { parseBilibiliTrackReference, type BilibiliPlayerTrack } from './playerModel'

const resolvedTrack: BilibiliPlayerTrack = {
  ...parseBilibiliTrackReference('BV1xx411c7mD')!,
  title: '视频一',
  authorName: '测试作者',
}

describe('BilibiliPlaylistPanel', () => {
  it('可访问地命名、逐行解析、去重并以自动播放和指定起点选曲', () => {
    const onPlaylistLoaded = vi.fn()
    render(
      <BilibiliPlayerProvider>
        <BilibiliPlaylistPanel
          resolveTrack={(bvid) => (bvid === resolvedTrack.bvid ? resolvedTrack : undefined)}
          onPlaylistLoaded={onPlaylistLoaded}
        />
      </BilibiliPlayerProvider>,
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

    fireEvent.change(screen.getByLabelText('起播位置（秒）'), {
      target: { value: '12' },
    })
    fireEvent.click(within(trackList).getByRole('button', { name: /视频一/u }))

    const iframe = screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：视频一')
    const url = new URL(iframe.src)
    expect(url.searchParams.get('autoplay')).toBe('1')
    expect(url.searchParams.get('t')).toBe('12')

    fireEvent.click(screen.getByRole('button', { name: '随机' }))
    expect(screen.getByRole('button', { name: '随机' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/不会假装自动续播/u)).toBeInTheDocument()
  })

  it('空输入和空名称使用明确错误，不替换现有列表', () => {
    render(
      <BilibiliPlayerProvider>
        <BilibiliPlaylistPanel initialName="" />
      </BilibiliPlayerProvider>,
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
