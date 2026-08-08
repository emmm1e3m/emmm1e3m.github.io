import { useMemo, useState } from 'react'

import { calculateCollectionProgress, type ContentCatalog } from '@/content'
import {
  deriveActivityTiming,
  ITEM_PRICES,
  type ActivityKind,
  type CollectionCatalog,
  type GameAction,
  type GameState,
  type ItemId,
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
  onNavigate: (panel: PanelId) => void
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

export function ContextPanel({
  panel,
  game,
  catalog,
  now,
  onNavigate,
  onAction,
  onBackup,
  onTaskEvent,
}: ContextPanelProps) {
  const [popupBlocked, setPopupBlocked] = useState(false)
  const timing = deriveActivityTiming(game.activeActivity, now)
  const activity = game.activeActivity
  const domainCatalog = useMemo(() => toDomainCatalog(catalog), [catalog])

  if (panel === 'fridge') {
    return (
      <div className="context-content fridge-panel">
        <span className="paper-tag">家里的冰箱</span>
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
                    {item.note} · 现有 {game.inventory[itemId]} 份
                  </small>
                </div>
                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => onAction({ type: 'item/purchase', itemId })}
                >
                  {affordable
                    ? `补充 · ${price} 个苹果`
                    : `还差 ${price - game.economy.apples} 个苹果`}
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

  if (panel === 'activity') {
    return (
      <div className="context-content active-panel">
        <span className="paper-tag">这一次 Bingo</span>
        <h2>{activity ? ACTIVITY_COPY[activity.kind].verb : '饼狗现在有空'}</h2>
        {activity ? (
          <div className="large-activity-status">
            <span>
              {timing.phase === 'ready' ? '已经完成' : formatCountdown(timing.remainingSeconds)}
            </span>
            <div
              className="progress-track"
              aria-label={`活动进度 ${Math.round(timing.progress * 100)}%`}
            >
              <i style={{ width: `${timing.progress * 100}%` }} />
            </div>
            <p>{ACTIVITY_COPY[activity.kind].note}</p>
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
            ) : (
              <small>饼狗忙完会在这里等你。</small>
            )}
          </div>
        ) : (
          <>
            <p className="panel-intro">想做什么，就从房间里选一个地方吧。</p>
            <div className="button-row">
              <button className="paper-button" type="button" onClick={() => onNavigate('computer')}>
                去电脑前
              </button>
              <button className="paper-button" type="button" onClick={() => onNavigate('travel')}>
                去门口
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  if (panel === 'debug') {
    return <DebugPanel game={game} onAction={onAction} onBackup={onBackup} />
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
        <span className="paper-tag">衣架旁的小卡片</span>
        <h2>奇迹饼狗</h2>
        <p>测试什么样的舞台适合你</p>
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

  if (panel === 'music') {
    return (
      <div className="context-content quiet-panel music-panel">
        <span className="paper-tag">房间里的旋律</span>
        <h2>和饼狗听一会儿</h2>
        <p>电子琴和唱片机都在等你，挑一种今天想听的声音。</p>
        <div className="button-row">
          <button
            className="paper-button"
            type="button"
            onClick={() => onTaskEvent({ type: 'room-visited', area: 'piano' })}
          >
            弹一小段
          </button>
          <button
            className="paper-button"
            type="button"
            onClick={() => onTaskEvent({ type: 'room-visited', area: 'record-player' })}
          >
            放一张唱片
          </button>
        </div>
      </div>
    )
  }

  if (panel === 'rest') {
    return (
      <div className="context-content quiet-panel rest-panel">
        <span className="paper-tag">软乎乎的床铺</span>
        <h2>睡一觉再出发</h2>
        <p>窗外会从夜晚慢慢亮起来，醒来的饼狗也会重新想好今天愿意做什么。</p>
        <button
          className="paper-button paper-button--primary"
          type="button"
          disabled={Boolean(activity)}
          onClick={() => onAction({ type: 'pet/rest', now: Date.now() })}
        >
          {activity ? '等这次活动结束' : '让饼狗睡一觉'}
        </button>
      </div>
    )
  }

  const progress = calculateCollectionProgress(catalog, Object.keys(game.collections))
  return (
    <div className="context-content status-panel status-panel--v2">
      <span className="paper-tag">今天的铲铲饼屋</span>
      <h2>{activity ? ACTIVITY_COPY[activity.kind].verb : '饼狗在家'}</h2>
      {activity ? (
        <button
          className="activity-status-card activity-status-card--button"
          type="button"
          onClick={() => onNavigate('activity')}
        >
          <span>
            <strong>
              {timing.phase === 'ready'
                ? '可以看看结果啦'
                : formatCountdown(timing.remainingSeconds)}
            </strong>
            <small>{ACTIVITY_COPY[activity.kind].name}</small>
          </span>
          <span>{timing.phase === 'ready' ? '领取结果' : '查看进度'}</span>
        </button>
      ) : (
        <p className="panel-intro">
          点房间里的文字标签，饼狗会自己走到那里。点饼狗还能和它商量今天做什么。
        </p>
      )}

      <div className="status-metrics">
        <div>
          <strong>{progress.collected}</strong>
          <span>珍藏回忆</span>
        </div>
        <div>
          <strong>{game.tasks.completedCount}</strong>
          <span>完成小事</span>
        </div>
        <div>
          <strong>{game.pet.restCount}</strong>
          <span>睡过好觉</span>
        </div>
      </div>

      <TaskBoard game={game} />

      <div className="button-row status-actions">
        <button
          className="paper-button paper-button--primary"
          type="button"
          onClick={() => onNavigate('fridge')}
        >
          打开冰箱
        </button>
        <button className="paper-button" type="button" onClick={() => onNavigate('computer')}>
          去电脑前
        </button>
      </div>
    </div>
  )
}
