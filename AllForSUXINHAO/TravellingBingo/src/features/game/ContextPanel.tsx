import { useEffect, useMemo, useRef, useState } from 'react'

import { BilibiliPlayer } from '@/components/BilibiliPlayer'
import { PianoKeyboard } from '@/components/PianoKeyboard'
import { calculateCollectionProgress, type BilibiliVideo, type ContentCatalog } from '@/content'
import {
  deriveActivityTiming,
  ITEM_PRICES,
  type ActivityKind,
  type CollectionCatalog,
  type GameAction,
  type GameState,
  type ItemId,
  type PetInterest,
  type TaskEvent,
} from '@/domain'
import { DebugPanel } from '@/features/debug/DebugPanel'
import { TaskBoard } from '@/features/tasks/TaskBoard'

import { ActivityLauncher } from './ActivityLauncher'
import { ACTIVITY_COPY, formatCountdown, ITEM_COPY, STAGE_TEST_URL } from './gameCopy'
import type { PanelId } from './GameHome'

interface ContextPanelProps {
  panel: PanelId
  game: GameState
  catalog: ContentCatalog
  now: number
  onNavigate: (panel: PanelId | null) => void
  onClose: () => void
  onAction: (action: GameAction) => void
  onBackup: () => void
  onTaskEvent: (event: TaskEvent) => void
}

function toDomainCatalog(catalog: ContentCatalog): CollectionCatalog {
  return {
    postcard: catalog.items.filter((item) => item.category === 'postcard').map((item) => item.id),
    'million-shot': catalog.items
      .filter((item) => item.category === 'million-shot')
      .map((item) => item.id),
    'site-first': catalog.items
      .filter((item) => item.category === 'site-first')
      .map((item) => item.id),
    siteFirstChronology: catalog.siteFirstChronology,
  }
}

function PanelHeader({ tag, onClose }: { tag: string; onClose: () => void }) {
  return (
    <div className="context-panel__topline">
      <span className="paper-tag">{tag}</span>
      <button className="context-panel__close" type="button" onClick={onClose}>
        收起信息栏
      </button>
    </div>
  )
}

const INTEREST_COPY: Readonly<
  Record<PetInterest, { label: string; willing: string; reluctant: string }>
> = {
  travel: { label: '出门', willing: '想出去走走', reluctant: '今天更想待在家' },
  computer: { label: '电脑', willing: '愿意认真坐一会儿', reluctant: '今天不想坐在电脑前' },
  music: { label: '音乐', willing: '想让房间有点旋律', reluctant: '今天想安静一点' },
}

function InterestSummary({ game }: { game: GameState }) {
  return (
    <section className="interest-summary" aria-labelledby="interest-title">
      <h3 id="interest-title">饼狗今天的心情</h3>
      <div className="interest-summary__grid">
        {(Object.keys(INTEREST_COPY) as PetInterest[]).map((interest) => {
          const willing = game.pet.preferences[interest] && !game.pet.tired
          const copy = INTEREST_COPY[interest]
          return (
            <div key={interest} className={willing ? 'is-willing' : 'is-reluctant'}>
              <strong>{copy.label}</strong>
              <span>{willing ? copy.willing : copy.reluctant}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RecordPlayerPanel({
  videos,
  onOpened,
}: {
  videos: readonly BilibiliVideo[]
  onOpened: (bvid: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(videos[0]?.bvid ?? null)
  const selected = videos.find((video) => video.bvid === selectedId) ?? videos[0]

  if (!selected) {
    return (
      <div className="record-player-empty" role="status">
        <strong>唱片还在整理</strong>
        <span>等曲目准备好，这里就会响起第一段旋律。</span>
      </div>
    )
  }

  return (
    <div className="record-player-panel">
      <ul
        className="record-track-list"
        aria-label="唱片列表"
        style={{ margin: 0, padding: 0, listStyle: 'none' }}
      >
        {videos.map((video, index) => (
          <li key={video.bvid} style={{ display: 'grid' }}>
            <button
              type="button"
              className={video.bvid === selected.bvid ? 'is-selected' : ''}
              aria-pressed={video.bvid === selected.bvid}
              onClick={() => setSelectedId(video.bvid)}
            >
              <span className="numeric-copy">{String(index + 1).padStart(2, '0')}</span>
              <strong>{video.title}</strong>
            </button>
          </li>
        ))}
      </ul>
      <BilibiliPlayer key={selected.bvid} video={selected} onOpened={onOpened} />
    </div>
  )
}

export function ContextPanel({
  panel,
  game,
  catalog,
  now,
  onNavigate,
  onClose,
  onAction,
  onBackup,
  onTaskEvent,
}: ContextPanelProps) {
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [cancelRunId, setCancelRunId] = useState<string | null>(null)
  const cancelTriggerRef = useRef<HTMLButtonElement>(null)
  const continueActivityRef = useRef<HTMLButtonElement>(null)
  const shouldRestoreCancelFocusRef = useRef(false)
  const timing = deriveActivityTiming(game.activeActivity, now)
  const activity = game.activeActivity
  const activeRunId = activity?.runId ?? null
  const confirmingCancel =
    panel === 'activity' && activeRunId !== null && cancelRunId === activeRunId
  const domainCatalog = useMemo(() => toDomainCatalog(catalog), [catalog])

  useEffect(() => {
    if (confirmingCancel) {
      shouldRestoreCancelFocusRef.current = true
      continueActivityRef.current?.focus()
      return
    }

    if (panel !== 'activity') return

    if (activeRunId === null) {
      shouldRestoreCancelFocusRef.current = false
      return
    }

    if (shouldRestoreCancelFocusRef.current) {
      shouldRestoreCancelFocusRef.current = false
      cancelTriggerRef.current?.focus()
    }
  }, [activeRunId, confirmingCancel, panel])

  if (panel === 'fridge') {
    return (
      <div className="context-content fridge-panel">
        <PanelHeader tag="家里的冰箱" onClose={onClose} />
        <h2>向冰箱中补充道具</h2>
        <p className="panel-intro">把下次想用的补给准备好，饼狗会自己收进小背包。</p>
        <div className="shop-list">
          {(Object.keys(ITEM_COPY) as ItemId[]).map((itemId) => {
            const item = ITEM_COPY[itemId]
            const price = ITEM_PRICES[itemId]
            const affordable = game.economy.apples >= price
            return (
              <article className="shop-item" key={itemId}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.note} · 现有{' '}
                    <span className="numeric-copy">{game.inventory[itemId]}</span> 份
                  </small>
                </div>
                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => onAction({ type: 'item/purchase', itemId })}
                >
                  {affordable ? `${price}🍎` : `还差 ${price - game.economy.apples}🍎`}
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
        <PanelHeader
          tag={panel === 'travel' ? '门口的旅行计划' : '电脑前的认真时间'}
          onClose={onClose}
        />
        <h2>{panel === 'travel' ? '准备好再出门' : '今天想做哪件事'}</h2>
        <div className="activity-list">
          {kinds.map((kind) => (
            <ActivityLauncher
              key={kind}
              kind={kind}
              game={game}
              catalog={domainCatalog}
              onAction={onAction}
              onNeedSupplies={() => onNavigate('fridge')}
              onNeedRest={() => onNavigate('rest')}
            />
          ))}
        </div>
      </div>
    )
  }

  if (panel === 'piano') {
    return (
      <div className="context-content piano-panel">
        <PanelHeader tag="电子琴前" onClose={onClose} />
        <h2>让房间响起一段旋律</h2>
        <PianoKeyboard onNote={(noteId) => onTaskEvent({ type: 'piano-note-played', noteId })} />
        <ActivityLauncher
          kind="music"
          game={game}
          catalog={domainCatalog}
          onAction={onAction}
          onNeedSupplies={() => onNavigate('fridge')}
          onNeedRest={() => onNavigate('rest')}
        />
      </div>
    )
  }

  if (panel === 'record-player') {
    return (
      <div className="context-content record-panel">
        <PanelHeader tag="唱片机旁" onClose={onClose} />
        <h2>挑一张今天想听的唱片</h2>
        <p className="panel-intro">播放器打开后，再从画面里按下播放。</p>
        <RecordPlayerPanel
          videos={catalog.recordPlayerVideos}
          onOpened={(bvid) => onTaskEvent({ type: 'record-player-opened', bvid })}
        />
      </div>
    )
  }

  if (panel === 'activity') {
    return (
      <div className="context-content active-panel">
        <PanelHeader tag="这一次 Bingo" onClose={onClose} />
        <h2>{activity ? ACTIVITY_COPY[activity.kind].verb : '饼狗现在有空'}</h2>
        {activity ? (
          <div className="large-activity-status">
            <span className="numeric-copy">
              {timing.phase === 'ready' ? '已经完成' : formatCountdown(timing.remainingSeconds)}
            </span>
            <div
              className="progress-track"
              aria-label={`活动进度 ${Math.round(timing.progress * 100)}%`}
            >
              <i style={{ width: `${timing.progress * 100}%` }} />
            </div>
            <p>{ACTIVITY_COPY[activity.kind].note}</p>
            {activity.kind === 'music' && (
              <PianoKeyboard
                onNote={(noteId) => onTaskEvent({ type: 'piano-note-played', noteId })}
              />
            )}
            {timing.phase === 'ready' ? (
              <button
                className="paper-button paper-button--primary"
                type="button"
                onClick={() =>
                  onAction({ type: 'activity/claim', runId: activity.runId, now: Date.now() })
                }
              >
                看看这次的结果
              </button>
            ) : null}

            {confirmingCancel ? (
              <div className="activity-cancel-confirm" role="group" aria-label="确认取消活动">
                <strong>确定现在停下来吗？</strong>
                <p>已经带出的补给不会回到冰箱，这次也不会算作相伴的一天。</p>
                <div className="button-row">
                  <button
                    className="paper-button paper-button--danger"
                    type="button"
                    onClick={() =>
                      onAction({ type: 'activity/cancel', runId: activity.runId, now: Date.now() })
                    }
                  >
                    确定取消
                  </button>
                  <button
                    ref={continueActivityRef}
                    className="paper-button"
                    type="button"
                    onClick={() => setCancelRunId(null)}
                  >
                    继续活动
                  </button>
                </div>
              </div>
            ) : (
              <button
                ref={cancelTriggerRef}
                className="text-action text-action--danger"
                type="button"
                onClick={() => setCancelRunId(activity.runId)}
              >
                取消这次活动
              </button>
            )}
          </div>
        ) : (
          <p className="panel-intro">想做什么，就从房间里选一个地方吧。</p>
        )}
      </div>
    )
  }

  if (panel === 'debug') {
    return (
      <div className="context-content debug-panel-shell">
        <PanelHeader tag="调试门牌" onClose={onClose} />
        <DebugPanel game={game} onAction={onAction} onBackup={onBackup} />
      </div>
    )
  }

  if (panel === 'wardrobe') {
    function openStageTest() {
      const popup = globalThis.open(
        '',
        '_blank',
        'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes',
      )
      if (!popup) {
        setPopupBlocked(true)
        return
      }
      try {
        popup.opener = null
      } catch {
        popup.close()
        setPopupBlocked(true)
        return
      }
      popup.location.replace(STAGE_TEST_URL)
      setPopupBlocked(false)
      onTaskEvent({ type: 'stage-test-opened' })
    }

    return (
      <div className="context-content quiet-panel miracle-panel">
        <PanelHeader tag="衣架旁的小卡片" onClose={onClose} />
        <h2>奇迹饼狗</h2>
        <p>什么样的搭配最合适呢？</p>
        <button
          className="paper-button paper-button--primary"
          type="button"
          onClick={openStageTest}
        >
          开始舞台测试
        </button>
        {popupBlocked && (
          <p className="popup-fallback" role="alert">
            弹出窗口被浏览器拦住了。
            <a
              href={STAGE_TEST_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onTaskEvent({ type: 'stage-test-opened' })}
            >
              点这里继续舞台测试
            </a>
          </p>
        )}
      </div>
    )
  }

  if (panel === 'rest') {
    return (
      <div className="context-content quiet-panel rest-panel">
        <PanelHeader tag="软乎乎的床铺" onClose={onClose} />
        <h2>睡一觉再出发</h2>
        <p>窗外会慢慢暗下来再重新亮起，醒来的饼狗也会想好今天愿意做什么。</p>
        <ActivityLauncher
          kind="rest"
          game={game}
          catalog={domainCatalog}
          onAction={onAction}
          onNeedSupplies={() => onNavigate('fridge')}
          onNeedRest={() => undefined}
        />
      </div>
    )
  }

  const progress = calculateCollectionProgress(catalog, Object.keys(game.collections))
  return (
    <div className="context-content status-panel status-panel--v3">
      <PanelHeader tag="今天的铲铲饼屋" onClose={onClose} />
      <h2>{game.profile.displayName}，来看看饼狗吧</h2>
      <p className="panel-intro">
        {activity
          ? `${ACTIVITY_COPY[activity.kind].verb}，点顶栏可以查看进度。`
          : '点房间里的文字标签，饼狗会自己走到那里。'}
      </p>

      <div className="status-metrics">
        <div>
          <strong className="numeric-copy">{progress.collected}</strong>
          <span>珍藏回忆</span>
        </div>
        <div>
          <strong className="numeric-copy">{Object.keys(game.friends).length}</strong>
          <span>认识朋友</span>
        </div>
        <div>
          <strong className="numeric-copy">{game.tasks.completedCount}</strong>
          <span>完成小事</span>
        </div>
      </div>

      <InterestSummary game={game} />
      <TaskBoard game={game} />
    </div>
  )
}
