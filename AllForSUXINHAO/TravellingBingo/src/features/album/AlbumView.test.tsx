import { fireEvent, render, screen, within } from '@testing-library/react'

import type { BilibiliVideo, CollectibleItem, ContentCatalog, FriendItem } from '@/content'
import { createInitialGameState, type CollectibleCategory, type GameState } from '@/domain'
import type { GameAction, WardrobePhoto } from '@/domain/game/types'
import { BilibiliPlayerProvider, PersistentPlayerDock } from '@/features/player'

import albumStyles from './AlbumView.css?raw'
import photoPreviewStyles from '@/features/wardrobe/PhotoCompositionPreview.css?raw'
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
    recordPlayerVideos: videos.map((video) => ({ ...video, displayTitle: video.title })),
  }
}

function friend(id: FriendItem['id'], name: string = id): FriendItem {
  return {
    id,
    name,
    kind: 'dog',
    description: `${name}的介绍。`,
    alt: `${name}头像`,
    image: {
      path: `assets/friends/${id}.webp`,
      width: 320,
      height: 480,
      byteLength: 1,
      mime: 'image/webp',
      sha256: '0'.repeat(64),
    },
    sourceCell: 1,
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
  onAction,
}: {
  catalog: ContentCatalog
  game: GameState
  onClose?: () => void
  onPlayerOpened?: (collectionId: string, bvid: string) => void
  onAction?: (action: GameAction) => void
}) {
  return (
    <BilibiliPlayerProvider
      state={game.musicPlayer}
      onAction={() => undefined}
      tracks={catalog.recordPlayerVideos}
    >
      <AlbumView
        catalog={catalog}
        game={game}
        onClose={onClose}
        onPlayerOpened={onPlayerOpened}
        onAction={onAction}
      />
      <PersistentPlayerDock />
    </BilibiliPlayerProvider>
  )
}

function renderAlbum(catalog: ContentCatalog, game: GameState) {
  return render(<AlbumHarness catalog={catalog} game={game} />)
}

describe('饼狗的收藏墙', () => {
  afterEach(() => vi.useRealTimers())

  it('只解锁已拥有的分类，不显示未拥有卡片或灰色占位', () => {
    const catalog = contentCatalog([oldestPostcard, newestPostcard, millionShot, siteFirst])
    const game = gameWithCollections([
      [oldestPostcard.id, 1_000],
      [siteFirst.id, 2_000],
    ])
    renderAlbum(catalog, game)

    const dialog = screen.getByRole('dialog', { name: '饼狗的收藏墙' })
    expect(within(dialog).getByText('收藏进度【2/?】')).toBeVisible()
    expect(within(dialog).getByRole('tab', { name: '明信片【1/?】' })).toBeInTheDocument()
    expect(within(dialog).getByRole('tab', { name: '全站第一【1/1】' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('tab', { name: '百万直拍' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText(millionShot.title)).not.toBeInTheDocument()
    expect(within(dialog).queryByText('???')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/2\/4/u)).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('tab', { name: '全站第一【1/1】' }))
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

    expect(screen.getByText('收藏进度【3/3】')).toBeVisible()

    const addedLater = collectible('postcard-added-later', 'postcard', '后来新增的明信片')
    const expandedCatalog = contentCatalog([...originalCatalog.items, addedLater])
    rerender(<AlbumHarness catalog={expandedCatalog} game={game} />)

    expect(screen.getByText('收藏进度【3/?】')).toBeVisible()
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
      screen.getByRole('tab', { name: '明信片【1/1】' }).querySelector('.album-tab__label'),
    ).not.toBeNull()
    const card = screen.getByRole('button', { name: /最早的明信片/u })
    expect(card.querySelector('img')).toHaveClass(
      'collectible-picture',
      'collectible-picture--cover',
      'collectible-picture--thumbnail',
    )
  })

  it('好友图片使用 cover，卡片只保留相遇次数而不显示收到苹果', () => {
    const signalDog = friend('signal-dog', '信号狗')
    const catalog = contentCatalog([], [], [signalDog])
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

    expect(screen.getByText('收藏进度【1/1】')).toBeVisible()
    expect(screen.getByRole('tab', { name: '好朋友们【1/1】' })).toBeVisible()
    expect(screen.getByRole('img', { name: '信号狗头像' })).toHaveClass('friend-card__portrait')
    expect(screen.getByText('见过 3 次')).toBeVisible()
    expect(screen.queryByText(/收到/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/12🍎/u)).not.toBeInTheDocument()
  })

  it('好友进度在四位时隐藏动态总数，认识目录中的全部好友后才显示五分之五', () => {
    const friends = [
      friend('class-representative-bing', '朋友1'),
      friend('san-hao-rabbit', '朋友2'),
      friend('xin-hao-rabbit', '朋友3'),
      friend('signal-dog', '朋友4'),
      friend('bili-bing', '朋友5'),
    ]
    const catalog = contentCatalog([], [], friends)
    const initial = gameWithCollections([])
    const fourFriends: GameState = {
      ...initial,
      friends: Object.fromEntries(
        friends.slice(0, 4).map((item, index) => [
          item.id,
          {
            id: item.id,
            firstMetAt: 1_000 + index,
            lastMetAt: 2_000 + index,
            encounterCount: 1,
            totalGiftApples: 0,
          },
        ]),
      ),
    }
    const { rerender } = renderAlbum(catalog, fourFriends)

    expect(screen.getByRole('tab', { name: '好朋友们【4/?】' })).toBeVisible()
    expect(screen.getByText('收藏进度【4/?】')).toBeVisible()
    expect(screen.queryByText(/4\/5/u)).not.toBeInTheDocument()

    const allFriends: GameState = {
      ...fourFriends,
      friends: {
        ...fourFriends.friends,
        [friends[4].id]: {
          id: friends[4].id,
          firstMetAt: 1_005,
          lastMetAt: 2_005,
          encounterCount: 1,
          totalGiftApples: 0,
        },
      },
    }
    rerender(<AlbumHarness catalog={catalog} game={allFriends} />)

    expect(screen.getByRole('tab', { name: '好朋友们【5/5】' })).toBeVisible()
    expect(screen.getByText('收藏进度【5/5】')).toBeVisible()
  })

  it('合拍相册使用独立计数，旧合拍按元素快照重建且不随当前造型改变', () => {
    const catalog = contentCatalog([oldestPostcard])
    const initial = gameWithCollections([[oldestPostcard.id, 1_000]])
    const savedPhoto: WardrobePhoto = {
      photoId: 'photo-album-snapshot',
      postcardId: oldestPostcard.id,
      createdAt: 4_000,
      participants: [
        {
          targetId: 'bingo',
          sourceLookId: 'look-current',
          x: 0.5,
          y: 0.58,
          scale: 0.32,
          rotation: 0,
          z: 1,
          elements: [
            {
              placementId: 'saved-glasses',
              assetId: 'round-glasses',
              x: 0.5,
              y: 0.39,
              scale: 0.48,
              rotation: 0,
              z: 2,
            },
          ],
        },
      ],
    }
    const game: GameState = {
      ...initial,
      wardrobe: {
        ...initial.wardrobe,
        photos: { [savedPhoto.photoId]: savedPhoto },
        looks: {
          'look-current': {
            lookId: 'look-current',
            targetId: 'bingo',
            name: '当前造型',
            createdAt: 4_500,
            updatedAt: 5_000,
            elements: [
              {
                placementId: 'current-dress',
                assetId: 'red-ruffle-dress',
                x: 0.5,
                y: 0.56,
                scale: 0.92,
                rotation: 0,
                z: 10,
              },
            ],
          },
        },
      },
    }
    const { container, rerender } = render(<AlbumHarness catalog={catalog} game={game} />)

    expect(screen.getByText('收藏进度【1/1】')).toBeVisible()
    expect(screen.getByRole('tab', { name: '合拍相册【1】' })).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: '合拍相册【1】' }))
    const photoPreview = container.querySelector<HTMLElement>(
      '[data-photo-id="photo-album-snapshot"]',
    )
    expect(photoPreview).not.toBeNull()
    expect(photoPreview?.getAttribute('style')).toContain('aspect-ratio: 480 / 640')
    expect(photoPreviewStyles).toContain('overflow: clip;')
    expect(photoPreviewStyles).toContain('object-fit: fill;')
    expect(screen.getByText('奇迹合拍')).toBeVisible()
    expect(container.querySelector('img[src$="round-glasses.webp"]')).not.toBeNull()
    expect(container.querySelector('img[src$="red-ruffle-dress.webp"]')).toBeNull()

    const changedCurrentLook: GameState = {
      ...game,
      wardrobe: {
        ...game.wardrobe,
        looks: {
          'look-current': {
            lookId: 'look-current',
            targetId: 'bingo',
            name: '后来改过的造型',
            createdAt: 4_500,
            updatedAt: 6_000,
            elements: [
              {
                placementId: 'new-current-look',
                assetId: 'black-stage-suit',
                x: 0.5,
                y: 0.56,
                scale: 0.92,
                rotation: 0,
                z: 10,
              },
            ],
          },
        },
      },
    }
    rerender(<AlbumHarness catalog={catalog} game={changedCurrentLook} />)

    expect(container.querySelector('img[src$="round-glasses.webp"]')).not.toBeNull()
    expect(container.querySelector('img[src$="black-stage-suit.webp"]')).toBeNull()
    expect(screen.getByText('收藏进度【1/1】')).toBeVisible()
  })

  it('合拍详情删除时只派发目标 photoId，失效明信片仍显示暖白预览', () => {
    const catalog = contentCatalog([oldestPostcard])
    const initial = gameWithCollections([])
    const photo: WardrobePhoto = {
      photoId: 'photo-delete-target',
      postcardId: null,
      createdAt: 7_000,
      participants: [
        {
          targetId: 'bingo',
          sourceLookId: null,
          x: 0.5,
          y: 0.58,
          scale: 0.32,
          rotation: 0,
          z: 1,
          elements: [],
        },
      ],
    }
    const game: GameState = {
      ...initial,
      wardrobe: { ...initial.wardrobe, photos: { [photo.photoId]: photo } },
    }
    const onAction = vi.fn()
    const { container } = render(<AlbumHarness catalog={catalog} game={game} onAction={onAction} />)

    fireEvent.click(screen.getByRole('tab', { name: '合拍相册【1】' }))
    fireEvent.click(screen.getByRole('button', { name: /打开详情/u }))
    expect(
      within(screen.getByRole('dialog', { name: '奇迹合拍' })).getByRole('heading', {
        name: '奇迹合拍',
      }),
    ).toBeVisible()
    expect(screen.getByText(/原来的明信片暂时找不到了/u)).toBeVisible()
    expect(
      container.querySelector('.wardrobe-photo-detail__preview img[src*="postcard"]'),
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '删除这张合拍' }))
    expect(onAction).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledWith({
      type: 'wardrobe/photo-delete',
      photoId: 'photo-delete-target',
    })
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

  it('同一收藏详情重渲染不重复请求，但关闭后再点会清空暂停进度并从 0 秒播放', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
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
    vi.advanceTimersByTime(12_500)
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

    fireEvent.click(screen.getByRole('button', { name: '暂停播放' }))
    expect(screen.queryByTitle('Bilibili 外链播放器：收藏里的测试舞台')).not.toBeInTheDocument()

    fireEvent.click(within(detail).getByRole('button', { name: '关闭详情' }))
    expect(screen.queryByRole('dialog', { name: '带视频的百万直拍' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /带视频的百万直拍/u }))
    const restartedIframe =
      screen.getByTitle<HTMLIFrameElement>('Bilibili 外链播放器：收藏里的测试舞台')
    expect(restartedIframe).not.toBe(iframe)
    expect(new URL(restartedIframe.src).searchParams.get('t')).toBe('0')
    expect(screen.getAllByTestId('persistent-bilibili-player')).toHaveLength(1)
    expect(onPlayerOpened).toHaveBeenCalledTimes(2)
    expect(onPlayerOpened).toHaveBeenLastCalledWith(item.id, albumVideo.bvid)
  })
})
