import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { publicAsset } from '@/app/assets'
import { AppleIcon } from '@/components/AppleIcon'
import { MascotSprite, type MascotPose } from '@/components/MascotSprite'
import { useModalFocus } from '@/components/useModalFocus'
import { calculateCollectionProgress, type CollectibleItem, type ContentCatalog } from '@/content'
import {
  deriveActivityTiming,
  ITEM_PRICES,
  type ActivityKind,
  type ClaimSummary,
  type GameAction,
  type GameState,
  type ItemId,
} from '@/domain'

export type PanelId =
  | 'status'
  | 'activity'
  | 'fridge'
  | 'computer'
  | 'travel'
  | 'album'
  | 'wardrobe'
  | 'music'
  | 'rest'
  | 'debug'

interface GameHomeProps {
  game: GameState
  catalog: ContentCatalog
  now: number
  panel: PanelId
  dirty: boolean
  debugDurationMs: number
  reward: ClaimSummary | null
  onPanel: (panel: PanelId) => void
  onAction: (action: GameAction) => void
  onExit: () => void
  onBackup: () => void
  onDebugDuration: (duration: number) => void
  onDismissReward: () => void
}

const ITEM_COPY: Record<ItemId, { name: string; icon: string; note: string }> = {
  'travel-basic': { name: '普通旅行便当', icon: '🍱', note: '出门旅行的基础补给' },
  'travel-apple': { name: '苹果旅行便当', icon: '🥪', note: '旅行时额外带回苹果' },
  'signal-headphones': { name: '信号耳机', icon: '🎧', note: '启动一次刷播' },
  'trend-toolbox': { name: '热度工具箱', icon: '🧰', note: '启动一次冲热' },
  'lucky-apple': { name: '幸运苹果', icon: '🍎', note: '提高抽中新收藏的权重' },
}

const ACTIVITY_COPY: Record<
  ActivityKind,
  { name: string; verb: string; icon: string; note: string; supply: ItemId }
> = {
  travel: {
    name: '出去旅行',
    verb: '旅行中',
    icon: '🧳',
    note: '带回真实照片明信片和苹果，偶尔遇见朋友。',
    supply: 'travel-basic',
  },
  stream: {
    name: '认真刷播',
    verb: '刷播中',
    icon: '🎧',
    note: '有机会获得一张百万直拍纪念海报。',
    supply: 'signal-headphones',
  },
  trend: {
    name: '全力冲热',
    verb: '冲热中',
    icon: '🔥',
    note: '稀有掉落：八项全站第一纪念收藏。',
    supply: 'trend-toolbox',
  },
}

const FRIEND_NAMES: Record<string, string> = {
  'class-representative-bing': '课代饼',
  'san-hao-rabbit': '三好兔',
  'xin-hao-rabbit': '心好兔',
  'signal-dog': '信号狗',
  'bili-bing': '饼哩饼哩',
}

const ALBUM_CATEGORIES = ['postcard', 'million-shot', 'site-first'] as const

const HOTSPOTS: Array<{
  id: PanelId
  label: string
  icon: string
  x: number
  y: number
}> = [
  { id: 'rest', label: '床铺', icon: '☁', x: 30, y: 29 },
  { id: 'computer', label: '电脑', icon: '▶', x: 57, y: 25 },
  { id: 'wardrobe', label: '衣架', icon: '✦', x: 59, y: 41 },
  { id: 'music', label: '电子琴', icon: '♪', x: 27, y: 74 },
  { id: 'fridge', label: '冰箱', icon: '🍎', x: 61, y: 62 },
  { id: 'music', label: '唱片机', icon: '♫', x: 51, y: 70 },
  { id: 'album', label: '收藏墙', icon: '▦', x: 72, y: 61 },
  { id: 'travel', label: '出门', icon: '➜', x: 84, y: 72 },
]

function formatCountdown(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':')
}

function categoryLabel(category: CollectibleItem['category']) {
  if (category === 'postcard') return '明信片'
  if (category === 'million-shot') return '百万直拍'
  return '全站第一'
}

function roomPose(game: GameState, ready: boolean): MascotPose {
  if (ready) return 'celebrate'
  if (game.activeActivity?.kind === 'stream' || game.activeActivity?.kind === 'trend')
    return 'stream'
  if (game.activeActivity?.kind === 'travel') return 'travel'
  return 'idle'
}

function CollectiblePicture({ item, large = false }: { item: CollectibleItem; large?: boolean }) {
  const ordered = [...item.images].sort((left, right) => left.width - right.width)
  const selected = large ? ordered.at(-1)! : ordered[0]
  const srcSet = ordered.map((image) => `${publicAsset(image.path)} ${image.width}w`).join(', ')
  return (
    <img
      src={publicAsset(selected.path)}
      srcSet={srcSet}
      sizes={large ? '(max-width: 720px) 92vw, 760px' : '(max-width: 720px) 44vw, 190px'}
      alt={item.alt}
      width={selected.width}
      height={selected.height}
      loading={large ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}

function AlbumView({
  catalog,
  game,
  onClose,
}: {
  catalog: ContentCatalog
  game: GameState
  onClose: () => void
}) {
  const [category, setCategory] = useState<CollectibleItem['category']>('postcard')
  const [selected, setSelected] = useState<CollectibleItem | null>(null)
  const albumDialogRef = useModalFocus<HTMLElement>(true, onClose)
  const detailDialogRef = useModalFocus<HTMLElement>(Boolean(selected), () => setSelected(null))
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const collectedIds = useMemo(() => new Set(Object.keys(game.collections)), [game.collections])
  const progress = calculateCollectionProgress(catalog, collectedIds)
  const items = catalog.items.filter((item) => item.category === category)

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (direction === 0 && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? ALBUM_CATEGORIES.length - 1
          : (index + direction + ALBUM_CATEGORIES.length) % ALBUM_CATEGORIES.length
    setCategory(ALBUM_CATEGORIES[nextIndex])
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <section
      ref={albumDialogRef}
      className="album-page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-title"
      tabIndex={-1}
    >
      <header className="album-header">
        <div>
          <span className="paper-tag">铲铲饼屋收藏墙</span>
          <h2 id="album-title">一路捡到的喜欢</h2>
          <p>
            已收藏 {progress.collected} / {progress.total} · {progress.percentage}%
          </p>
        </div>
        <button className="round-button" type="button" onClick={onClose} aria-label="关闭收藏墙">
          ×
        </button>
      </header>

      <div className="album-tabs" role="tablist" aria-label="收藏分类">
        {ALBUM_CATEGORIES.map((value, index) => {
          const group = progress.byCategory[value]
          return (
            <button
              key={value}
              className={category === value ? 'is-active' : ''}
              type="button"
              role="tab"
              id={`album-tab-${value}`}
              aria-controls="album-panel"
              aria-selected={category === value}
              tabIndex={category === value ? 0 : -1}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              onKeyDown={(event) => handleTabKey(event, index)}
              onClick={() => setCategory(value)}
            >
              {categoryLabel(value)}{' '}
              <span>
                {group.collected}/{group.total}
              </span>
            </button>
          )
        })}
      </div>

      <div
        className="album-grid"
        id="album-panel"
        role="tabpanel"
        aria-labelledby={`album-tab-${category}`}
      >
        {items.map((item) => {
          const owned = collectedIds.has(item.id)
          const entry = game.collections[item.id]
          return (
            <button
              key={item.id}
              type="button"
              className={`collectible-card ${owned ? 'is-owned' : 'is-locked'} ${item.category === 'site-first' ? 'is-rare' : ''}`}
              disabled={!owned}
              onClick={() => setSelected(item)}
            >
              <span className="collectible-card__visual">
                {owned ? (
                  <CollectiblePicture item={item} />
                ) : (
                  <span className="locked-art" aria-hidden="true">
                    ?
                  </span>
                )}
                {item.category === 'site-first' && <span className="rare-ribbon">★ 全站第一</span>}
              </span>
              <span className="collectible-card__copy">
                <strong>{owned ? item.title : '???'}</strong>
                <small>
                  {owned
                    ? entry.duplicateCount > 0
                      ? `拥有 · 重复 ${entry.duplicateCount} 次`
                      : '第一次相遇'
                    : item.id.replace(/.*-/, '#')}
                </small>
              </span>
            </button>
          )
        })}
      </div>

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
              className="round-button collectible-detail__close"
              type="button"
              onClick={() => setSelected(null)}
              aria-label="关闭详情"
            >
              ×
            </button>
            <div className="collectible-detail__image">
              <CollectiblePicture item={selected} large />
            </div>
            <div className="collectible-detail__copy">
              <span className="paper-tag">{categoryLabel(selected.category)}</span>
              <h3 id="collectible-title">{selected.title}</h3>
              <p>{selected.tags.join(' · ')}</p>
              <a href={selected.source.url} target="_blank" rel="noopener noreferrer">
                查看素材来源 ↗
              </a>
            </div>
          </article>
        </div>
      )}
    </section>
  )
}

function ActivityLauncher({
  kind,
  game,
  debugDurationMs,
  onAction,
  onNeedSupplies,
}: {
  kind: ActivityKind
  game: GameState
  debugDurationMs: number
  onAction: (action: GameAction) => void
  onNeedSupplies: () => void
}) {
  const copy = ACTIVITY_COPY[kind]
  const [travelSupply, setTravelSupply] = useState<ItemId>('travel-basic')
  const [lucky, setLucky] = useState(false)
  const supply = kind === 'travel' ? travelSupply : copy.supply
  const available = game.inventory[supply]
  const canStart = game.activeActivity === null && available > 0

  return (
    <article className="activity-card">
      <div className="activity-card__icon" aria-hidden="true">
        {copy.icon}
      </div>
      <div className="activity-card__copy">
        <h3>{copy.name}</h3>
        <p>{copy.note}</p>
        {kind === 'travel' && (
          <label className="field-label">
            便当
            <select
              value={travelSupply}
              onChange={(event) => setTravelSupply(event.target.value as ItemId)}
            >
              <option value="travel-basic">
                普通旅行便当 · {game.inventory['travel-basic']} 份
              </option>
              <option value="travel-apple">
                苹果旅行便当 · {game.inventory['travel-apple']} 份
              </option>
            </select>
          </label>
        )}
        <label className="check-row">
          <input
            type="checkbox"
            checked={lucky}
            disabled={game.inventory['lucky-apple'] < 1}
            onChange={(event) => setLucky(event.target.checked)}
          />
          带上幸运苹果（库存 {game.inventory['lucky-apple']}）
        </label>
      </div>
      {available > 0 ? (
        <button
          className="paper-button paper-button--primary"
          type="button"
          disabled={!canStart}
          onClick={() =>
            onAction({
              type: 'activity/start',
              kind,
              now: Date.now(),
              supplyId: supply,
              useLuckyApple: lucky,
              debugDurationMs: game.profile.debug ? debugDurationMs : undefined,
            })
          }
        >
          {game.activeActivity
            ? '饼狗正忙'
            : `出发 · ${game.profile.debug ? `${debugDurationMs / 1000} 秒` : '72 分钟'}`}
        </button>
      ) : (
        <button className="paper-button" type="button" onClick={onNeedSupplies}>
          去冰箱买{ITEM_COPY[supply].name}
        </button>
      )}
    </article>
  )
}

function ContextPanel({
  panel,
  game,
  catalog,
  now,
  debugDurationMs,
  onPanel,
  onAction,
  onBackup,
  onDebugDuration,
}: Omit<GameHomeProps, 'dirty' | 'reward' | 'onExit' | 'onDismissReward'>) {
  const timing = deriveActivityTiming(game.activeActivity, now)
  const activity = game.activeActivity

  if (panel === 'fridge') {
    return (
      <div className="context-content">
        <span className="paper-tag">冰箱小卖部</span>
        <h2>给背包装点东西</h2>
        <p className="panel-intro">苹果只在游戏里流通。买好的补给会安静地等下一次出发。</p>
        <div className="shop-list">
          {(Object.keys(ITEM_COPY) as ItemId[]).map((itemId) => {
            const item = ITEM_COPY[itemId]
            const price = ITEM_PRICES[itemId]
            const affordable = game.economy.apples >= price
            return (
              <article className="shop-item" key={itemId}>
                <span className="shop-item__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.note} · 库存 {game.inventory[itemId]}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => onAction({ type: 'item/purchase', itemId })}
                >
                  {affordable ? `${price} 个` : `还差 ${price - game.economy.apples} 个`}
                </button>
              </article>
            )
          })}
        </div>
      </div>
    )
  }

  if (panel === 'computer' || panel === 'travel') {
    const kinds: ActivityKind[] = panel === 'travel' ? ['travel'] : ['stream', 'trend']
    return (
      <div className="context-content">
        <span className="paper-tag">
          {panel === 'travel' ? '门口的旅行计划' : '电脑前的认真时间'}
        </span>
        <h2>{panel === 'travel' ? '想去哪里走走？' : '今天做哪件大事？'}</h2>
        <div className="activity-list">
          {kinds.map((kind) => (
            <ActivityLauncher
              key={kind}
              kind={kind}
              game={game}
              debugDurationMs={debugDurationMs}
              onAction={onAction}
              onNeedSupplies={() => onPanel('fridge')}
            />
          ))}
        </div>
      </div>
    )
  }

  if (panel === 'debug') {
    return (
      <div className="context-content debug-panel">
        <span className="paper-tag paper-tag--debug">DEBUG 门牌</span>
        <h2>把时间拧快一点</h2>
        <p className="panel-intro">调试档会永久带有 DEBUG 标记，不与普通游玩混淆。</p>
        <label className="field-label">
          下一次任务时长
          <select
            value={debugDurationMs}
            onChange={(event) => onDebugDuration(Number(event.target.value))}
          >
            <option value={10_000}>10 秒</option>
            <option value={30_000}>30 秒</option>
            <option value={4_320_000}>72 分钟</option>
          </select>
        </label>
        <div className="debug-actions">
          <button
            type="button"
            onClick={() => onAction({ type: 'debug/apples-adjust', delta: 20 })}
          >
            +20 苹果
          </button>
          <button
            type="button"
            disabled={!activity}
            onClick={() => onAction({ type: 'debug/activity-complete', now: Date.now() })}
          >
            立即完成任务
          </button>
          <button
            type="button"
            onClick={() => {
              if (globalThis.confirm('要把当前目录中的全部收藏加入这个调试档吗？')) {
                onAction({ type: 'debug/collect-all', now: Date.now() })
              }
            }}
          >
            一键全收集
          </button>
          <button type="button" onClick={onBackup}>
            导出调试备份
          </button>
        </div>
      </div>
    )
  }

  if (panel === 'wardrobe' || panel === 'music' || panel === 'rest') {
    const copy = {
      wardrobe: ['奇迹饼狗', '衣架已经整理好啦。正式换装小游戏会在下一阶段打开。', '🧥'],
      music: ['休闲一会儿', '电子琴和唱片机轻轻亮着，音频默认保持安静。', '🎹'],
      rest: ['软乎乎地休息', '饼狗在床边滚成一团，今天的精神也补满了。', '☁️'],
    }[panel]
    return (
      <div className="context-content quiet-panel">
        <span className="quiet-panel__icon" aria-hidden="true">
          {copy[2]}
        </span>
        <h2>{copy[0]}</h2>
        <p>{copy[1]}</p>
        <button className="paper-button" type="button" onClick={() => onPanel('status')}>
          回到房间状态
        </button>
      </div>
    )
  }

  const progress = calculateCollectionProgress(catalog, Object.keys(game.collections))
  return (
    <div className="context-content status-panel">
      <span className="paper-tag">今日的铲铲饼屋</span>
      <h2>{activity ? ACTIVITY_COPY[activity.kind].verb : '饼狗在家'}</h2>
      {activity ? (
        <div className="activity-status-card">
          <span className="activity-status-card__icon" aria-hidden="true">
            {ACTIVITY_COPY[activity.kind].icon}
          </span>
          <div>
            <strong>
              {timing.phase === 'ready' ? '可以领取啦' : formatCountdown(timing.remainingSeconds)}
            </strong>
            <small>
              {ACTIVITY_COPY[activity.kind].name} · {Math.round(timing.progress * 100)}%
            </small>
          </div>
          {timing.phase === 'ready' && (
            <button
              type="button"
              onClick={() => onAction({ type: 'activity/claim', runId: activity.runId, now })}
            >
              领取
            </button>
          )}
        </div>
      ) : (
        <p className="panel-intro">先去冰箱准备补给，再点电脑刷播，或从右侧房门出发旅行。</p>
      )}
      <div className="status-metrics">
        <div>
          <strong>
            {progress.collected}/{progress.total}
          </strong>
          <span>收藏</span>
        </div>
        <div>
          <strong>
            {game.statistics.claimed.travel +
              game.statistics.claimed.stream +
              game.statistics.claimed.trend}
          </strong>
          <span>完成任务</span>
        </div>
        <div>
          <strong>{game.statistics.applesEarned}</strong>
          <span>带回苹果</span>
        </div>
      </div>
      <ol className="demo-route">
        <li className={game.inventory['signal-headphones'] > 0 ? 'is-done' : ''}>
          <span>1</span> 去冰箱买信号耳机
        </li>
        <li className={game.statistics.started.stream > 0 ? 'is-done' : ''}>
          <span>2</span> 在电脑启动一次刷播
        </li>
        <li className={game.statistics.claimed.stream > 0 ? 'is-done' : ''}>
          <span>3</span> 领取海报并打开收藏墙
        </li>
      </ol>
      <div className="button-row">
        <button
          className="paper-button paper-button--primary"
          type="button"
          onClick={() => onPanel('fridge')}
        >
          打开冰箱
        </button>
        <button className="paper-button" type="button" onClick={() => onPanel('computer')}>
          去电脑前
        </button>
      </div>
    </div>
  )
}

export function GameHome(props: GameHomeProps) {
  const { game, catalog, now, panel, dirty, reward, onPanel, onExit, onDismissReward } = props
  const timing = deriveActivityTiming(game.activeActivity, now)
  const activity = game.activeActivity
  const pose = roomPose(game, timing.phase === 'ready')
  const rewardItem = reward?.collection ? catalog.byId[reward.collection.id] : undefined
  const rewardDialogRef = useModalFocus<HTMLElement>(Boolean(reward), onDismissReward)

  return (
    <main className="game-page">
      <header className="game-hud">
        <button
          className="exit-button"
          type="button"
          onClick={onExit}
          aria-label={`离开铲铲饼屋${dirty ? '，有未导出的进度' : ''}`}
        >
          <span aria-hidden="true">←</span>
          <span>离开铲铲饼屋</span>
          {dirty && <i aria-label="有未导出的进度" />}
        </button>
        <button
          className="hud-activity"
          type="button"
          onClick={() => onPanel(activity ? 'activity' : 'computer')}
        >
          {activity ? (
            <>
              <span>{ACTIVITY_COPY[activity.kind].verb}</span>
              <strong>
                {timing.phase === 'ready' ? '可领取' : formatCountdown(timing.remainingSeconds)}
              </strong>
            </>
          ) : (
            <>
              <span>今天也要</span>
              <strong>好好喜欢</strong>
            </>
          )}
        </button>
        <button
          className="apple-counter"
          type="button"
          onClick={() => onPanel('fridge')}
          aria-label={`苹果 ${game.economy.apples} 个，打开冰箱`}
        >
          <AppleIcon />
          <strong>{game.economy.apples}</strong>
        </button>
        <button
          className="hud-icon"
          type="button"
          onClick={() => onPanel('album')}
          aria-label="打开收藏墙"
        >
          ▦
        </button>
        {game.profile.debug && (
          <button className="debug-chip" type="button" onClick={() => onPanel('debug')}>
            DEBUG
          </button>
        )}
      </header>

      {activity && (
        <button
          className={`activity-ribbon ${timing.phase === 'ready' ? 'is-ready' : ''}`}
          type="button"
          onClick={() => onPanel('activity')}
        >
          <span>
            {ACTIVITY_COPY[activity.kind].icon} {ACTIVITY_COPY[activity.kind].verb}
          </span>
          <span className="activity-ribbon__track">
            <i style={{ width: `${timing.progress * 100}%` }} />
          </span>
          <strong>
            {timing.phase === 'ready' ? '领取奖励' : formatCountdown(timing.remainingSeconds)}
          </strong>
        </button>
      )}

      <span className="visually-hidden" role="status" aria-live="polite">
        {activity && timing.phase === 'ready'
          ? `${ACTIVITY_COPY[activity.kind].name}已完成，可以领取`
          : ''}
      </span>

      <div className="game-layout">
        <section className="room-card" aria-label="铲铲饼屋互动场景">
          <picture className="room-picture">
            <source
              srcSet={`${publicAsset('assets/game/chan-chan-house-960.webp')} 960w, ${publicAsset('assets/game/chan-chan-house-1536.webp')} 1536w`}
              sizes="(max-width: 900px) 100vw, 72vw"
            />
            <img
              src={publicAsset('assets/game/chan-chan-house-960.webp')}
              alt="两层铲铲饼屋，家具都可以点击"
              width="960"
              height="640"
            />
          </picture>
          <div className="room-vignette" aria-hidden="true" />
          {HOTSPOTS.map((hotspot) => (
            <button
              key={`${hotspot.id}-${hotspot.label}`}
              className={`room-hotspot ${panel === hotspot.id ? 'is-active' : ''}`}
              data-hotspot={hotspot.label}
              style={{ '--x': `${hotspot.x}%`, '--y': `${hotspot.y}%` } as CSSProperties}
              type="button"
              onClick={() => onPanel(hotspot.id)}
              aria-label={`打开${hotspot.label}`}
            >
              <span aria-hidden="true">{hotspot.icon}</span>
              <small>{hotspot.label}</small>
            </button>
          ))}
          <MascotSprite
            pose={pose}
            className={`room-mascot room-mascot--${activity?.kind ?? 'idle'}`}
            label={
              activity ? `正在${ACTIVITY_COPY[activity.kind].verb}的饼狗` : '在铲铲饼屋里的饼狗'
            }
          />
          {activity?.kind === 'travel' && (
            <span className="travel-note">
              我出门啦
              <br />
              记得想我！
            </span>
          )}
        </section>

        <aside className={`context-panel context-panel--${panel}`}>
          <div className="context-panel__handle" aria-hidden="true" />
          <ContextPanel {...props} />
        </aside>
      </div>

      <nav className="mobile-dock" aria-label="快捷操作">
        <button
          type="button"
          className={panel === 'status' ? 'is-active' : ''}
          onClick={() => onPanel('status')}
        >
          <span>⌂</span>房间
        </button>
        <button
          type="button"
          className={panel === 'fridge' ? 'is-active' : ''}
          onClick={() => onPanel('fridge')}
        >
          <span>🍎</span>冰箱
        </button>
        <button
          type="button"
          className={panel === 'computer' ? 'is-active' : ''}
          onClick={() => onPanel('computer')}
        >
          <span>▶</span>活动
        </button>
        <button
          type="button"
          className={panel === 'album' ? 'is-active' : ''}
          onClick={() => onPanel('album')}
        >
          <span>▦</span>收藏
        </button>
      </nav>

      {panel === 'album' && (
        <AlbumView catalog={catalog} game={game} onClose={() => onPanel('status')} />
      )}

      {reward && (
        <div className="modal-backdrop reward-backdrop" role="presentation">
          <article
            ref={rewardDialogRef}
            className="reward-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reward-title"
            tabIndex={-1}
          >
            <span className="reward-spark reward-spark--left" aria-hidden="true">
              ✦
            </span>
            <span className="reward-spark reward-spark--right" aria-hidden="true">
              ✦
            </span>
            <MascotSprite pose="celebrate" className="reward-mascot" />
            <span className="paper-tag">任务完成</span>
            <h2 id="reward-title">饼狗带东西回来啦！</h2>
            {rewardItem ? (
              <div className="reward-collectible">
                <CollectiblePicture item={rewardItem} />
                <div>
                  <strong>{rewardItem.title}</strong>
                  <span>
                    {categoryLabel(rewardItem.category)}
                    {reward.collection?.duplicate ? ' · 重复收藏' : ' · 新收藏'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="reward-empty">这次没有海报，但努力已经装进小背包了。</p>
            )}
            <p className="reward-apples">
              <AppleIcon /> 带回 {reward.apples.total} 个苹果
            </p>
            {reward.friendEventId && (
              <p className="friend-note">
                路上遇见了 {FRIEND_NAMES[reward.friendEventId] ?? '一位朋友'}。
              </p>
            )}
            <button
              className="paper-button paper-button--primary paper-button--large"
              type="button"
              onClick={onDismissReward}
            >
              收进收藏墙
            </button>
          </article>
        </div>
      )}
    </main>
  )
}
