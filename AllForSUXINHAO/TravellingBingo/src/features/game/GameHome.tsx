import { useEffect, useRef, useState } from 'react'

import { AppleIcon } from '@/components/AppleIcon'
import type { ContentCatalog } from '@/content'
import {
  deriveActivityTiming,
  type ClaimSummary,
  type GameAction,
  type GameState,
  type TaskEvent,
} from '@/domain'
import { AlbumView } from '@/features/album/AlbumView'
import { RewardDialog } from '@/features/rewards/RewardDialog'

import './game-v2.css'

import { ContextPanel } from './ContextPanel'
import { ACTIVITY_COPY, formatCountdown } from './gameCopy'
import { RoomScene } from './RoomScene'
import { areaForActivity, areaForPanel, roomAreaFromLocation, type RoomArea } from './roomConfig'

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

export interface GameHomeProps {
  game: GameState
  catalog: ContentCatalog
  now: number
  panel: PanelId
  dirty: boolean
  reward: ClaimSummary | null
  onPanel: (panel: PanelId) => void
  onAction: (action: GameAction) => void
  onExit: () => void
  onBackup: () => void
  onDismissReward: () => void
  /** 每次成功休息后递增，使日夜过场可在连续休息时重新播放。 */
  restTransitionKey?: number
}

function petLocation(game: GameState) {
  return game.pet.location
}

export function GameHome(props: GameHomeProps) {
  const {
    game,
    catalog,
    now,
    panel,
    dirty,
    reward,
    onPanel,
    onAction,
    onExit,
    onDismissReward,
    restTransitionKey,
  } = props
  const timing = deriveActivityTiming(game.activeActivity, now)
  const activity = game.activeActivity
  const [roomArea, setRoomArea] = useState<RoomArea>(() => roomAreaFromLocation(petLocation(game)))
  const [walking, setWalking] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const walkTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const sleepTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const sleepKey = restTransitionKey ?? game.pet.restCount
  const previousSleepKey = useRef(sleepKey)

  useEffect(() => {
    return () => {
      if (walkTimerRef.current !== null) globalThis.clearTimeout(walkTimerRef.current)
      if (sleepTimerRef.current !== null) globalThis.clearTimeout(sleepTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (sleepKey === previousSleepKey.current) return
    previousSleepKey.current = sleepKey
    setSleeping(true)
    if (sleepTimerRef.current !== null) globalThis.clearTimeout(sleepTimerRef.current)
    sleepTimerRef.current = globalThis.setTimeout(() => setSleeping(false), 2_600)
  }, [sleepKey])

  const displayedRoomArea = activity ? areaForActivity(activity.kind) : roomArea

  function taskEvent(event: TaskEvent) {
    onAction({ type: 'task/event', event, now: Date.now() })
  }

  function moveTo(area: RoomArea) {
    onPanel(area.panel)

    if (area.id === 'bed') {
      if (!activity) {
        setRoomArea(area)
        setWalking(false)
      }
      onAction({ type: 'pet/rest', now: Date.now() })
      return
    }

    if (activity) return

    const changed = roomArea.id !== area.id
    setRoomArea(area)
    if (changed) {
      setWalking(true)
      if (walkTimerRef.current !== null) globalThis.clearTimeout(walkTimerRef.current)
      walkTimerRef.current = globalThis.setTimeout(() => setWalking(false), 620)
    }
    if (area.petLocation !== 'center') {
      onAction({ type: 'room/interact', area: area.petLocation, now: Date.now() })
    }
  }

  function navigate(panelId: PanelId) {
    if (panelId === 'activity' || panelId === 'debug' || panelId === 'status') {
      onPanel(panelId)
      return
    }
    moveTo(areaForPanel(panelId))
  }

  return (
    <main className={`game-page game-page--v2 ${sleeping ? 'is-sleeping' : ''}`}>
      <header className="game-hud game-hud--v2" inert={panel === 'album' ? true : undefined}>
        <button
          className="exit-button exit-button--text"
          type="button"
          onClick={onExit}
          aria-label={`离开铲铲饼屋${dirty ? '，有未导出的进度' : ''}`}
        >
          离开饼屋
          {dirty && <i aria-label="有未导出的进度" />}
        </button>
        <button
          className="hud-activity"
          type="button"
          onClick={() => navigate(activity ? 'activity' : 'status')}
        >
          {activity ? (
            <>
              <span>{ACTIVITY_COPY[activity.kind].verb}</span>
              <strong>
                {timing.phase === 'ready'
                  ? '可以看看结果啦'
                  : formatCountdown(timing.remainingSeconds)}
              </strong>
            </>
          ) : (
            <>
              <span>今天也要</span>
              <strong>好好吃苹果</strong>
            </>
          )}
        </button>
        <button
          className="apple-counter"
          type="button"
          onClick={() => navigate('fridge')}
          aria-label={`有 ${game.economy.apples} 个苹果，打开冰箱`}
        >
          <AppleIcon />
          <strong>{game.economy.apples}</strong>
        </button>
        <button
          className="hud-icon hud-icon--album"
          type="button"
          onClick={() => navigate('album')}
          aria-label="打开收藏墙"
        >
          <span aria-hidden="true">🖼️</span>
        </button>
        {game.profile.debug && (
          <button className="debug-chip" type="button" onClick={() => navigate('debug')}>
            DEBUG
          </button>
        )}
      </header>

      {activity && (
        <button
          className={`activity-ribbon ${timing.phase === 'ready' ? 'is-ready' : ''}`}
          type="button"
          onClick={() => navigate('activity')}
        >
          <span>{ACTIVITY_COPY[activity.kind].verb}</span>
          <span className="activity-ribbon__track">
            <i style={{ width: `${timing.progress * 100}%` }} />
          </span>
          <strong>
            {timing.phase === 'ready' ? '查看结果' : formatCountdown(timing.remainingSeconds)}
          </strong>
        </button>
      )}

      <span className="visually-hidden" role="status" aria-live="polite">
        {activity && timing.phase === 'ready'
          ? `${ACTIVITY_COPY[activity.kind].name}已完成，可以查看结果`
          : sleeping
            ? '饼狗睡着了，房间从夜晚慢慢亮起来'
            : ''}
      </span>

      <div className="game-layout game-layout--v2" inert={panel === 'album' ? true : undefined}>
        <RoomScene
          game={game}
          panel={panel}
          area={displayedRoomArea}
          walking={walking && !activity}
          sleeping={sleeping}
          onArea={moveTo}
          onPanel={navigate}
          onTaskEvent={taskEvent}
        />

        <aside className={`context-panel context-panel--${panel}`}>
          <div className="context-panel__handle" aria-hidden="true" />
          <ContextPanel {...props} onNavigate={navigate} onTaskEvent={taskEvent} />
        </aside>
      </div>

      <nav
        className="mobile-dock mobile-dock--v2"
        aria-label="快捷操作"
        inert={panel === 'album' ? true : undefined}
      >
        <button
          type="button"
          className={panel === 'status' ? 'is-active' : ''}
          onClick={() => navigate('status')}
        >
          房间
        </button>
        <button
          type="button"
          className={panel === 'fridge' ? 'is-active' : ''}
          onClick={() => navigate('fridge')}
        >
          冰箱
        </button>
        <button
          type="button"
          className={panel === 'computer' || panel === 'activity' ? 'is-active' : ''}
          onClick={() => navigate(activity ? 'activity' : 'computer')}
        >
          活动
        </button>
        <button
          type="button"
          className={panel === 'album' ? 'is-active' : ''}
          onClick={() => navigate('album')}
        >
          收藏
        </button>
      </nav>

      {panel === 'album' && (
        <AlbumView
          catalog={catalog}
          game={game}
          onClose={() => onPanel('status')}
          onInspect={(item) =>
            taskEvent({
              type: 'collection-viewed',
              collectionId: item.id,
              category: item.category,
            })
          }
        />
      )}

      {reward && <RewardDialog reward={reward} catalog={catalog} onDismiss={onDismissReward} />}
    </main>
  )
}
