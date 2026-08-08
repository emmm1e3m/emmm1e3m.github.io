import { useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { useModalFocus } from '@/components/useModalFocus'
import type { CollectibleItem, ContentCatalog } from '@/content'
import type { CollectibleCategory, GameState } from '@/domain'

import { categoryLabel } from './categoryLabel'
import { CollectiblePicture } from './CollectiblePicture'

const CATEGORY_ORDER: readonly CollectibleCategory[] = ['postcard', 'million-shot', 'site-first']

interface AlbumViewProps {
  catalog: ContentCatalog
  game: GameState
  onClose: () => void
  onInspect?: (item: CollectibleItem) => void
}

export function AlbumView({ catalog, game, onClose, onInspect }: AlbumViewProps) {
  const ownedItems = useMemo(
    () =>
      catalog.items
        .filter((item) => Boolean(game.collections[item.id]))
        .sort((left, right) => {
          const timeDelta =
            game.collections[right.id].firstObtainedAt - game.collections[left.id].firstObtainedAt
          return timeDelta || left.id.localeCompare(right.id)
        }),
    [catalog.items, game.collections],
  )
  const unlockedCategories = CATEGORY_ORDER.filter((category) =>
    ownedItems.some((item) => item.category === category),
  )
  const [category, setCategory] = useState<CollectibleCategory | null>(
    unlockedCategories[0] ?? null,
  )
  const activeCategory =
    category && unlockedCategories.includes(category) ? category : (unlockedCategories[0] ?? null)
  const [selected, setSelected] = useState<CollectibleItem | null>(null)
  const albumCloseRef = useRef<HTMLButtonElement>(null)
  const detailCloseRef = useRef<HTMLButtonElement>(null)
  const albumDialogRef = useModalFocus<HTMLElement>(true, onClose, {
    initialFocus: albumCloseRef,
  })
  const detailDialogRef = useModalFocus<HTMLElement>(Boolean(selected), () => setSelected(null), {
    initialFocus: detailCloseRef,
  })
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const allCollected = catalog.items.length > 0 && ownedItems.length === catalog.items.length
  const visibleItems = activeCategory
    ? ownedItems.filter((item) => item.category === activeCategory)
    : []

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (direction === 0 && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? unlockedCategories.length - 1
          : (index + direction + unlockedCategories.length) % unlockedCategories.length
    setCategory(unlockedCategories[nextIndex])
    tabRefs.current[nextIndex]?.focus()
  }

  function openDetail(item: CollectibleItem) {
    onInspect?.(item)
    setSelected(item)
  }

  return (
    <section
      ref={albumDialogRef}
      className="album-page album-page--v2"
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-title"
      tabIndex={-1}
    >
      <header className="album-header">
        <div>
          <span className="paper-tag">饼狗的收藏墙</span>
          <h2 id="album-title">一路珍藏的风景</h2>
          <p>
            {allCollected
              ? `全部集齐 · ${ownedItems.length} / ${catalog.items.length}`
              : ownedItems.length > 0
                ? '最近遇见的回忆排在最前面'
                : '第一份惊喜还在路上'}
          </p>
        </div>
        <button ref={albumCloseRef} className="text-close-button" type="button" onClick={onClose}>
          关闭收藏墙
        </button>
      </header>

      {unlockedCategories.length > 0 ? (
        <>
          <div className="album-tabs" role="tablist" aria-label="已解锁的收藏分类">
            {unlockedCategories.map((value, index) => (
              <button
                key={value}
                className={activeCategory === value ? 'is-active' : ''}
                type="button"
                role="tab"
                id={`album-tab-${value}`}
                aria-controls="album-panel"
                aria-selected={activeCategory === value}
                tabIndex={activeCategory === value ? 0 : -1}
                ref={(element) => {
                  tabRefs.current[index] = element
                }}
                onKeyDown={(event) => handleTabKey(event, index)}
                onClick={() => setCategory(value)}
              >
                {categoryLabel(value)}
              </button>
            ))}
          </div>

          <div
            className="album-grid"
            id="album-panel"
            role="tabpanel"
            aria-labelledby={`album-tab-${activeCategory}`}
          >
            {visibleItems.map((item) => {
              const entry = game.collections[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`collectible-card is-owned ${item.category === 'site-first' ? 'is-rare' : ''}`}
                  onClick={() => openDetail(item)}
                  aria-label={`${item.title}，${categoryLabel(item.category)}，打开详情`}
                >
                  <span className="collectible-card__visual">
                    <CollectiblePicture item={item} />
                    {item.category === 'site-first' && (
                      <span className="rare-ribbon">全站第一</span>
                    )}
                  </span>
                  <span className="collectible-card__copy">
                    <strong>{item.title}</strong>
                    <small>
                      {entry.duplicateCount > 0
                        ? `又遇见了 ${entry.duplicateCount} 次`
                        : new Intl.DateTimeFormat('zh-CN', {
                            month: 'short',
                            day: 'numeric',
                          }).format(entry.firstObtainedAt)}
                    </small>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="album-empty">
          <span aria-hidden="true">✦</span>
          <h3>收藏墙还空着</h3>
          <p>陪饼狗旅行、刷播和冲热，新的分类会在第一次相遇时悄悄出现。</p>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <article
            ref={detailDialogRef}
            className="collectible-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collectible-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              ref={detailCloseRef}
              className="text-close-button collectible-detail__close"
              type="button"
              onClick={() => setSelected(null)}
            >
              关闭详情
            </button>
            <div className="collectible-detail__image">
              <CollectiblePicture item={selected} large />
            </div>
            <div className="collectible-detail__copy">
              <span className="paper-tag">{categoryLabel(selected.category)}</span>
              <h3 id="collectible-title">{selected.title}</h3>
              <p>{selected.tags.join(' · ')}</p>
              <a href={selected.source.url} target="_blank" rel="noopener noreferrer">
                查看素材来源
              </a>
            </div>
          </article>
        </div>
      )}
    </section>
  )
}
