import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ContentCatalog } from '@/content'
import {
  deriveActivityTiming,
  type ActivityKind,
  type ClaimSummary,
  type GameAction,
  type GameState,
  type PetInterest,
  type TaskEvent,
} from '@/domain'
import { AlbumView } from '@/features/album/AlbumView'
import { BilibiliPlayerProvider, type BilibiliPlayerTrack } from '@/features/player'
import { RealityReturnDialog, type RealityNotificationPermission } from '@/features/reality'
import { RewardDialog } from '@/features/rewards/RewardDialog'

import './game-v2.css'
import './game-v3.css'
import './game-v4.css'

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
  notificationPermission?: RealityNotificationPermission
  onRequestNotificationPermission?: () => void
  updateCheckStatus?: 'idle' | 'checking' | 'checked' | 'unsupported' | 'error'
  onCheckForUpdates?: () => void
  keepAliveAudioEnabled?: boolean
  keepAliveAudioStatus?: 'idle' | 'starting' | 'running' | 'suspended' | 'unavailable' | 'error'
  onToggleKeepAliveAudio?: () => void
  /** 每次成功休息后递增，使日夜过场可在连续休息时重新播放。 */
  restTransitionKey?: number
}

const UPDATE_STATUS_COPY = {
  idle: '检查新布置',
  checking: '正在检查新布置…',
  checked: '已经是新布置',
  unsupported: '手动刷新看新布置',
  error: '重新检查新布置',
} as const

const KEEP_ALIVE_STATUS_COPY = {
  idle: '等待唤醒饼屋',
  starting: '正在唤醒饼屋…',
  running: '饼屋守候中',
  suspended: '继续唤醒饼屋',
  unavailable: '暂时无法唤醒',
  error: '重新唤醒饼屋',
} as const

function toPlayerTrack(video: ContentCatalog['recordPlayerVideos'][number]): BilibiliPlayerTrack {
  return {
    bvid: video.bvid,
    title: video.title,
    sourceUrl: video.sourceUrl,
    authorName: video.authorName,
    publishedAt: video.publishedAt,
  }
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
  notificationPermission = 'unsupported',
  onRequestNotificationPermission,
  updateCheckStatus = 'idle',
  onCheckForUpdates,
  keepAliveAudioEnabled = false,
  keepAliveAudioStatus = 'idle',
  onToggleKeepAliveAudio,
  restTransitionKey,
}: GameHomeProps) {
  const activity = game.activeActivity
  const timing = deriveActivityTiming(activity, now)
  const [walking, setWalking] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
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
  const overlayOpen =
    panel === 'album' || helpOpen || reward !== null || pendingRealitySettlement !== null

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
    if (session?.status !== 'running') return
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
    onPanel(null)
    onAction({
      type: game.world === 'reality' ? 'reality/leave' : 'reality/enter',
      now: Date.now(),
    })
  }

  const vitality = game.player.effects.vitality
  const vitalityDays = vitality
    ? Math.max(0, vitality.expiresAfterCompanionDay - game.profile.companionDays)
    : 0
  const petStatusLabel = activity
    ? timing.phase === 'ready'
      ? `🎉 ${ACTIVITY_COPY[activity.kind].name}完成啦`
      : `🐶 ${ACTIVITY_COPY[activity.kind].verb}`
    : vitalityDays > 0
      ? '✨ 活力满满'
      : game.pet.tired
        ? '😴 今天想先休息'
        : '🐶 状态很好'

  return (
    <BilibiliPlayerProvider
      state={game.musicPlayer}
      onAction={onAction}
      builtInTracks={builtInPlayerTracks}
      resolveTrack={resolvePlayerTrack}
      compactDock={panel !== 'record-player' && panel !== 'album'}
      onDockExpandRequest={() => navigate('record-player')}
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
          statusBar={
            <div className="pet-status-bar" role="group" aria-label="饼狗状态">
              <span className="pet-status-bar__summary">
                <span className="pet-status-bar__label">{petStatusLabel}</span>
                <span
                  className="hud-companion"
                  title={`${game.profile.displayName}陪伴饼狗已经 ${game.profile.companionDays} 天`}
                >
                  <span className="hud-companion__full">
                    {game.profile.displayName}陪伴饼狗已经{' '}
                    <span className="numeric-copy">{game.profile.companionDays}</span> 天
                  </span>
                  <span className="hud-companion__compact">
                    陪伴 <span className="numeric-copy">{game.profile.companionDays}</span> 天
                  </span>
                </span>
              </span>
              {vitalityDays > 0 && (
                <span className="pet-status-bar__effect" title={`活力还可陪伴 ${vitalityDays} 天`}>
                  ✨ <span className="numeric-copy">{vitalityDays}</span> 天
                </span>
              )}
              <button
                className="keepalive-control"
                type="button"
                aria-label={KEEP_ALIVE_STATUS_COPY[keepAliveAudioStatus]}
                aria-pressed={keepAliveAudioEnabled}
                title={KEEP_ALIVE_STATUS_COPY[keepAliveAudioStatus]}
                disabled={!onToggleKeepAliveAudio || keepAliveAudioStatus === 'unavailable'}
                onClick={onToggleKeepAliveAudio}
              >
                <span aria-hidden="true">🔊</span>
                <span className="pet-status-bar__action-copy">
                  {KEEP_ALIVE_STATUS_COPY[keepAliveAudioStatus]}
                </span>
              </button>
              <button
                className="pet-status-bar__update"
                type="button"
                aria-label={UPDATE_STATUS_COPY[updateCheckStatus]}
                title={UPDATE_STATUS_COPY[updateCheckStatus]}
                disabled={!onCheckForUpdates || updateCheckStatus === 'checking'}
                onClick={onCheckForUpdates}
              >
                <span aria-hidden="true">🏠</span>
                <span className="pet-status-bar__action-copy">
                  {UPDATE_STATUS_COPY[updateCheckStatus]}
                </span>
              </button>
              <span className="visually-hidden" role="status" aria-live="polite">
                {petStatusLabel}，{KEEP_ALIVE_STATUS_COPY[keepAliveAudioStatus]}
                {vitalityDays > 0 ? `，活力还可陪伴 ${vitalityDays} 天` : ''}
              </span>
            </div>
          }
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
            onRequestCancelActivity={requestActivityCancel}
            pomodoroRunning={game.reality.pomodoro.session?.status === 'running'}
            onRequestCancelPomodoro={requestPomodoroCancel}
            onTaskEvent={taskEvent}
          />

          {hasSidePanel && panel && (
            <aside className={`context-panel context-panel--v4 context-panel--${panel}`}>
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
                cancelRequestToken={
                  activity && cancelRequest && activity.runId === cancelRequest.runId
                    ? cancelRequest.token
                    : null
                }
                onCancelRequestHandled={(token) => {
                  setCancelRequest((current) => (current?.token === token ? null : current))
                }}
                pomodoroCancelRequestToken={
                  game.reality.pomodoro.session?.status === 'running' &&
                  pomodoroCancelRequest?.sessionId === game.reality.pomodoro.session.sessionId
                    ? pomodoroCancelRequest.token
                    : null
                }
                onPomodoroCancelRequestHandled={(token) => {
                  setPomodoroCancelRequest((current) => (current?.token === token ? null : current))
                }}
                vitalityPromptRequest={
                  vitalityPromptRequest?.panel === panel ? vitalityPromptRequest : null
                }
                onVitalityPromptRequestHandled={(token) => {
                  setVitalityPromptRequest((current) => (current?.token === token ? null : current))
                }}
                notificationPermission={notificationPermission}
                onRequestNotificationPermission={onRequestNotificationPermission}
              />
            </aside>
          )}

          <button
            ref={dimensionToggleRef}
            className="dimension-toggle"
            type="button"
            disabled={pendingRealitySettlement !== null}
            onClick={toggleDimension}
            aria-label={game.world === 'reality' ? '回到旅行饼狗游戏' : '切换到现实生活维度'}
          >
            <span aria-hidden="true">{game.world === 'reality' ? '🏠' : '🌱'}</span>
            <strong>{game.world === 'reality' ? '旅行饼狗' : '现实生活'}</strong>
          </button>
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
      </main>
    </BilibiliPlayerProvider>
  )
}
