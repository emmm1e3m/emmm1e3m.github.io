import { fireEvent, render, screen, within } from '@testing-library/react'

import type { CollectibleItem, ContentCatalog } from '@/content'
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

function contentCatalog(items: readonly CollectibleItem[]): ContentCatalog {
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

    const dialog = screen.getByRole('dialog', { name: '一路珍藏的风景' })
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
    expect(screen.getByText('最近遇见的回忆排在最前面')).toBeVisible()
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
})
