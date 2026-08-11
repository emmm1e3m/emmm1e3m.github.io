import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ContentCatalog, RecordPlayerVideo } from '@/content'
import {
  deriveActivityTiming,
  deriveRealityActiveDurationMs,
  REALITY_REWARD_INTERVAL_MS,
  type ActivityKind,
  type ClaimSummary,
  type GameAction,
  type GameState,
  type PetInterest,
  type RealityRewardDecision,
  type TaskEvent,
  type WorldDimension,
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
  buildPomodoroBackgroundOptions,
  buildRealityTodoViews,
  findPomodoroBackgroundOption,
  type RealityNotificationPermission,
  useStreamPlayback,
} from '@/features/reality'
import { RewardDialog } from '@/features/rewards/RewardDialog'
import { UpdateNoticeDialog } from '@/features/update-notice/UpdateNotice'
import { MiracleWardrobePage } from '@/features/wardrobe/MiracleWardrobePage'

import './game-v2.css'
import './game-v3.css'
import './game-v4.css'

import { ContextPanel } from './ContextPanel'
import { detectPcBrowser } from './browserPlatform'
import { DimensionDialog, type DimensionDialogMode } from './DimensionDialog'
import { ACTIVITY_COPY, formatCountdown } from './gameCopy'
import { GameHud } from './GameHud'
import { HelpDialog } from './HelpDialog'
import { RoomScene, type RoomWalkingDirection } from './RoomScene'
import {
  areaForActivity,
  areaForPanel,
  roomAreaFromLocation,
  type RoomArea,
  type RoomPixelPoint,
} from './roomConfig'

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
  | 'reality-stream'
  | 'reality-trend'
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

type DimensionTransitionPhase = 'out' | 'in'

interface DimensionTransitionState {
  target: WorldDimension
  phase: DimensionTransitionPhase
}

const DIMENSION_EXIT_MS = 240
const DIMENSION_ENTER_MS = 360

interface GameHomeProps {
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
  canUseTrend?: () => boolean
  /** 每次成功休息后递增，使日夜过场可在连续休息时重新播放。 */
  restTransitionKey?: number
}

function toPlayerTrack(video: RecordPlayerVideo): BilibiliPlayerTrack {
  return {
    bvid: video.bvid,
    title: video.title,
    displayTitle: video.displayTitle,
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
  const todoSequenceRef = useRef(0)
  const session = game.reality.pomodoro.session
  if (!session || session.status === 'completed') return null

  const background = findPomodoroBackgroundOption(
    buildPomodoroBackgroundOptions(game, catalog),
    session.background,
  )
  const deadline = session.status === 'focus' ? session.focusEndsAt : session.cycleEndsAt

  function createTodoId(actionNow: number) {
    const randomUUID = globalThis.crypto?.randomUUID?.()
    if (randomUUID && game.reality.todos[randomUUID] === undefined) return randomUUID

    let candidate: string
    do {
      todoSequenceRef.current += 1
      candidate = `todo-${Math.max(0, Math.floor(actionNow)).toString(36)}-${todoSequenceRef.current.toString(36)}`
    } while (game.reality.todos[candidate] !== undefined)
    return candidate
  }

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
            className="reality-secondary-button pomodoro-focus__start-music"
            type="button"
            onClick={() => {
              const firstTrack = catalog.recordPlayerVideos[0]
              const request = firstTrack ? controller.selectTrack(firstTrack.bvid) : null
              if (request) onTaskEvent({ type: 'record-player-opened', bvid: request.track.bvid })
            }}
          >
            打开唱片机
          </button>
        )
      }
      onTodoCompletionChange={(todoId, completed) =>
        onAction({ type: 'todo/completion-set', todoId, completed, now: Date.now() })
      }
      onTodoCreate={(title) => {
        const actionNow = Date.now()
        onAction({ type: 'todo/create', todoId: createTodoId(actionNow), title, now: actionNow })
      }}
      onTodoUpdate={(todoId, update) =>
        onAction({ type: 'todo/update', todoId, ...update, now: Date.now() })
      }
      onTodoDelete={(todoId) => onAction({ type: 'todo/delete', todoId, now: Date.now() })}
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
  canUseTrend = detectPcBrowser,
  restTransitionKey,
}: GameHomeProps) {
  const activity = game.activeActivity
  const timing = deriveActivityTiming(activity, now)
  const [walking, setWalking] = useState(false)
  const [walkingDirection, setWalkingDirection] = useState<RoomWalkingDirection>('right')
  const [sleeping, setSleeping] = useState(false)
  const [petMenuOpenRequest, setPetMenuOpenRequest] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const [updateNoticeOpen, setUpdateNoticeOpen] = useState(false)
  const [wardrobeOpen, setWardrobeOpen] = useState(false)
  const [dimensionDialog, setDimensionDialog] = useState<DimensionDialogMode | null>(null)
  const [dimensionTransition, setDimensionTransition] = useState<DimensionTransitionState | null>(
    null,
  )
  const [cancelRequest, setCancelRequest] = useState<{ token: number; runId: string } | null>(null)
  const [pomodoroCancelRequest, setPomodoroCancelRequest] = useState<{
    token: number
    sessionId: string
  } | null>(null)
  const [vitalityPromptRequest, setVitalityPromptRequest] = useState<VitalityPromptRequest | null>(
    null,
  )
  const walkTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const visiblePetCenterRef = useRef<RoomPixelPoint | null>(null)
  const sleepTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const cancelRequestSequenceRef = useRef(0)
  const pomodoroCancelRequestSequenceRef = useRef(0)
  const vitalityPromptSequenceRef = useRef(0)
  const dimensionToggleRef = useRef<HTMLButtonElement>(null)
  const dimensionTransitionTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const previousRestTransitionKey = useRef(restTransitionKey)
  const playerTracks = useMemo(
    () => catalog.recordPlayerVideos.map(toPlayerTrack),
    [catalog.recordPlayerVideos],
  )
  const claimDailyStreamReward = useCallback(
    (dateKey: string) => {
      onAction({
        type: 'stream/daily-reward-claim',
        dateKey,
      })
    },
    [onAction],
  )
  const streamPlayback = useStreamPlayback({ onStarted: claimDailyStreamReward })
  const streamHudStatus =
    streamPlayback.state.status === 'stopping'
      ? 'stopping'
      : streamPlayback.state.status === 'opening'
        ? 'starting'
        : streamPlayback.state.status === 'waiting'
          ? 'running'
          : null
  const handlePetCenterChange = useCallback((point: RoomPixelPoint) => {
    visiblePetCenterRef.current = point
  }, [])

  useEffect(() => {
    return () => {
      if (walkTimerRef.current !== null) globalThis.clearTimeout(walkTimerRef.current)
      if (sleepTimerRef.current !== null) globalThis.clearTimeout(sleepTimerRef.current)
      if (dimensionTransitionTimerRef.current !== null) {
        globalThis.clearTimeout(dimensionTransitionTimerRef.current)
      }
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
  // 信息栏没有“关闭”状态：外层尚未选择设施时，稳定回退到待机信息页。
  const displayedPanel: PanelId = panel ?? 'status'
  const hasSidePanel = displayedPanel !== 'album'
  const pendingRealitySettlement = game.reality.pendingSettlement
  const pomodoroActive =
    game.reality.pomodoro.session !== null && game.reality.pomodoro.session.status !== 'completed'
  const visibleDimensionDialog: DimensionDialogMode | null = dimensionTransition
    ? null
    : dimensionDialog
  const overlayOpen =
    panel === 'album' ||
    wardrobeOpen ||
    helpOpen ||
    updateNoticeOpen ||
    reward !== null ||
    realitySettlementResult !== null ||
    pendingRealitySettlement !== null ||
    visibleDimensionDialog !== null ||
    dimensionTransition !== null ||
    pomodoroActive

  function taskEvent(event: TaskEvent) {
    onAction({ type: 'task/event', event, now: Date.now() })
  }

  function moveTo(area: RoomArea) {
    if (area.panel === 'reality-trend' && !canUseTrend()) {
      setDimensionDialog('trend-pc-required')
      return
    }

    onPanel(area.panel)
    if (activity) return

    const visiblePetCenter = visiblePetCenterRef.current ?? roomArea.petCenter
    const changed =
      visiblePetCenter.x !== area.petCenter.x || visiblePetCenter.y !== area.petCenter.y
    if (changed) {
      setWalkingDirection(area.petCenter.x < visiblePetCenter.x ? 'left' : 'right')
      setWalking(true)
      if (walkTimerRef.current !== null) globalThis.clearTimeout(walkTimerRef.current)
      walkTimerRef.current = globalThis.setTimeout(() => setWalking(false), 620)
    }
    visiblePetCenterRef.current = area.petCenter

    if (area.petLocation !== 'center') {
      onAction({ type: 'room/interact', area: area.petLocation, now: Date.now() })
    }
  }

  function navigate(panelId: PanelId | null) {
    if (panelId === 'reality-trend' && !canUseTrend()) {
      setDimensionDialog('trend-pc-required')
      return
    }

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
    if (pendingRealitySettlement || dimensionTransition) return
    if (game.world === 'reality') {
      const activeStay = game.reality.activeStay
      const fullRewardApples = activeStay
        ? Math.floor(deriveRealityActiveDurationMs(activeStay, now) / REALITY_REWARD_INTERVAL_MS)
        : 0
      if (fullRewardApples < 1) {
        startDimensionTransition('game')
        return
      }

      setDimensionDialog('confirm-leave')
      return
    }

    setDimensionDialog('confirm-enter')
  }

  function startDimensionTransition(target: WorldDimension) {
    if (dimensionTransition) return
    if (dimensionTransitionTimerRef.current !== null) {
      globalThis.clearTimeout(dimensionTransitionTimerRef.current)
    }

    setDimensionDialog(null)
    setDimensionTransition({ target, phase: 'out' })
    dimensionTransitionTimerRef.current = globalThis.setTimeout(() => {
      onPanel(null)
      onAction({
        type: target === 'reality' ? 'reality/enter' : 'reality/leave',
        now: Date.now(),
      })
      setDimensionTransition({ target, phase: 'in' })
      dimensionTransitionTimerRef.current = globalThis.setTimeout(() => {
        setDimensionTransition(null)
        dimensionTransitionTimerRef.current = null
        globalThis.requestAnimationFrame(() => dimensionToggleRef.current?.focus())
      }, DIMENSION_ENTER_MS)
    }, DIMENSION_EXIT_MS)
  }

  const vitality = game.player.effects.vitality
  const vitalityDays = vitality
    ? Math.max(0, vitality.expiresAfterCompanionDay - game.profile.companionDays)
    : 0
  const petStatusLabel: string | null = activity
    ? timing.phase === 'ready'
      ? `${ACTIVITY_COPY[activity.kind].name}完成了`
      : ACTIVITY_COPY[activity.kind].verb
    : game.pet.tired
      ? '今天想先休息'
      : null

  return (
    <BilibiliPlayerProvider state={game.musicPlayer} onAction={onAction} tracks={playerTracks}>
      <main
        className={`game-page game-page--v2 game-page--v3 game-page--v4 ${hasSidePanel ? 'has-side-panel' : 'is-room-open'} ${sleeping ? 'is-sleeping' : ''} ${dimensionTransition ? `is-dimension-transitioning is-dimension-transitioning-${dimensionTransition.phase}` : ''}`}
        data-world={game.world}
        data-dimension-transition={
          dimensionTransition
            ? `${dimensionTransition.phase}-${dimensionTransition.target}`
            : undefined
        }
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || overlayOpen || panel === null) return
          onPanel(null)
        }}
      >
        <GameHud
          game={game}
          now={now}
          activity={activity}
          timing={timing}
          dirty={dirty}
          inert={overlayOpen}
          statusLabel={petStatusLabel}
          streamStatus={streamHudStatus}
          vitalityDays={vitalityDays}
          onExit={onExit}
          onCenter={() => navigate(activity ? 'activity' : 'status')}
          onRealityTimer={toggleDimension}
          onPetStatus={() => setPetMenuOpenRequest((request) => request + 1)}
          onStreamStatus={() => {
            if (!streamPlayback.focus()) navigate('reality-stream')
          }}
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
            panel={displayedPanel}
            area={roomArea}
            walking={walking && !activity}
            walkingDirection={walkingDirection}
            sleeping={sleeping}
            petMenuOpenRequest={petMenuOpenRequest}
            restDarkness={
              activity?.kind === 'rest' ? Math.min(0.84, 0.16 + timing.progress * 0.68) : 0
            }
            onArea={moveTo}
            onPetCenterChange={handlePetCenterChange}
            onReluctantArea={requestVitalityPrompt}
            onPanel={(nextPanel) => navigate(nextPanel)}
            onBackgroundActivate={() => onPanel('status')}
            onHelp={() => setHelpOpen(true)}
            onUpdateNotice={() => setUpdateNoticeOpen(true)}
            dimensionToggleRef={dimensionToggleRef}
            dimensionToggleDisabled={
              pendingRealitySettlement !== null || dimensionTransition !== null
            }
            onToggleDimension={toggleDimension}
            onRequestCancelActivity={requestActivityCancel}
            pomodoroRunning={pomodoroActive}
            onRequestCancelPomodoro={requestPomodoroCancel}
            onTaskEvent={taskEvent}
          />

          {hasSidePanel && (
            <div className="context-stack">
              <aside className={`context-panel context-panel--v4 context-panel--${displayedPanel}`}>
                <div className="context-panel__handle" aria-hidden="true" />
                <ContextPanel
                  panel={displayedPanel}
                  game={game}
                  catalog={catalog}
                  now={now}
                  onNavigate={navigate}
                  onOpenWardrobe={() => setWardrobeOpen(true)}
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
                    vitalityPromptRequest?.panel === displayedPanel ? vitalityPromptRequest : null
                  }
                  onVitalityPromptRequestHandled={(token) => {
                    setVitalityPromptRequest((current) =>
                      current?.token === token ? null : current,
                    )
                  }}
                  notificationPermission={notificationPermission}
                  onRequestNotificationPermission={onRequestNotificationPermission}
                  streamPlayback={streamPlayback}
                />
              </aside>
            </div>
          )}
        </div>

        {panel === 'album' && (
          <AlbumView
            catalog={catalog}
            game={game}
            onAction={onAction}
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

        {wardrobeOpen && (
          <MiracleWardrobePage
            game={game}
            catalog={catalog}
            onClose={() => setWardrobeOpen(false)}
            onAction={onAction}
          />
        )}

        <HelpDialog open={helpOpen} world={game.world} onClose={() => setHelpOpen(false)} />
        <UpdateNoticeDialog open={updateNoticeOpen} onClose={() => setUpdateNoticeOpen(false)} />
        {dimensionTransition && (
          <div
            className={`dimension-transition dimension-transition--${dimensionTransition.phase} dimension-transition--to-${dimensionTransition.target}`}
            role="status"
            aria-label={
              dimensionTransition.target === 'reality' ? '正在进入现实维度' : '正在回到饼屋'
            }
            aria-live="polite"
          >
            <span className="dimension-transition__orbit" aria-hidden="true">
              🔃
            </span>
            <strong>
              {dimensionTransition.target === 'reality' ? '去现实维度看看' : '回到饼屋继续旅行'}
            </strong>
          </div>
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
          interactionDisabled={dimensionTransition !== null || wardrobeOpen}
          className={
            wardrobeOpen
              ? 'persistent-bilibili-player--wardrobe'
              : pomodoroActive
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
        {pomodoroActive && dimensionTransition === null && (
          <ActivePomodoroOverlay
            game={game}
            catalog={catalog}
            now={now}
            onAction={onAction}
            onTaskEvent={taskEvent}
          />
        )}
        {visibleDimensionDialog && (
          <DimensionDialog
            mode={visibleDimensionDialog}
            onCancel={() => setDimensionDialog(null)}
            onConfirm={() => {
              if (visibleDimensionDialog === 'trend-pc-required') {
                setDimensionDialog(null)
                return
              }

              if (visibleDimensionDialog === 'confirm-leave') {
                startDimensionTransition('game')
                return
              }

              startDimensionTransition('reality')
            }}
          />
        )}
      </main>
    </BilibiliPlayerProvider>
  )
}
