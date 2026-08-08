import { useEffect, useRef, useState } from 'react'

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
import './game-v3.css'

import { ContextPanel } from './ContextPanel'
import { ACTIVITY_COPY } from './gameCopy'
import { GameHud } from './GameHud'
import { HelpDialog } from './HelpDialog'
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
  | 'piano'
  | 'record-player'
  | 'rest'
  | 'debug'

export interface GameHomeProps {
  game: GameState
  catalog: ContentCatalog
  now: number
  panel: PanelId | null
  dirty: boolean
  reward: ClaimSummary | null
  onPanel: (panel: PanelId | null) => void
  onAction: (action: GameAction) => void
  onExit: () => void
  onBackup: () => void
  onDismissReward: () => void
  /** 每次成功休息后递增，使日夜过场可在连续休息时重新播放。 */
  restTransitionKey?: number
}

export function GameHome({
  game,
  catalog,
  now,
  panel,
  dirty,
  reward,
  onPanel,
  onAction,
  onExit,
  onBackup,
  onDismissReward,
  restTransitionKey,
}: GameHomeProps) {
  const activity = game.activeActivity
  const timing = deriveActivityTiming(activity, now)
  const [walking, setWalking] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const walkTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const sleepTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const previousRestTransitionKey = useRef(restTransitionKey)

  useEffect(() => {
    return () => {
      if (walkTimerRef.current !== null) globalThis.clearTimeout(walkTimerRef.current)
      if (sleepTimerRef.current !== null) globalThis.clearTimeout(sleepTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const previous = previousRestTransitionKey.current
    previousRestTransitionKey.current = restTransitionKey
    if (
      restTransitionKey === undefined ||
      previous === undefined ||
      restTransitionKey === previous
    ) {
      return
    }
    setSleeping(true)
    if (sleepTimerRef.current !== null) globalThis.clearTimeout(sleepTimerRef.current)
    sleepTimerRef.current = globalThis.setTimeout(() => setSleeping(false), 2_600)
  }, [restTransitionKey])

  const roomArea = activity
    ? areaForActivity(activity.kind)
    : roomAreaFromLocation(game.pet.location)
  const hasSidePanel = panel !== null && panel !== 'album'
  const overlayOpen = panel === 'album' || helpOpen || reward !== null

  function taskEvent(event: TaskEvent) {
    onAction({ type: 'task/event', event, now: Date.now() })
  }

  function moveTo(area: RoomArea) {
    onPanel(area.panel)
    if (activity) return

    const changed = roomArea.id !== area.id
    if (changed) {
      setWalking(true)
      if (walkTimerRef.current !== null) globalThis.clearTimeout(walkTimerRef.current)
      walkTimerRef.current = globalThis.setTimeout(() => setWalking(false), 620)
    }

    if (area.petLocation !== 'center') {
      onAction({ type: 'room/interact', area: area.petLocation, now: Date.now() })
    }
  }

  function navigate(panelId: PanelId | null) {
    if (panelId === null || panelId === 'activity' || panelId === 'debug' || panelId === 'status') {
      onPanel(panelId)
      return
    }
    moveTo(areaForPanel(panelId))
  }

  return (
    <main
      className={`game-page game-page--v2 game-page--v3 ${hasSidePanel ? 'has-side-panel' : 'is-room-open'} ${sleeping ? 'is-sleeping' : ''}`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || overlayOpen || panel === null) return
        onPanel(null)
      }}
    >
      <GameHud
        game={game}
        activity={activity}
        timing={timing}
        dirty={dirty}
        inert={overlayOpen}
        onExit={onExit}
        onCenter={() => navigate(activity ? 'activity' : 'status')}
        onFridge={() => navigate('fridge')}
        onAlbum={() => navigate('album')}
        onDebug={() => navigate('debug')}
      />

      <span className="visually-hidden" role="status" aria-live="polite">
        {activity && timing.phase === 'ready'
          ? `${ACTIVITY_COPY[activity.kind].name}已经完成，可以查看结果`
          : sleeping
            ? '饼狗睡着了，房间从夜晚慢慢亮起来'
            : ''}
      </span>

      <div
        className={`game-layout game-layout--v2 game-layout--v3 ${hasSidePanel ? 'has-side-panel' : 'is-room-open'}`}
        inert={overlayOpen ? true : undefined}
      >
        <RoomScene
          key={activity?.runId ?? 'idle'}
          game={game}
          panel={panel}
          area={roomArea}
          walking={walking && !activity}
          sleeping={sleeping}
          restDarkness={
            activity?.kind === 'rest' ? Math.min(0.84, 0.16 + timing.progress * 0.68) : 0
          }
          onArea={moveTo}
          onPanel={(nextPanel) => navigate(nextPanel)}
          onBackgroundActivate={() => onPanel(null)}
          onHelp={() => setHelpOpen(true)}
          onTaskEvent={taskEvent}
        />

        {hasSidePanel && panel && (
          <aside className={`context-panel context-panel--${panel}`}>
            <div className="context-panel__handle" aria-hidden="true" />
            <ContextPanel
              panel={panel}
              game={game}
              catalog={catalog}
              now={now}
              onNavigate={navigate}
              onClose={() => onPanel(null)}
              onAction={onAction}
              onBackup={onBackup}
              onTaskEvent={taskEvent}
            />
          </aside>
        )}
      </div>

      {panel === 'album' && (
        <AlbumView
          catalog={catalog}
          game={game}
          onClose={() => onPanel(null)}
          onInspect={(item) =>
            taskEvent({
              type: 'collection-viewed',
              collectionId: item.id,
              category: item.category,
            })
          }
          onPlayerOpened={(collectionId, bvid) =>
            taskEvent({ type: 'collection-player-opened', collectionId, bvid })
          }
        />
      )}

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      {reward && <RewardDialog reward={reward} catalog={catalog} onDismiss={onDismissReward} />}
    </main>
  )
}
