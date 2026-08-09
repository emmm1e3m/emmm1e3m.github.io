import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { publicAsset } from '@/app/assets'
import { PianoKeyboard } from '@/components/PianoKeyboard'
import { calculateCollectionProgress, type ContentCatalog } from '@/content'
import {
  deriveActivityTiming,
  getVitalityMagicAvailability,
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
import { BilibiliPlaylistPanel, useBilibiliPlayerController } from '@/features/player'
import {
  DataPanel,
  REALITY_PANEL_IDS,
  RealityDashboard,
  WorkPanel,
  type RealityNotificationPermission,
} from '@/features/reality'
import { TaskBoard } from '@/features/tasks/TaskBoard'

import { ActivityLauncher } from './ActivityLauncher'
import { ACTIVITY_COPY, formatCountdown, ITEM_COPY, STAGE_TEST_URL } from './gameCopy'
import type { PanelId, VitalityPromptRequest } from './GameHome'

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
  /** 非 null 值代表一次尚待消费的“打开取消确认”请求。 */
  cancelRequestToken?: number | null
  onCancelRequestHandled?: (token: number) => void
  /** 房间左下角发出的一次性苹果钟取消确认请求。 */
  pomodoroCancelRequestToken?: number | null
  onPomodoroCancelRequestHandled?: (token: number) => void
  /** 房间灰态热点发出的一次性活力提示请求。 */
  vitalityPromptRequest?: VitalityPromptRequest | null
  onVitalityPromptRequestHandled?: (token: number) => void
  notificationPermission?: RealityNotificationPermission
  onRequestNotificationPermission?: () => void
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
      <button
        className="context-panel__close"
        type="button"
        aria-label="收起信息栏"
        onClick={onClose}
      >
        收起信息栏
      </button>
    </div>
  )
}

function PanelFrame({
  panel,
  tag,
  className = '',
  onClose,
  children,
}: {
  panel: PanelId
  tag: string
  className?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className={`context-content context-content--v4 ${className}`.trim()}
      data-context-panel={panel}
    >
      <PanelHeader tag={tag} onClose={onClose} />
      {children}
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

function RecordPlayerContent({
  game,
  catalog,
  onTaskEvent,
}: {
  game: GameState
  catalog: ContentCatalog
  onTaskEvent: (event: TaskEvent) => void
}) {
  const controller = useBilibiliPlayerController()
  const activePlaylistId = game.musicPlayer.activePlaylistId
  const activePlaylist =
    activePlaylistId === null ? undefined : game.musicPlayer.playlists[activePlaylistId]

  function reportRequest(request: ReturnType<typeof controller.selectPlaylist>) {
    if (request) onTaskEvent({ type: 'record-player-opened', bvid: request.track.bvid })
  }

  return (
    <>
      <section className="record-library" aria-labelledby="record-library-title">
        <div className="record-library__heading">
          <h3 id="record-library-title">选择曲库</h3>
          <small>选中内置精选可创建新列表；选中自己的列表可继续编辑。</small>
        </div>
        <div className="record-library__choices" role="group" aria-label="播放曲库">
          <button
            type="button"
            aria-pressed={activePlaylistId === null}
            onClick={() => reportRequest(controller.selectPlaylist(null))}
          >
            <strong>百万直拍精选</strong>
            <span className="numeric-copy">{catalog.recordPlayerVideos.length} 首</span>
          </button>
          {game.musicPlayer.order.map((playlistId) => {
            const playlist = game.musicPlayer.playlists[playlistId]
            if (!playlist) return null
            return (
              <button
                key={playlist.id}
                type="button"
                aria-pressed={activePlaylistId === playlist.id}
                onClick={() => reportRequest(controller.selectPlaylist(playlist.id))}
              >
                <strong>{playlist.name}</strong>
                <span className="numeric-copy">{playlist.bvids.length} 首</span>
              </button>
            )
          })}
        </div>
      </section>

      <BilibiliPlaylistPanel
        key={activePlaylistId ?? 'built-in'}
        initialName={activePlaylist?.name ?? '我的播放列表'}
        initialInput={activePlaylist?.bvids.join('\n') ?? ''}
        resolveTrack={(bvid) => catalog.videosByBvid[bvid]}
        trackListLabel="唱片列表"
        onTrackOpened={(bvid) => onTaskEvent({ type: 'record-player-opened', bvid })}
        submitLabel={activePlaylist ? '保存这个列表' : '创建并载入列表'}
      />
    </>
  )
}

const POMODORO_DURATION_OPTIONS = [
  { durationMs: 5 * 60_000, label: '5 分钟', description: '快速整理' },
  { durationMs: 25 * 60_000, label: '25 分钟', description: '专注一轮' },
  { durationMs: 50 * 60_000, label: '50 分钟', description: '深入完成' },
] as const

function todoIdFallback(now: number, sequence: number) {
  return `todo-${Math.max(0, Math.floor(now)).toString(36)}-${sequence.toString(36)}`
}

function RealityPanel({
  panel,
  game,
  catalog,
  now,
  onNavigate,
  onAction,
  notificationPermission,
  onRequestNotificationPermission,
  pomodoroCancelRequestToken,
  onPomodoroCancelRequestHandled,
}: {
  panel: Extract<PanelId, 'reality-data' | 'reality-work'>
  game: GameState
  catalog: ContentCatalog
  now: number
  onNavigate: (panel: PanelId | null) => void
  onAction: (action: GameAction) => void
  notificationPermission?: RealityNotificationPermission
  onRequestNotificationPermission?: () => void
  pomodoroCancelRequestToken?: number | null
  onPomodoroCancelRequestHandled?: (token: number) => void
}) {
  const [selectedDurationMs, setSelectedDurationMs] = useState(25 * 60_000)
  const todoSequenceRef = useRef(0)
  const session = game.reality.pomodoro.session
  const displayedDurationMs =
    session?.status === 'running' ? session.durationMs : selectedDurationMs
  const durationOptions = useMemo(() => {
    if (POMODORO_DURATION_OPTIONS.some((option) => option.durationMs === displayedDurationMs)) {
      return POMODORO_DURATION_OPTIONS
    }
    return [
      ...POMODORO_DURATION_OPTIONS,
      {
        durationMs: displayedDurationMs,
        label: `${Math.ceil(displayedDurationMs / 60_000)} 分钟`,
        description: '存档中的时长',
      },
    ].sort((left, right) => left.durationMs - right.durationMs)
  }, [displayedDurationMs])
  const unlockedBackgrounds = useMemo(
    () =>
      catalog.items.flatMap((item) => {
        if (item.category !== 'postcard' || game.collections[item.id] === undefined) return []
        const thumbnail = item.images[0]
        return [
          {
            id: item.id,
            title: item.title,
            thumbnailUrl: thumbnail ? publicAsset(thumbnail.path) : undefined,
            description: item.caption,
          },
        ]
      }),
    [catalog.items, game.collections],
  )
  const todos = useMemo(
    () =>
      Object.values(game.reality.todos)
        .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
        .map((todo) => ({
          id: todo.id,
          title: todo.title,
          completed: todo.completedAt !== null,
          dueLabel:
            todo.dueAt === null
              ? null
              : `截止 ${new Intl.DateTimeFormat('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(todo.dueAt)}`,
        })),
    [game.reality.todos],
  )

  function createTodoId() {
    const randomUUID = globalThis.crypto?.randomUUID?.()
    if (randomUUID && game.reality.todos[randomUUID] === undefined) return randomUUID

    let candidate: string
    do {
      todoSequenceRef.current += 1
      candidate = todoIdFallback(Date.now(), todoSequenceRef.current)
    } while (game.reality.todos[candidate] !== undefined)
    return candidate
  }

  const activePanelId = panel === 'reality-data' ? REALITY_PANEL_IDS.data : REALITY_PANEL_IDS.work
  const realityPanels = [
    {
      id: REALITY_PANEL_IDS.data,
      label: '数据',
      location: '二楼电脑',
      icon: '📈',
      content: <DataPanel />,
    },
    {
      id: REALITY_PANEL_IDS.work,
      label: '工作',
      location: '一楼电脑',
      icon: '🍎',
      content: (
        <WorkPanel
          pomodoro={{
            selectedDurationMs: displayedDurationMs,
            durationOptions,
            session: session
              ? {
                  sessionId: session.sessionId,
                  status: session.status,
                  statusLabel: session.status === 'running' ? '专注中' : '本轮已完成',
                  remainingLabel:
                    session.status === 'running'
                      ? formatCountdown(Math.ceil(Math.max(0, session.endsAt - now) / 1_000))
                      : undefined,
                }
              : null,
            canStart: game.world === 'reality' && session?.status !== 'running',
          }}
          unlockedBackgrounds={unlockedBackgrounds}
          selectedBackgroundId={game.reality.pomodoro.selectedPostcardId}
          todos={todos}
          notification={notificationPermission ? { permission: notificationPermission } : undefined}
          cancelRequestToken={pomodoroCancelRequestToken}
          onCancelRequestHandled={onPomodoroCancelRequestHandled}
          actions={{
            onDurationChange: setSelectedDurationMs,
            onPomodoroStart: (durationMs) =>
              onAction({ type: 'pomodoro/start', durationMs, now: Date.now() }),
            onPomodoroCancel: (sessionId) =>
              onAction({ type: 'pomodoro/cancel', sessionId, now: Date.now() }),
            onBackgroundChange: (postcardId) =>
              onAction({ type: 'pomodoro/background-set', postcardId }),
            onTodoCreate: (title) =>
              onAction({ type: 'todo/create', todoId: createTodoId(), title, now: Date.now() }),
            onTodoUpdate: (todoId, update) =>
              onAction({ type: 'todo/update', todoId, ...update, now: Date.now() }),
            onTodoCompletionChange: (todoId, completed) =>
              onAction({
                type: 'todo/completion-set',
                todoId,
                completed,
                now: Date.now(),
              }),
            onTodoDelete: (todoId) => onAction({ type: 'todo/delete', todoId, now: Date.now() }),
            onNotificationRequest: onRequestNotificationPermission,
          }}
        />
      ),
    },
  ]

  return (
    <RealityDashboard
      panels={realityPanels}
      activePanelId={activePanelId}
      onPanelChange={(panelId) =>
        onNavigate(panelId === REALITY_PANEL_IDS.data ? 'reality-data' : 'reality-work')
      }
      title="现实生活"
      description="数据在二楼电脑，苹果钟、明信片背景和待办在一楼电脑。"
    />
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
  cancelRequestToken,
  onCancelRequestHandled,
  pomodoroCancelRequestToken,
  onPomodoroCancelRequestHandled,
  vitalityPromptRequest,
  onVitalityPromptRequestHandled,
  notificationPermission,
  onRequestNotificationPermission,
}: ContextPanelProps) {
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [cancelRunId, setCancelRunId] = useState<string | null>(null)
  const [speedMagicRunId, setSpeedMagicRunId] = useState<string | null>(null)
  const [sharedVitalityPrompt, setSharedVitalityPrompt] = useState<{
    token: number
    panel: PanelId
    mode: 'confirm' | 'refusal'
  } | null>(null)
  const cancelTriggerRef = useRef<HTMLButtonElement>(null)
  const continueActivityRef = useRef<HTMLButtonElement>(null)
  const speedMagicTriggerRef = useRef<HTMLButtonElement>(null)
  const waitForActivityRef = useRef<HTMLButtonElement>(null)
  const shouldRestoreCancelFocusRef = useRef(false)
  const shouldRestoreSpeedMagicFocusRef = useRef(false)
  const handledCancelRequestRef = useRef<number | null>(null)
  const handledVitalityPromptRef = useRef<number | null>(null)
  const sharedVitalityPromptRef = useRef<HTMLElement>(null)
  const sharedVitalityCancelRef = useRef<HTMLButtonElement>(null)
  const timing = deriveActivityTiming(game.activeActivity, now)
  const activity = game.activeActivity
  const activeRunId = activity?.runId ?? null
  const confirmingCancel =
    panel === 'activity' && activeRunId !== null && cancelRunId === activeRunId
  const confirmingSpeedMagic =
    panel === 'activity' &&
    activeRunId !== null &&
    timing.phase === 'running' &&
    speedMagicRunId === activeRunId
  const domainCatalog = useMemo(() => toDomainCatalog(catalog), [catalog])
  const vitalityAvailability = getVitalityMagicAvailability(game)

  useEffect(() => {
    if (
      panel !== 'activity' ||
      activeRunId === null ||
      cancelRequestToken === null ||
      cancelRequestToken === undefined ||
      handledCancelRequestRef.current === cancelRequestToken
    ) {
      return
    }

    handledCancelRequestRef.current = cancelRequestToken
    setSpeedMagicRunId(null)
    setCancelRunId(activeRunId)
    onCancelRequestHandled?.(cancelRequestToken)
  }, [activeRunId, cancelRequestToken, onCancelRequestHandled, panel])

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

  useEffect(() => {
    if (confirmingSpeedMagic) {
      shouldRestoreSpeedMagicFocusRef.current = true
      waitForActivityRef.current?.focus()
      return
    }

    if (panel !== 'activity' || timing.phase !== 'running' || activeRunId === null) {
      shouldRestoreSpeedMagicFocusRef.current = false
      return
    }

    if (shouldRestoreSpeedMagicFocusRef.current) {
      shouldRestoreSpeedMagicFocusRef.current = false
      speedMagicTriggerRef.current?.focus()
    }
  }, [activeRunId, confirmingSpeedMagic, panel, timing.phase])

  useEffect(() => {
    const request = vitalityPromptRequest
    if (
      request === null ||
      request === undefined ||
      request.panel !== panel ||
      request.kind !== null ||
      handledVitalityPromptRef.current === request.token
    ) {
      return
    }

    handledVitalityPromptRef.current = request.token
    setSharedVitalityPrompt({
      token: request.token,
      panel,
      mode: vitalityAvailability.canUse ? 'confirm' : 'refusal',
    })
    onVitalityPromptRequestHandled?.(request.token)
  }, [onVitalityPromptRequestHandled, panel, vitalityAvailability.canUse, vitalityPromptRequest])

  const activeSharedVitalityPrompt =
    sharedVitalityPrompt?.panel === panel ? sharedVitalityPrompt : null

  useEffect(() => {
    if (activeSharedVitalityPrompt?.mode === 'confirm') {
      sharedVitalityCancelRef.current?.focus({ preventScroll: true })
      return
    }
    if (activeSharedVitalityPrompt?.mode === 'refusal') {
      sharedVitalityPromptRef.current?.focus({ preventScroll: true })
    }
  }, [activeSharedVitalityPrompt])

  function closeSharedVitalityPrompt() {
    setSharedVitalityPrompt(null)
    globalThis.requestAnimationFrame(() => sharedVitalityPromptRef.current?.focus())
  }

  function renderSharedVitalityPrompt(note: string) {
    const prompt = activeSharedVitalityPrompt
    return (
      <section
        ref={sharedVitalityPromptRef}
        className={`shared-vitality-prompt ${prompt ? 'is-open' : ''}`}
        tabIndex={-1}
        aria-label="设施共享意愿"
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !prompt) return
          event.stopPropagation()
          closeSharedVitalityPrompt()
        }}
      >
        <p>{note}</p>
        {prompt?.mode === 'confirm' ? (
          <div
            className="activity-confirm activity-confirm--vitality"
            role="group"
            aria-label="确认使用活力魔法"
          >
            <p>使用一瓶活力魔法后，饼狗会重新有精神。要现在使用吗？</p>
            <div className="button-row">
              <button
                className="paper-button paper-button--primary"
                type="button"
                onClick={() => {
                  setSharedVitalityPrompt(null)
                  onAction({ type: 'magic/vitality-use', now: Date.now() })
                }}
              >
                使用活力魔法
              </button>
              <button
                ref={sharedVitalityCancelRef}
                className="paper-button"
                type="button"
                onClick={closeSharedVitalityPrompt}
              >
                先不使用
              </button>
            </div>
          </div>
        ) : prompt?.mode === 'refusal' ? (
          <div className="activity-refusal">
            <p role="alert">
              {game.pet.tired
                ? '饼狗现在有点累，可以先去床铺休息。'
                : vitalityAvailability.reason === 'missing-item'
                  ? '冰箱里还没有瓶装活力魔法，可以先去床铺休息。'
                  : `${vitalityAvailability.message}。`}
            </p>
            <button type="button" onClick={() => onNavigate('rest')}>
              去床铺休息
            </button>
          </div>
        ) : null}
      </section>
    )
  }

  if (panel === 'fridge') {
    return (
      <PanelFrame
        key={panel}
        panel={panel}
        tag="家里的冰箱"
        className="fridge-panel"
        onClose={onClose}
      >
        <h2>补充道具</h2>
        <p className="panel-intro">把下次想用的补给准备好，饼狗会自己收进小背包。</p>
        <div className="shop-list">
          {(Object.keys(ITEM_COPY) as ItemId[]).map((itemId) => {
            const item = ITEM_COPY[itemId]
            const price = ITEM_PRICES[itemId]
            const affordable = game.economy.apples >= price
            return (
              <article className="shop-item" key={itemId}>
                <span className="shop-item__emoji" aria-hidden="true">
                  {item.emoji}
                </span>
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
      </PanelFrame>
    )
  }

  if (panel === 'computer' || panel === 'travel') {
    const kinds: ActivityKind[] = panel === 'travel' ? ['travel'] : ['stream', 'trend']
    return (
      <PanelFrame
        key={panel}
        panel={panel}
        tag={panel === 'travel' ? '行前准备' : '电脑桌'}
        onClose={onClose}
      >
        {panel === 'computer' &&
          renderSharedVitalityPrompt('认真刷播和全力冲热共享同一份“电脑”意愿。')}
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
              vitalityPromptRequestToken={
                vitalityPromptRequest?.panel === panel && vitalityPromptRequest.kind === kind
                  ? vitalityPromptRequest.token
                  : null
              }
              onVitalityPromptRequestHandled={onVitalityPromptRequestHandled}
            />
          ))}
        </div>
      </PanelFrame>
    )
  }

  if (panel === 'piano') {
    return (
      <PanelFrame
        key={panel}
        panel={panel}
        tag="电子琴前"
        className="piano-panel"
        onClose={onClose}
      >
        <h2>让房间响起一段旋律</h2>
        <PianoKeyboard onNote={(noteId) => onTaskEvent({ type: 'piano-note-played', noteId })} />
        <ActivityLauncher
          kind="music"
          game={game}
          catalog={domainCatalog}
          onAction={onAction}
          onNeedSupplies={() => onNavigate('fridge')}
          onNeedRest={() => onNavigate('rest')}
          vitalityPromptRequestToken={
            vitalityPromptRequest?.panel === panel && vitalityPromptRequest.kind === 'music'
              ? vitalityPromptRequest.token
              : null
          }
          onVitalityPromptRequestHandled={onVitalityPromptRequestHandled}
        />
      </PanelFrame>
    )
  }

  if (panel === 'record-player') {
    return (
      <PanelFrame
        key={panel}
        panel={panel}
        tag="唱片机旁"
        className="record-panel"
        onClose={onClose}
      >
        <h2>百万直拍精选与我的播放列表</h2>
        <p className="panel-intro">选曲后会自动请求播放；收起信息栏不会中断它。</p>
        {renderSharedVitalityPrompt('唱片机和电子琴共享同一份“音乐”意愿。')}

        <RecordPlayerContent game={game} catalog={catalog} onTaskEvent={onTaskEvent} />
      </PanelFrame>
    )
  }

  if (panel === 'activity') {
    return (
      <PanelFrame
        key={panel}
        panel={panel}
        tag="这一次 Bingo"
        className="active-panel"
        onClose={onClose}
      >
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
            <section className="speed-magic-card" aria-labelledby="speed-magic-title">
              <div>
                <span className="speed-magic-card__emoji" aria-hidden="true">
                  {ITEM_COPY['bottled-speed-magic'].emoji}
                </span>
                <div>
                  <strong id="speed-magic-title">{ITEM_COPY['bottled-speed-magic'].name}</strong>
                  <small>
                    现有{' '}
                    <span className="numeric-copy">{game.inventory['bottled-speed-magic']}</span> 份
                  </small>
                </div>
              </div>
              {timing.phase !== 'running' ? (
                <p>活动已经完成，不需要再加速。</p>
              ) : confirmingSpeedMagic ? (
                <div className="speed-magic-confirm" role="group" aria-label="确认使用速度魔法">
                  <p>会消耗 1 份速度魔法，让这次活动立刻完成。确定使用吗？</p>
                  <div className="button-row">
                    <button
                      className="paper-button paper-button--primary"
                      type="button"
                      onClick={() => {
                        setSpeedMagicRunId(null)
                        onAction({
                          type: 'magic/speed-use',
                          runId: activity.runId,
                          now: Date.now(),
                        })
                      }}
                    >
                      确认使用
                    </button>
                    <button
                      ref={waitForActivityRef}
                      className="paper-button"
                      type="button"
                      onClick={() => setSpeedMagicRunId(null)}
                    >
                      继续等待
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  ref={speedMagicTriggerRef}
                  className="paper-button"
                  type="button"
                  disabled={game.inventory['bottled-speed-magic'] < 1}
                  onClick={() => {
                    setCancelRunId(null)
                    setSpeedMagicRunId(activity.runId)
                  }}
                >
                  {game.inventory['bottled-speed-magic'] > 0
                    ? '使用速度魔法'
                    : '冰箱里还没有速度魔法'}
                </button>
              )}
            </section>
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
                onClick={() => {
                  setSpeedMagicRunId(null)
                  setCancelRunId(activity.runId)
                }}
              >
                取消这次活动
              </button>
            )}
          </div>
        ) : (
          <p className="panel-intro">想做什么，就从房间里选一个地方吧。</p>
        )}
      </PanelFrame>
    )
  }

  if (panel === 'reality-data' || panel === 'reality-work') {
    return (
      <PanelFrame
        key={panel}
        panel={panel}
        tag={panel === 'reality-data' ? '二楼电脑' : '一楼电脑'}
        className="reality-context-panel"
        onClose={onClose}
      >
        <RealityPanel
          panel={panel}
          game={game}
          catalog={catalog}
          now={now}
          onNavigate={onNavigate}
          onAction={onAction}
          notificationPermission={notificationPermission}
          onRequestNotificationPermission={onRequestNotificationPermission}
          pomodoroCancelRequestToken={pomodoroCancelRequestToken}
          onPomodoroCancelRequestHandled={onPomodoroCancelRequestHandled}
        />
      </PanelFrame>
    )
  }

  if (panel === 'debug') {
    return (
      <PanelFrame
        key={panel}
        panel={panel}
        tag="调试门牌"
        className="debug-panel-shell"
        onClose={onClose}
      >
        <DebugPanel game={game} onAction={onAction} onBackup={onBackup} />
      </PanelFrame>
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
      <PanelFrame
        key={panel}
        panel={panel}
        tag="衣架旁的小卡片"
        className="quiet-panel miracle-panel"
        onClose={onClose}
      >
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
      </PanelFrame>
    )
  }

  if (panel === 'rest') {
    return (
      <PanelFrame
        key={panel}
        panel={panel}
        tag="软乎乎的床铺"
        className="quiet-panel rest-panel"
        onClose={onClose}
      >
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
      </PanelFrame>
    )
  }

  const progress = calculateCollectionProgress(catalog, Object.keys(game.collections))
  return (
    <PanelFrame
      key={panel}
      panel={panel}
      tag="今天的铲铲饼屋"
      className="status-panel status-panel--v3"
      onClose={onClose}
    >
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
    </PanelFrame>
  )
}
