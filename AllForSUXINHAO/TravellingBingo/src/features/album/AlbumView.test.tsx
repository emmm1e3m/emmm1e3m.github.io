import { fireEvent, render, screen, within } from '@testing-library/react'

import type { BilibiliVideo, CollectibleItem, ContentCatalog } from '@/content'
import { createInitialGameState, type CollectibleCategory, type GameState } from '@/domain'

import { AlbumView } from './AlbumView'

function collectible(id: string, category: CollectibleCategory, title: string): CollectibleItem {
  return {
    id,
    category,
    title,
    alt: `${title}图片`,
    images: [
      {
        width: 480,
        height: 640,
        path: `assets/collectibles/${id}.webp`,
        byteLength: 1,
        mime: 'image/webp',
      },
    ],
    tags: ['测试'],
    source: { url: `https://example.com/${id}` },
  } as CollectibleItem
}

const oldestPostcard = collectible('postcard-old', 'postcard', '最早的明信片')
const newestPostcard = collectible('postcard-new', 'postcard', '最近的明信片')
const millionShot = collectible('million-shot-unowned', 'million-shot', '未获得的百万直拍')
const siteFirst = collectible('site-first-owned', 'site-first', '已经获得的全站第一')

const albumVideo: BilibiliVideo = {
  bvid: 'BV1xx411c7mD',
  title: '收藏里的测试舞台',
  authorName: '苏新皓',
  authorMid: 1,
  publishedAt: '2026-06-19T12:00:00.000Z',
  durationSeconds: 112,
  coverUrl: 'https://i0.hdslb.com/album-video.jpg',
  sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
  favoriteId: 1,
  favoriteOrder: 1,
}

function contentCatalog(
  items: readonly CollectibleItem[],
  videos: readonly BilibiliVideo[] = [],
): ContentCatalog {
  const categoryCounts: Record<CollectibleCategory, number> = {
    postcard: 0,
    'million-shot': 0,
    'site-first': 0,
  }
  for (const item of items) categoryCounts[item.category] += 1
  return {
    items,
    byId: Object.fromEntries(items.map((item) => [item.id, item])),
    categoryCounts,
    siteFirstChronology: items
      .filter((item) => item.category === 'site-first')
      .map((item) => item.id),
    friends: [],
    friendById: {},
    videosByBvid: Object.fromEntries(videos.map((video) => [video.bvid, video])),
    recordPlayerVideos: [],
  }
}

function gameWithCollections(entries: ReadonlyArray<[string, number]>): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'album-regression' })
  return {
    ...game,
    collections: Object.fromEntries(
      entries.map(([id, firstObtainedAt]) => [id, { id, firstObtainedAt, duplicateCount: 0 }]),
    ),
  }
}

function renderAlbum(catalog: ContentCatalog, game: GameState) {
  return render(<AlbumView catalog={catalog} game={game} onClose={vi.fn()} />)
}

describe('饼狗的收藏墙', () => {
  it('只解锁已拥有的分类，不显示未拥有卡片或灰色占位', () => {
    const catalog = contentCatalog([oldestPostcard, newestPostcard, millionShot, siteFirst])
    const game = gameWithCollections([
      [oldestPostcard.id, 1_000],
      [siteFirst.id, 2_000],
    ])
    renderAlbum(catalog, game)

    const dialog = screen.getByRole('dialog', { name: '饼狗的收藏墙' })
    expect(within(dialog).getByRole('tab', { name: '明信片' })).toBeInTheDocument()
    expect(within(dialog).getByRole('tab', { name: '全站第一' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('tab', { name: '百万直拍' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText(millionShot.title)).not.toBeInTheDocument()
    expect(within(dialog).queryByText('???')).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('tab', { name: '全站第一' }))
    expect(within(dialog).getByRole('button', { name: /已经获得的全站第一/u })).toBeVisible()
    expect(within(dialog).queryByText(oldestPostcard.title)).not.toBeInTheDocument()
  })

  it('同一分类按首次获得时间从新到旧排列，同时间按 ID 稳定排序', () => {
    const tieA = collectible('postcard-a', 'postcard', '同刻 A')
    const tieB = collectible('postcard-b', 'postcard', '同刻 B')
    const catalog = contentCatalog([oldestPostcard, tieB, newestPostcard, tieA])
    const game = gameWithCollections([
      [oldestPostcard.id, 1_000],
      [newestPostcard.id, 3_000],
      [tieB.id, 2_000],
      [tieA.id, 2_000],
    ])
    const { container } = renderAlbum(catalog, game)

    const titles = Array.from(container.querySelectorAll('.collectible-card strong')).map(
      (element) => element.textContent,
    )
    expect(titles).toEqual(['最近的明信片', '同刻 A', '同刻 B', '最早的明信片'])
  })

  it('只有当前目录全部集齐时显示动态总数，目录扩容后旧进度仍有效且总数重新隐藏', () => {
    const originalCatalog = contentCatalog([oldestPostcard, newestPostcard, siteFirst])
    const game = gameWithCollections([
      [oldestPostcard.id, 1_000],
      [newestPostcard.id, 2_000],
      [siteFirst.id, 3_000],
    ])
    const { rerender } = renderAlbum(originalCatalog, game)

    expect(screen.getByText('全部集齐 · 3 / 3')).toBeVisible()

    const addedLater = collectible('postcard-added-later', 'postcard', '后来新增的明信片')
    const expandedCatalog = contentCatalog([...originalCatalog.items, addedLater])
    rerender(<AlbumView catalog={expandedCatalog} game={game} onClose={vi.fn()} />)

    expect(screen.queryByText(/3\s*\/\s*4/u)).not.toBeInTheDocument()
    expect(screen.queryByText(addedLater.title)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /最早的明信片/u })).toBeVisible()
  })

  it('空收藏墙不提前透露任何分类和总数', () => {
    renderAlbum(contentCatalog([oldestPostcard, millionShot, siteFirst]), gameWithCollections([]))

    expect(screen.getByRole('button', { name: '关闭收藏墙' })).toHaveFocus()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByText('收藏墙还空着')).toBeVisible()
    expect(screen.queryByText(/\d+\s*\/\s*\d+/u)).not.toBeInTheDocument()
  })

  it('收藏详情只在主动打开播放器时传递收藏 ID 与正确 BV', () => {
    const item = {
      ...collectible('million-shot-video', 'million-shot', '带视频的百万直拍'),
      metadata: { sequence: 1, video: albumVideo },
    } as CollectibleItem
    const catalog = contentCatalog([item], [albumVideo])
    const game = gameWithCollections([[item.id, 1_000]])
    const onPlayerOpened = vi.fn()

    render(
      <AlbumView catalog={catalog} game={game} onClose={vi.fn()} onPlayerOpened={onPlayerOpened} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /带视频的百万直拍/u }))
    fireEvent.click(screen.getByRole('button', { name: '打开播放器' }))

    expect(onPlayerOpened).toHaveBeenCalledOnce()
    expect(onPlayerOpened).toHaveBeenCalledWith(item.id, albumVideo.bvid)

    const iframe = screen.getByTitle('收藏里的测试舞台播放器')
    fireEvent.load(iframe)
    fireEvent.error(iframe)
    fireEvent.abort(iframe)
    expect(onPlayerOpened).toHaveBeenCalledOnce()
  })
})
