import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

import { publicAsset } from '@/app/assets'
import { BilibiliPlayer } from '@/components/BilibiliPlayer'
import { useModalFocus } from '@/components/useModalFocus'
import type { CollectibleItem, ContentCatalog } from '@/content'
import type { CollectibleCategory, GameState } from '@/domain'

import './AlbumView.css'

import { categoryLabel } from './categoryLabel'
import { CollectiblePicture } from './CollectiblePicture'

const CATEGORY_ORDER: readonly CollectibleCategory[] = ['postcard', 'million-shot', 'site-first']
const PLAYER_FOCUS_PEER = '[data-modal-focus-peer="persistent-player"]'
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

function largestImage(item: CollectibleItem) {
  return [...item.images].sort((left, right) => right.width - left.width)[0]
}

function downloadFileName(item: CollectibleItem) {
  const image = largestImage(item)
  const extension = image.path.match(/\.[a-z0-9]+$/iu)?.[0] ?? '.webp'
  return `${item.id}${extension}`
}

interface FullscreenPictureProps {
  item: CollectibleItem
  onClose: () => void
  returnFocus: RefObject<HTMLButtonElement | null>
}

function FullscreenPicture({ item, onClose, returnFocus }: FullscreenPictureProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLElement>(true, onClose, {
    initialFocus: closeRef,
    returnFocus,
  })
  const image = largestImage(item)
  const imageUrl = publicAsset(image.path)

  return (
    <div
      className="modal-backdrop collectible-fullscreen-backdrop"
      data-modal-backdrop
      role="presentation"
      onMouseDown={onClose}
    >
      <article
        ref={dialogRef}
        className="collectible-fullscreen"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.title}完整图片`}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="collectible-fullscreen__toolbar">
          <h3>{item.title}</h3>
          <div>
            <a href={imageUrl} download={downloadFileName(item)}>
              下载完整图片
            </a>
            <button ref={closeRef} className="text-close-button" type="button" onClick={onClose}>
              退出全屏
            </button>
          </div>
        </header>
        <figure className="collectible-fullscreen__canvas">
          <img
            className="collectible-fullscreen__image"
            src={imageUrl}
            alt={`${item.alt}（完整图片）`}
            width={image.width}
            height={image.height}
            decoding="async"
          />
        </figure>
      </article>
    </div>
  )
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
  const [imageFullscreen, setImageFullscreen] = useState(false)
  const albumCloseRef = useRef<HTMLButtonElement>(null)
  const detailCloseRef = useRef<HTMLButtonElement>(null)
  const detailImageRef = useRef<HTMLButtonElement>(null)
  const albumDialogRef = useModalFocus<HTMLElement>(true, onClose, {
    initialFocus: albumCloseRef,
    focusPeers: [PLAYER_FOCUS_PEER],
  })
  const closeDetail = () => {
    setImageFullscreen(false)
    setSelected(null)
  }
  const detailDialogRef = useModalFocus<HTMLDivElement>(Boolean(selected), closeDetail, {
    initialFocus: detailCloseRef,
    focusPeers: [PLAYER_FOCUS_PEER],
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
    setImageFullscreen(false)
    setSelected(item)
  }

  const selectedVideo =
    selected && selected.category !== 'postcard'
      ? catalog.videosByBvid[selected.metadata.video.bvid]
      : undefined

  return (
    <section
      ref={albumDialogRef}
      className="album-page album-page--v2 album-page--v3 album-page--v4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-title"
      tabIndex={-1}
    >
      <header className="album-header">
        <div>
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
                <span className="album-tab__label">{tabLabel(value)}</span>
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
                        className="friend-card__portrait"
                        src={publicAsset(friend.image.path)}
                        alt={friend.alt}
                        width={friend.image.width}
                        height={friend.image.height}
                        loading="lazy"
                      />
                      <div>
                        <strong>{friend.name}</strong>
                        <p>{friend.description}</p>
                        <small className="numeric-copy">见过 {entry.encounterCount} 次</small>
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
          <p>惊喜会在相遇时悄悄出现。</p>
        </div>
      )}

      {selected && (
        <div
          ref={detailDialogRef}
          className="modal-backdrop collectible-detail-backdrop"
          data-modal-backdrop
          role="dialog"
          aria-modal="true"
          aria-labelledby="collectible-title"
          tabIndex={-1}
          onMouseDown={closeDetail}
        >
          <article
            className="collectible-detail collectible-detail--v3 collectible-detail--v4"
            data-media-kind={selectedVideo ? 'video' : 'image'}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              ref={detailCloseRef}
              className="text-close-button collectible-detail__close"
              type="button"
              onClick={closeDetail}
            >
              关闭详情
            </button>
            <div className="collectible-detail__image collectible-detail__media">
              <button
                ref={detailImageRef}
                className="collectible-detail__image-button"
                type="button"
                aria-label={`全屏查看${selected.title}`}
                onClick={() => setImageFullscreen(true)}
              >
                <CollectiblePicture item={selected} large />
                <span className="collectible-detail__expand-hint">查看完整图片</span>
              </button>
            </div>
            <div className="collectible-detail__copy">
              <span className="paper-tag">{categoryLabel(selected.category)}</span>
              <h3 id="collectible-title">{selected.title}</h3>
              <p>{selected.tags.join(' · ')}</p>
              {selectedVideo && (
                <BilibiliPlayer
                  video={selectedVideo}
                  origin={{ kind: 'collection', collectionId: selected.id }}
                  onOpened={(bvid) => onPlayerOpened?.(selected.id, bvid)}
                />
              )}
              <div className="collectible-detail__actions">
                <a
                  href={publicAsset(largestImage(selected).path)}
                  download={downloadFileName(selected)}
                >
                  下载完整图片
                </a>
                <a href={selected.source.url} target="_blank" rel="noopener noreferrer">
                  查看素材来源
                </a>
              </div>
            </div>
          </article>
        </div>
      )}

      {selected && imageFullscreen && (
        <FullscreenPicture
          item={selected}
          onClose={() => setImageFullscreen(false)}
          returnFocus={detailImageRef}
        />
      )}
    </section>
  )
}
