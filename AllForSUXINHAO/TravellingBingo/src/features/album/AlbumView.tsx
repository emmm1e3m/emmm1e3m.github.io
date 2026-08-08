import { useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { publicAsset } from '@/app/assets'
import { BilibiliPlayer } from '@/components/BilibiliPlayer'
import { useModalFocus } from '@/components/useModalFocus'
import type { CollectibleItem, ContentCatalog } from '@/content'
import type { CollectibleCategory, GameState } from '@/domain'

import { categoryLabel } from './categoryLabel'
import { CollectiblePicture } from './CollectiblePicture'

const CATEGORY_ORDER: readonly CollectibleCategory[] = ['postcard', 'million-shot', 'site-first']
type AlbumTab = CollectibleCategory | 'friends'

interface AlbumViewProps {
  catalog: ContentCatalog
  game: GameState
  onClose: () => void
  onInspect?: (item: CollectibleItem) => void
  onPlayerOpened?: (collectionId: string, bvid: string) => void
}

function numericDate(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function tabLabel(tab: AlbumTab) {
  return tab === 'friends' ? '好朋友们' : categoryLabel(tab)
}

export function AlbumView({ catalog, game, onClose, onInspect, onPlayerOpened }: AlbumViewProps) {
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
  const knownFriends = useMemo(
    () =>
      Object.values(game.friends)
        .filter((entry) => entry !== undefined)
        .sort(
          (left, right) =>
            right.lastMetAt - left.lastMetAt ||
            left.firstMetAt - right.firstMetAt ||
            left.id.localeCompare(right.id),
        ),
    [game.friends],
  )
  const unlockedTabs: AlbumTab[] = [
    ...CATEGORY_ORDER.filter((category) => ownedItems.some((item) => item.category === category)),
    ...(knownFriends.length > 0 ? (['friends'] as const) : []),
  ]
  const [tab, setTab] = useState<AlbumTab | null>(unlockedTabs[0] ?? null)
  const activeTab = tab && unlockedTabs.includes(tab) ? tab : (unlockedTabs[0] ?? null)
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
  const visibleItems =
    activeTab && activeTab !== 'friends'
      ? ownedItems.filter((item) => item.category === activeTab)
      : []

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (direction === 0 && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? unlockedTabs.length - 1
          : (index + direction + unlockedTabs.length) % unlockedTabs.length
    setTab(unlockedTabs[nextIndex])
    tabRefs.current[nextIndex]?.focus()
  }

  function openDetail(item: CollectibleItem) {
    onInspect?.(item)
    setSelected(item)
  }

  const selectedVideo =
    selected && selected.category !== 'postcard'
      ? catalog.videosByBvid[selected.metadata.video.bvid]
      : undefined

  return (
    <section
      ref={albumDialogRef}
      className="album-page album-page--v2 album-page--v3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-title"
      tabIndex={-1}
    >
      <header className="album-header">
        <div>
          <span className="paper-tag">一路捡到的喜欢</span>
          <h2 id="album-title">饼狗的收藏墙</h2>
          {allCollected && <p>{`全部集齐 · ${ownedItems.length} / ${catalog.items.length}`}</p>}
        </div>
        <button ref={albumCloseRef} className="text-close-button" type="button" onClick={onClose}>
          关闭收藏墙
        </button>
      </header>

      {unlockedTabs.length > 0 ? (
        <>
          <div className="album-tabs" role="tablist" aria-label="已解锁的收藏分类">
            {unlockedTabs.map((value, index) => (
              <button
                key={value}
                className={activeTab === value ? 'is-active' : ''}
                type="button"
                role="tab"
                id={`album-tab-${value}`}
                aria-controls="album-panel"
                aria-selected={activeTab === value}
                tabIndex={activeTab === value ? 0 : -1}
                ref={(element) => {
                  tabRefs.current[index] = element
                }}
                onKeyDown={(event) => handleTabKey(event, index)}
                onClick={() => setTab(value)}
              >
                {tabLabel(value)}
              </button>
            ))}
          </div>

          <div
            className={`album-grid ${activeTab === 'friends' ? 'album-grid--friends' : ''}`}
            id="album-panel"
            role="tabpanel"
            aria-labelledby={`album-tab-${activeTab}`}
          >
            {activeTab === 'friends'
              ? knownFriends.map((entry) => {
                  const friend = catalog.friendById[entry.id]
                  if (!friend) return null
                  return (
                    <article className="friend-card" key={entry.id}>
                      <img
                        src={publicAsset(friend.image.path)}
                        alt={friend.alt}
                        width={friend.image.width}
                        height={friend.image.height}
                        loading="lazy"
                      />
                      <div>
                        <strong>{friend.name}</strong>
                        <p>{friend.description}</p>
                        <small className="numeric-copy">
                          见过 {entry.encounterCount} 次 · 收到 {entry.totalGiftApples}🍎
                        </small>
                      </div>
                    </article>
                  )
                })
              : visibleItems.map((item) => {
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
                        <time
                          className="collection-date"
                          dateTime={new Date(entry.firstObtainedAt).toISOString()}
                        >
                          {entry.duplicateCount > 0
                            ? `又遇见了 ${entry.duplicateCount} 次`
                            : numericDate(entry.firstObtainedAt)}
                        </time>
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
          <p>陪饼狗慢慢生活，新的分类和好朋友会在第一次相遇时悄悄出现。</p>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <article
            ref={detailDialogRef}
            className="collectible-detail collectible-detail--v3"
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
              {selectedVideo && (
                <BilibiliPlayer
                  video={selectedVideo}
                  compact
                  onOpened={(bvid) => onPlayerOpened?.(selected.id, bvid)}
                />
              )}
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
