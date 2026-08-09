import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { BilibiliVideoMetadata, ContentCatalog } from '@/content'
import {
  deriveActivityTiming,
  type ActivityKind,
  type ClaimSummary,
  type GameAction,
  type GameState,
  type PetInterest,
  type RealityRewardDecision,
  type TaskEvent,
} from '@/domain'
import { AlbumView } from '@/features/album/AlbumView'
import {
  BilibiliPlayerProvider,
  PersistentPlayerDock,
  useBilibiliPlayerController,
  type BilibiliPlayerTrack,
} from '@/features/player'
import {
  PomodoroFocusOverlay,
  RealityReturnDialog,
  RealitySettlementResultDialog,
  buildRealityTodoViews,
  buildUnlockedPostcardBackgrounds,
  type RealityNotificationPermission,
} from '@/features/reality'
import { RewardDialog } from '@/features/rewards/RewardDialog'

import './game-v2.css'
import './game-v3.css'
import './game-v4.css'

import { ContextPanel } from './ContextPanel'
import { detectPcBrowser } from './browserPlatform'
import { DimensionDialog, type DimensionDialogMode } from './DimensionDialog'
import { ACTIVITY_COPY, formatCountdown } from './gameCopy'
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
  | 'reality-data'
  | 'reality-work'
  | 'debug'

export interface VitalityPromptRequest {
  token: number
  panel: PanelId
  /** 共享一个意愿的设施可能对应多个活动，此时不替用户猜选具体活动。 */
  kind: ActivityKind | null
  interest: PetInterest
}

export interface RealitySettlementResult {
  decision: RealityRewardDecision
  awardedApples: number
  fullRewardApples: number
}

export interface GameHomeProps {
  game: GameState
  catalog: ContentCatalog
  now: number
  panel: PanelId | null
  dirty: boolean
  reward: ClaimSummary | null
  realitySettlementResult?: RealitySettlementResult | null
  onPanel: (panel: PanelId | null) => void
  onAction: (action: GameAction) => void
  onExit: () => void
  onBackup: () => void
  onDismissReward: () => void
  onDismissRealitySettlementResult?: () => void
  notificationPermission?: RealityNotificationPermission
  onRequestNotificationPermission?: () => void
  canEnterReality?: () => boolean
  /** 每次成功休息后递增，使日夜过场可在连续休息时重新播放。 */
  restTransitionKey?: number
}

function toPlayerTrack(video: BilibiliVideoMetadata): BilibiliPlayerTrack {
  return {
    bvid: video.bvid,
    title: video.title,
    sourceUrl: video.sourceUrl,
    authorName: video.authorName,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
  }
}

function ActivePomodoroOverlay({
  game,
  catalog,
  now,
  onAction,
  onTaskEvent,
}: {
  game: GameState
  catalog: ContentCatalog
  now: number
  onAction: (action: GameAction) => void
  onTaskEvent: (event: TaskEvent) => void
}) {
  const controller = useBilibiliPlayerController()
  const session = game.reality.pomodoro.session
  if (!session || session.status === 'completed') return null

  const background =
    buildUnlockedPostcardBackgrounds(game, catalog).find(
      (item) => item.id === session.postcardId,
    ) ?? null
  const deadline = session.status === 'focus' ? session.focusEndsAt : session.cycleEndsAt

  return (
    <PomodoroFocusOverlay
      session={{
        sessionId: session.sessionId,
        status: session.status,
        statusLabel: session.status === 'focus' ? '专注中' : '休息中',
        remainingLabel: formatCountdown(Math.ceil(Math.max(0, deadline - now) / 1_000)),
        focusDurationMs: session.focusDurationMs,
        breakDurationMs: session.breakDurationMs,
      }}
      background={background}
      todos={buildRealityTodoViews(game)}
      playerExpanded={Boolean(controller.state.activeRequest && controller.state.dockExpanded)}
      musicStarter={
        controller.state.activeRequest ? undefined : (
          <button
            className="reality-primary-button pomodoro-focus__start-music"
            type="button"
            onClick={() => {
              const request = controller.selectPlaylist(null)
              if (request) onTaskEvent({ type: 'record-player-opened', bvid: request.track.bvid })
            }}
          >
            播放全站第一
          </button>
        )
      }
      onTodoCompletionChange={(todoId, completed) =>
        onAction({ type: 'todo/completion-set', todoId, completed, now: Date.now() })
      }
      onCancel={(sessionId) => onAction({ type: 'pomodoro/cancel', sessionId, now: Date.now() })}
    />
  )
}

export function GameHome({
  game,
  catalog,
  now,
  panel,
  dirty,
  reward,
  realitySettlementResult = null,
  onPanel,
  onAction,
  onExit,
  onBackup,
  onDismissReward,
  onDismissRealitySettlementResult,
  notificationPermission = 'unsupported',
  onRequestNotificationPermission,
  canEnterReality = detectPcBrowser,
  restTransitionKey,
}: GameHomeProps) {
  const activity = game.activeActivity
  const timing = deriveActivityTiming(activity, now)
  const [walking, setWalking] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [dimensionDialog, setDimensionDialog] = useState<DimensionDialogMode | null>(null)
  const [cancelRequest, setCancelRequest] = useState<{ token: number; runId: string } | null>(null)
  const [pomodoroCancelRequest, setPomodoroCancelRequest] = useState<{
    token: number
    sessionId: string
  } | null>(null)
  const [vitalityPromptRequest, setVitalityPromptRequest] = useState<VitalityPromptRequest | null>(
    null,
  )
  const walkTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const sleepTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const cancelRequestSequenceRef = useRef(0)
  const pomodoroCancelRequestSequenceRef = useRef(0)
  const vitalityPromptSequenceRef = useRef(0)
  const dimensionToggleRef = useRef<HTMLButtonElement>(null)
  const previousRestTransitionKey = useRef(restTransitionKey)
  const builtInPlayerTracks = useMemo(
    () => catalog.recordPlayerVideos.map(toPlayerTrack),
    [catalog.recordPlayerVideos],
  )
  const resolvePlayerTrack = useCallback(
    (bvid: string) => {
      const video = catalog.videosByBvid[bvid]
      return video ? toPlayerTrack(video) : undefined
    },
    [catalog.videosByBvid],
  )

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
  const pendingRealitySettlement = game.reality.pendingSettlement
  const pomodoroActive =
    game.reality.pomodoro.session !== null && game.reality.pomodoro.session.status !== 'completed'
  const realityBlocked = game.world === 'reality' && !canEnterReality()
  const visibleDimensionDialog: DimensionDialogMode | null = realityBlocked
    ? 'return-required'
    : dimensionDialog
  const overlayOpen =
    panel === 'album' ||
    helpOpen ||
    reward !== null ||
    realitySettlementResult !== null ||
    pendingRealitySettlement !== null ||
    visibleDimensionDialog !== null ||
    pomodoroActive

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

  function requestActivityCancel() {
    if (!activity) return
    cancelRequestSequenceRef.current += 1
    setCancelRequest({ token: cancelRequestSequenceRef.current, runId: activity.runId })
    onPanel('activity')
  }

  function requestPomodoroCancel() {
    const session = game.reality.pomodoro.session
    if (!session || session.status === 'completed') return
    pomodoroCancelRequestSequenceRef.current += 1
    setPomodoroCancelRequest({
      token: pomodoroCancelRequestSequenceRef.current,
      sessionId: session.sessionId,
    })
    navigate('reality-work')
  }

  function requestVitalityPrompt(area: RoomArea) {
    if (!area.interest || game.world !== 'game') return
    vitalityPromptSequenceRef.current += 1
    setVitalityPromptRequest({
      token: vitalityPromptSequenceRef.current,
      panel: area.panel,
      kind: area.activityKinds?.length === 1 ? area.activityKinds[0]! : null,
      interest: area.interest,
    })
  }

  function toggleDimension() {
    if (pendingRealitySettlement) return
    if (game.world === 'reality') {
      onPanel(null)
      onAction({ type: 'reality/leave', now: Date.now() })
      return
    }

    setDimensionDialog(canEnterReality() ? 'confirm-enter' : 'pc-required')
  }

  const vitality = game.player.effects.vitality
  const vitalityDays = vitality
    ? Math.max(0, vitality.expiresAfterCompanionDay - game.profile.companionDays)
    : 0
  const petStatusLabel = activity
    ? timing.phase === 'ready'
      ? `${ACTIVITY_COPY[activity.kind].name}完成了`
      : ACTIVITY_COPY[activity.kind].verb
    : vitalityDays > 0
      ? '活力满满'
      : game.pet.tired
        ? '今天想先休息'
        : '状态很好'

  return (
    <BilibiliPlayerProvider
      state={game.musicPlayer}
      onAction={onAction}
      builtInTracks={builtInPlayerTracks}
      resolveTrack={resolvePlayerTrack}
    >
      <main
        className={`game-page game-page--v2 game-page--v3 game-page--v4 ${hasSidePanel ? 'has-side-panel' : 'is-room-open'} ${sleeping ? 'is-sleeping' : ''}`}
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
          statusLabel={petStatusLabel}
          vitalityDays={vitalityDays}
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
          className={`game-layout game-layout--v2 game-layout--v3 game-layout--v4 ${hasSidePanel ? 'has-side-panel' : 'is-room-open'}`}
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
            onReluctantArea={requestVitalityPrompt}
            onPanel={(nextPanel) => navigate(nextPanel)}
            onBackgroundActivate={() => onPanel('status')}
            onHelp={() => setHelpOpen(true)}
            dimensionToggleRef={dimensionToggleRef}
            dimensionToggleDisabled={pendingRealitySettlement !== null}
            onToggleDimension={toggleDimension}
            onRequestCancelActivity={requestActivityCancel}
            pomodoroRunning={pomodoroActive}
            onRequestCancelPomodoro={requestPomodoroCancel}
            onTaskEvent={taskEvent}
          />

          {hasSidePanel && panel && (
            <div className="context-stack">
              <aside className={`context-panel context-panel--v4 context-panel--${panel}`}>
                <div className="context-panel__handle" aria-hidden="true" />
                <ContextPanel
                  panel={panel}
                  game={game}
                  catalog={catalog}
                  now={now}
                  onNavigate={navigate}
                  onAction={onAction}
                  onBackup={onBackup}
                  onTaskEvent={taskEvent}
                  cancelRequestToken={
                    activity && cancelRequest && activity.runId === cancelRequest.runId
                      ? cancelRequest.token
                      : null
                  }
                  onCancelRequestHandled={(token) => {
                    setCancelRequest((current) => (current?.token === token ? null : current))
                  }}
                  pomodoroCancelRequestToken={
                    game.reality.pomodoro.session !== null &&
                    game.reality.pomodoro.session.status !== 'completed' &&
                    pomodoroCancelRequest?.sessionId === game.reality.pomodoro.session.sessionId
                      ? pomodoroCancelRequest.token
                      : null
                  }
                  onPomodoroCancelRequestHandled={(token) => {
                    setPomodoroCancelRequest((current) =>
                      current?.token === token ? null : current,
                    )
                  }}
                  vitalityPromptRequest={
                    vitalityPromptRequest?.panel === panel ? vitalityPromptRequest : null
                  }
                  onVitalityPromptRequestHandled={(token) => {
                    setVitalityPromptRequest((current) =>
                      current?.token === token ? null : current,
                    )
                  }}
                  notificationPermission={notificationPermission}
                  onRequestNotificationPermission={onRequestNotificationPermission}
                />
              </aside>
            </div>
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

        <HelpDialog open={helpOpen} world={game.world} onClose={() => setHelpOpen(false)} />
        {visibleDimensionDialog && (
          <DimensionDialog
            mode={visibleDimensionDialog}
            onCancel={() => setDimensionDialog(null)}
            onConfirm={() => {
              if (visibleDimensionDialog === 'pc-required') {
                setDimensionDialog(null)
                return
              }

              if (visibleDimensionDialog === 'return-required') {
                onPanel(null)
                onAction({ type: 'reality/leave', now: Date.now() })
                return
              }

              if (!canEnterReality()) {
                setDimensionDialog('pc-required')
                return
              }

              setDimensionDialog(null)
              onPanel(null)
              onAction({ type: 'reality/enter', now: Date.now() })
            }}
          />
        )}
        {reward && <RewardDialog reward={reward} catalog={catalog} onDismiss={onDismissReward} />}
        {realitySettlementResult && (
          <RealitySettlementResultDialog
            {...realitySettlementResult}
            onDismiss={() => onDismissRealitySettlementResult?.()}
          />
        )}
        <RealityReturnDialog
          open={pendingRealitySettlement !== null}
          fullRewardApples={pendingRealitySettlement?.fullRewardApples ?? 0}
          returnFocus={() => dimensionToggleRef.current}
          onDecision={(decision) => {
            if (!pendingRealitySettlement) return
            onAction({
              type: 'reality/settle',
              stayId: pendingRealitySettlement.stayId,
              decision,
              now: Date.now(),
            })
          }}
        />
        <PersistentPlayerDock
          compact={!(hasSidePanel || panel === 'album' || pomodoroActive)}
          className={
            pomodoroActive
              ? 'persistent-bilibili-player--focus'
              : hasSidePanel
                ? 'persistent-bilibili-player--context'
                : panel === 'album'
                  ? 'persistent-bilibili-player--album'
                  : ''
          }
          onExpandRequest={
            pomodoroActive || panel === 'album' ? undefined : () => navigate('record-player')
          }
        />
        {pomodoroActive && (
          <ActivePomodoroOverlay
            game={game}
            catalog={catalog}
            now={now}
            onAction={onAction}
            onTaskEvent={taskEvent}
          />
        )}
      </main>
    </BilibiliPlayerProvider>
  )
}
