import { fireEvent, render, screen, within } from '@testing-library/react'

import type { BilibiliVideo, CollectibleItem, ContentCatalog, FriendItem } from '@/content'
import { createInitialGameState, type CollectibleCategory, type GameState } from '@/domain'
import { BilibiliPlayerProvider, PersistentPlayerDock } from '@/features/player'

import albumStyles from './AlbumView.css?raw'
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
  friends: readonly FriendItem[] = [],
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
    friends,
    friendById: Object.fromEntries(friends.map((friend) => [friend.id, friend])),
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

function AlbumHarness({
  catalog,
  game,
  onClose = vi.fn(),
  onPlayerOpened,
}: {
  catalog: ContentCatalog
  game: GameState
  onClose?: () => void
  onPlayerOpened?: (collectionId: string, bvid: string) => void
}) {
  return (
    <BilibiliPlayerProvider
      state={game.musicPlayer}
      onAction={() => undefined}
      builtInTracks={catalog.recordPlayerVideos}
      resolveTrack={(bvid) => catalog.videosByBvid[bvid]}
    >
      <AlbumView catalog={catalog} game={game} onClose={onClose} onPlayerOpened={onPlayerOpened} />
      <PersistentPlayerDock />
    </BilibiliPlayerProvider>
  )
}

function renderAlbum(catalog: ContentCatalog, game: GameState) {
  return render(<AlbumHarness catalog={catalog} game={game} />)
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
    rerender(<AlbumHarness catalog={expandedCatalog} game={game} />)

    expect(screen.queryByText(/3\s*\/\s*4/u)).not.toBeInTheDocument()
    expect(screen.queryByText(addedLater.title)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /最早的明信片/u })).toBeVisible()
  })

  it('空收藏墙不提前透露任何分类和总数', () => {
    renderAlbum(contentCatalog([oldestPostcard, millionShot, siteFirst]), gameWithCollections([]))

    expect(screen.getByRole('button', { name: '关闭收藏墙' })).toHaveFocus()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByText('收藏墙还空着')).toBeVisible()
    expect(screen.getByText('惊喜会在相遇时悄悄出现。')).toBeVisible()
    expect(screen.queryByText(/陪饼狗慢慢生活/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+\s*\/\s*\d+/u)).not.toBeInTheDocument()
  })

  it('分类标题使用展示字体标记，收藏缩略图统一使用 cover', () => {
    const catalog = contentCatalog([oldestPostcard])
    renderAlbum(catalog, gameWithCollections([[oldestPostcard.id, 1_000]]))

    expect(
      screen.getByRole('tab', { name: '明信片' }).querySelector('.album-tab__label'),
    ).not.toBeNull()
    const card = screen.getByRole('button', { name: /最早的明信片/u })
    expect(card.querySelector('img')).toHaveClass(
      'collectible-picture',
      'collectible-picture--cover',
      'collectible-picture--thumbnail',
    )
  })

  it('好友图片使用 cover，卡片只保留相遇次数而不显示收到苹果', () => {
    const friend: FriendItem = {
      id: 'signal-dog',
      name: '信号狗',
      kind: 'dog',
      description: '从信号里跑来的朋友。',
      alt: '信号狗头像',
      image: {
        path: 'assets/friends/signal-dog.webp',
        width: 320,
        height: 480,
        byteLength: 1,
        mime: 'image/webp',
        sha256: '0'.repeat(64),
      },
      sourceCell: 1,
    }
    const catalog = contentCatalog([], [], [friend])
    const initial = gameWithCollections([])
    const game: GameState = {
      ...initial,
      friends: {
        'signal-dog': {
          id: 'signal-dog',
          firstMetAt: 1_000,
          lastMetAt: 2_000,
          encounterCount: 3,
          totalGiftApples: 12,
        },
      },
    }
    renderAlbum(catalog, game)

    expect(screen.getByRole('img', { name: '信号狗头像' })).toHaveClass('friend-card__portrait')
    expect(screen.getByText('见过 3 次')).toBeVisible()
    expect(screen.queryByText(/收到/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/12🍎/u)).not.toBeInTheDocument()
  })

  it('图片详情可进入 contain 全屏，提供同源下载并在关闭后返回图片按钮', () => {
    const catalog = contentCatalog([oldestPostcard])
    renderAlbum(catalog, gameWithCollections([[oldestPostcard.id, 1_000]]))

    fireEvent.click(screen.getByRole('button', { name: /最早的明信片/u }))
    const imageButton = screen.getByRole('button', { name: '全屏查看最早的明信片' })
    imageButton.focus()

    const detailDownload = screen.getByRole('link', { name: '下载完整图片' })
    expect(detailDownload).toHaveAttribute('href', '/assets/collectibles/postcard-old.webp')
    expect(detailDownload).toHaveAttribute('download', 'postcard-old.webp')

    fireEvent.click(imageButton)
    const fullscreen = screen.getByRole('dialog', { name: '最早的明信片完整图片' })
    expect(within(fullscreen).getByRole('button', { name: '退出全屏' })).toHaveFocus()
    expect(within(fullscreen).getByRole('img', { name: /完整图片/u })).toHaveClass(
      'collectible-fullscreen__image',
    )
    expect(within(fullscreen).getByRole('link', { name: '下载完整图片' })).toHaveAttribute(
      'download',
      'postcard-old.webp',
    )

    fireEvent.click(within(fullscreen).getByRole('button', { name: '退出全屏' }))
    expect(imageButton).toHaveFocus()
  })

  it('详情外框按视口使用横屏 16:9 与手机竖屏 9:16，信息区只在内部滚动', () => {
    expect(albumStyles).toContain('--collectible-detail-aspect: 16 / 9;')
    expect(albumStyles).toContain('calc((100dvh - 32px) * 1.7777778)')
    expect(albumStyles).toContain('aspect-ratio: var(--collectible-detail-aspect);')
    expect(albumStyles).toContain(
      '.album-page--v4 .collectible-detail--v4 .collectible-detail__copy {',
    )

    const portraitRules = albumStyles.slice(
      albumStyles.indexOf('@media (max-width: 720px) and (orientation: portrait)'),
      albumStyles.indexOf('@media (max-width: 720px) and (orientation: landscape)'),
    )
    expect(portraitRules).toContain('--collectible-detail-aspect: 9 / 16;')
    expect(portraitRules).toContain('calc((100dvh - 16px) * 0.5625)')
    expect(portraitRules).toContain('overflow-y: auto;')
    expect(portraitRules).toContain('scrollbar-width: none;')
  })

  it('打开收藏详情即请求自动播放，且只传递一次收藏 ID 与正确 BV', () => {
    const item = {
      ...collectible('million-shot-video', 'million-shot', '带视频的百万直拍'),
      metadata: { sequence: 1, video: albumVideo },
    } as CollectibleItem
    const catalog = contentCatalog([item], [albumVideo])
    const game = gameWithCollections([[item.id, 1_000]])
    const onPlayerOpened = vi.fn()

    const onClose = vi.fn()
    const { rerender } = render(
      <AlbumHarness
        catalog={catalog}
        game={game}
        onClose={onClose}
        onPlayerOpened={onPlayerOpened}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /带视频的百万直拍/u }))

    expect(onPlayerOpened).toHaveBeenCalledOnce()
    expect(onPlayerOpened).toHaveBeenCalledWith(item.id, albumVideo.bvid)
    expect(screen.queryByRole('button', { name: '打开播放器' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '关闭播放器' })).not.toBeInTheDocument()

    const detail = screen.getByRole('dialog', { name: '带视频的百万直拍' })
    expect(within(detail).getByText(albumVideo.title)).toHaveClass('bilibili-player-summary')
    const playerDock = screen.getByTestId('persistent-bilibili-player')
    const iframe = screen.getByTitle('Bilibili 外链播放器：收藏里的测试舞台')
    expect(screen.getAllByTestId('persistent-bilibili-player')).toHaveLength(1)
    expect(detail).not.toContainElement(playerDock)
    expect(playerDock.closest('[inert]')).toBeNull()
    fireEvent.load(iframe)
    fireEvent.error(iframe)
    fireEvent.abort(iframe)
    expect(onPlayerOpened).toHaveBeenCalledOnce()

    rerender(
      <AlbumHarness
        catalog={catalog}
        game={{ ...game }}
        onClose={onClose}
        onPlayerOpened={onPlayerOpened}
      />,
    )
    expect(onPlayerOpened).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('button', { name: /(?:打开|关闭|收起)播放器/u }),
    ).not.toBeInTheDocument()

    fireEvent.click(within(detail).getByRole('button', { name: '关闭详情' }))
    expect(screen.queryByRole('dialog', { name: '带视频的百万直拍' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Bilibili 外链播放器：收藏里的测试舞台')).toBe(iframe)

    fireEvent.click(screen.getByRole('button', { name: /带视频的百万直拍/u }))
    expect(screen.getByTitle('Bilibili 外链播放器：收藏里的测试舞台')).toBe(iframe)
    expect(screen.getAllByTestId('persistent-bilibili-player')).toHaveLength(1)
    expect(onPlayerOpened).toHaveBeenCalledOnce()
  })
})
