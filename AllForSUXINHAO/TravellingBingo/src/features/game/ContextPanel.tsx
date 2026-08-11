import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { AppleAmount } from '@/components/AppleAmount'
import { PianoKeyboard } from '@/components/PianoKeyboard'
import { type ContentCatalog } from '@/content'
import {
  deriveActivityTiming,
  getVitalityMagicAvailability,
  getWardrobeShopItems,
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
import { BilibiliPlaylistPanel } from '@/features/player'
import {
  DataPanel,
  StreamPanel,
  WorkPanel,
  buildPomodoroBackgroundOptions,
  buildRealityTodoViews,
  type RealityNotificationPermission,
  type StreamPlaybackController,
} from '@/features/reality'
import { TaskBoard } from '@/features/tasks/TaskBoard'
import { getWardrobeAssetVisual } from '@/features/wardrobe/wardrobeAssets'

import { ActivityLauncher } from './ActivityLauncher'
import { ACTIVITY_COPY, formatCountdown, ITEM_COPY, STAGE_TEST_URL } from './gameCopy'
import type { PanelId, VitalityPromptRequest } from './GameHome'

interface ContextPanelProps {
  panel: PanelId
  game: GameState
  catalog: ContentCatalog
  now: number
  onNavigate: (panel: PanelId | null) => void
  onOpenWardrobe?: () => void
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
  streamPlayback: StreamPlaybackController
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

function PanelFrame({
  panel,
  tag,
  className = '',
  children,
}: {
  panel: PanelId
  tag?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`context-content context-content--v4 ${className}`.trim()}
      data-context-panel={panel}
    >
      {tag && (
        <div className="context-panel__topline">
          <span className="paper-tag">{tag}</span>
        </div>
      )}
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

function RecordPlayerContent({ onTaskEvent }: { onTaskEvent: (event: TaskEvent) => void }) {
  return (
    <BilibiliPlaylistPanel
      trackListLabel="全站第一曲目"
      onTrackOpened={(bvid) => onTaskEvent({ type: 'record-player-opened', bvid })}
    />
  )
}

function todoIdFallback(now: number, sequence: number) {
  return `todo-${Math.max(0, Math.floor(now)).toString(36)}-${sequence.toString(36)}`
}

function RealityPanel({
  panel,
  game,
  catalog,
  now,
  onAction,
  notificationPermission,
  onRequestNotificationPermission,
  pomodoroCancelRequestToken,
  onPomodoroCancelRequestHandled,
  streamPlayback,
}: {
  panel: Extract<PanelId, 'reality-stream' | 'reality-trend' | 'reality-work'>
  game: GameState
  catalog: ContentCatalog
  now: number
  onAction: (action: GameAction) => void
  notificationPermission?: RealityNotificationPermission
  onRequestNotificationPermission?: () => void
  pomodoroCancelRequestToken?: number | null
  onPomodoroCancelRequestHandled?: (token: number) => void
  streamPlayback: StreamPlaybackController
}) {
  const [selectedDurationMs, setSelectedDurationMs] = useState(25 * 60_000)
  const todoSequenceRef = useRef(0)
  const session = game.reality.pomodoro.session
  const displayedDurationMs =
    session && session.status !== 'completed' ? session.focusDurationMs : selectedDurationMs
  const unlockedBackgrounds = useMemo(
    () => buildPomodoroBackgroundOptions(game, catalog),
    [catalog, game],
  )
  const todos = useMemo(() => buildRealityTodoViews(game), [game])

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

  if (panel === 'reality-stream') {
    return (
      <StreamPanel
        selfTestBvid={game.reality.streamSettings.selfTestBvid}
        favoriteId={game.reality.streamSettings.favoriteId}
        playback={streamPlayback.state}
        onStart={streamPlayback.start}
        onStop={streamPlayback.stop}
        onSelfTestBvidChange={(bvid) => onAction({ type: 'reality/stream-self-test-set', bvid })}
        onFavoriteChange={(favoriteId) =>
          onAction({ type: 'reality/stream-favorite-set', favoriteId })
        }
      />
    )
  }

  if (panel === 'reality-trend') return <DataPanel />

  const activeDeadline =
    session?.status === 'focus'
      ? session.focusEndsAt
      : session?.status === 'break'
        ? session.cycleEndsAt
        : null

  return (
    <WorkPanel
      pomodoro={{
        selectedDurationMs: displayedDurationMs,
        session: session
          ? {
              sessionId: session.sessionId,
              status: session.status,
              statusLabel:
                session.status === 'focus'
                  ? '专注中'
                  : session.status === 'break'
                    ? '休息中'
                    : '本轮已完成',
              remainingLabel:
                activeDeadline === null
                  ? undefined
                  : formatCountdown(Math.ceil(Math.max(0, activeDeadline - now) / 1_000)),
            }
          : null,
        canStart: game.world === 'reality' && (!session || session.status === 'completed'),
      }}
      unlockedBackgrounds={unlockedBackgrounds}
      selectedBackground={game.reality.pomodoro.selectedBackground}
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
        onBackgroundChange: (background) =>
          onAction({ type: 'pomodoro/background-set', background }),
        onTodoCreate: (title) =>
          onAction({ type: 'todo/create', todoId: createTodoId(), title, now: Date.now() }),
        onTodoUpdate: (todoId, update) =>
          onAction({ type: 'todo/update', todoId, ...update, now: Date.now() }),
        onTodoCompletionChange: (todoId, completed) =>
          onAction({ type: 'todo/completion-set', todoId, completed, now: Date.now() }),
        onTodoDelete: (todoId) => onAction({ type: 'todo/delete', todoId, now: Date.now() }),
        onNotificationRequest: onRequestNotificationPermission,
      }}
    />
  )
}

export function ContextPanel({
  panel,
  game,
  catalog,
  now,
  onNavigate,
  onOpenWardrobe,
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
  streamPlayback,
}: ContextPanelProps) {
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [cancelRunId, setCancelRunId] = useState<string | null>(null)
  const [sharedVitalityPrompt, setSharedVitalityPrompt] = useState<{
    token: number
    panel: PanelId
  } | null>(null)
  const cancelTriggerRef = useRef<HTMLButtonElement>(null)
  const continueActivityRef = useRef<HTMLButtonElement>(null)
  const speedMagicTriggerRef = useRef<HTMLButtonElement>(null)
  const activityResultRef = useRef<HTMLButtonElement>(null)
  const shouldRestoreCancelFocusRef = useRef(false)
  const speedMagicFocusRunIdRef = useRef<string | null>(null)
  const handledCancelRequestRef = useRef<number | null>(null)
  const handledVitalityPromptRef = useRef<number | null>(null)
  const sharedVitalityPromptRef = useRef<HTMLElement>(null)
  const timing = deriveActivityTiming(game.activeActivity, now)
  const activity = game.activeActivity
  const activeRunId = activity?.runId ?? null
  const confirmingCancel =
    panel === 'activity' && activeRunId !== null && cancelRunId === activeRunId
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
    speedMagicFocusRunIdRef.current = null
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

    const frame = globalThis.requestAnimationFrame(() => {
      handledVitalityPromptRef.current = request.token
      if (vitalityAvailability.canUse) {
        setSharedVitalityPrompt(null)
        onAction({ type: 'magic/vitality-use', now: Date.now() })
      } else {
        setSharedVitalityPrompt({ token: request.token, panel })
      }
      onVitalityPromptRequestHandled?.(request.token)
    })
    return () => globalThis.cancelAnimationFrame(frame)
  }, [
    onAction,
    onVitalityPromptRequestHandled,
    panel,
    vitalityAvailability.canUse,
    vitalityPromptRequest,
  ])

  const activeSharedVitalityPrompt =
    sharedVitalityPrompt?.panel === panel ? sharedVitalityPrompt : null

  useEffect(() => {
    if (activeSharedVitalityPrompt) {
      sharedVitalityPromptRef.current?.focus({ preventScroll: true })
    }
  }, [activeSharedVitalityPrompt])

  function closeSharedVitalityPrompt() {
    setSharedVitalityPrompt(null)
    globalThis.requestAnimationFrame(() => sharedVitalityPromptRef.current?.focus())
  }

  function renderSharedVitalityPrompt() {
    const prompt = activeSharedVitalityPrompt
    return (
      <section
        ref={sharedVitalityPromptRef}
        className={`shared-vitality-prompt ${prompt ? 'is-open' : ''}`}
        tabIndex={-1}
        aria-label="使用活力魔法"
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !prompt) return
          event.stopPropagation()
          closeSharedVitalityPrompt()
        }}
      >
        {prompt ? (
          <div className="activity-refusal">
            {(game.pet.tired || vitalityAvailability.reason !== 'missing-item') && (
              <p role="alert">
                {game.pet.tired
                  ? '饼狗现在有点累，可以先去床铺休息。'
                  : `${vitalityAvailability.message}。`}
              </p>
            )}
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
      <PanelFrame key={panel} panel={panel} tag="家里的冰箱" className="fridge-panel">
        <h2>补充道具</h2>
        <p className="panel-intro">把下次想用的补给准备好，饼狗会自己收进小背包。</p>
        <div className="shop-list">
          {(Object.keys(ITEM_COPY) as ItemId[]).map((itemId) => {
            const item = ITEM_COPY[itemId]
            const price = ITEM_PRICES[itemId]
            const affordable = game.economy.apples >= price
            const isBottledMagic =
              itemId === 'bottled-speed-magic' || itemId === 'bottled-vitality-magic'
            const inventoryCount = game.inventory[itemId]
            const inventoryCountInTitle = itemId === 'trend-toolbox'
            return (
              <article className="shop-item" key={itemId}>
                <span className="shop-item__emoji" aria-hidden="true">
                  {item.emoji}
                </span>
                <div>
                  <strong>
                    {item.name}
                    {inventoryCountInTitle && (
                      <>
                        【<span className="numeric-copy">{inventoryCount}</span>】
                      </>
                    )}
                  </strong>
                  <small>
                    {item.note}
                    {!inventoryCountInTitle && (!isBottledMagic || inventoryCount > 0) && (
                      <>
                        {' · 现有 '}
                        <span className="numeric-copy">{inventoryCount}</span> 份
                      </>
                    )}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => onAction({ type: 'item/purchase', itemId })}
                >
                  {affordable ? (
                    <AppleAmount value={price} />
                  ) : (
                    <>
                      还差 <AppleAmount value={price - game.economy.apples} />
                    </>
                  )}
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
      <PanelFrame key={panel} panel={panel} tag={panel === 'travel' ? '行前准备' : '电脑桌'}>
        {panel === 'computer' && renderSharedVitalityPrompt()}
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
      <PanelFrame key={panel} panel={panel} tag="电子琴前" className="piano-panel">
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
      <PanelFrame key={panel} panel={panel} tag="唱片机旁" className="record-panel">
        <h2>放点音乐</h2>

        <RecordPlayerContent onTaskEvent={onTaskEvent} />
      </PanelFrame>
    )
  }

  if (panel === 'activity') {
    return (
      <PanelFrame key={panel} panel={panel} tag="这一次 Bingo" className="active-panel">
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
            {game.inventory['bottled-speed-magic'] > 0 && (
              <section className="speed-magic-card" aria-labelledby="speed-magic-title">
                <div>
                  <span className="speed-magic-card__emoji" aria-hidden="true">
                    {ITEM_COPY['bottled-speed-magic'].emoji}
                  </span>
                  <div>
                    <strong id="speed-magic-title">{ITEM_COPY['bottled-speed-magic'].name}</strong>
                    <small>
                      现有{' '}
                      <span className="numeric-copy">{game.inventory['bottled-speed-magic']}</span>{' '}
                      份
                    </small>
                  </div>
                </div>
                {timing.phase !== 'running' ? (
                  <p>活动已经完成，不需要再加速。</p>
                ) : (
                  <button
                    ref={speedMagicTriggerRef}
                    className="paper-button"
                    type="button"
                    disabled={game.inventory['bottled-speed-magic'] < 1}
                    onClick={() => {
                      setCancelRunId(null)
                      const runId = activity.runId
                      speedMagicFocusRunIdRef.current = runId
                      onAction({
                        type: 'magic/speed-use',
                        runId,
                        now: Date.now(),
                      })
                      globalThis.requestAnimationFrame(() => {
                        if (speedMagicFocusRunIdRef.current !== runId) return
                        speedMagicFocusRunIdRef.current = null
                        const target = activityResultRef.current ?? speedMagicTriggerRef.current
                        target?.focus({ preventScroll: true })
                      })
                    }}
                  >
                    {game.inventory['bottled-speed-magic'] > 0
                      ? '使用速度魔法'
                      : '冰箱里还没有速度魔法'}
                  </button>
                )}
              </section>
            )}
            {timing.phase === 'ready' ? (
              <button
                ref={activityResultRef}
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
                  speedMagicFocusRunIdRef.current = null
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

  if (panel === 'reality-stream' || panel === 'reality-trend' || panel === 'reality-work') {
    return (
      <PanelFrame
        key={panel}
        panel={panel}
        tag={panel === 'reality-work' ? '工作' : undefined}
        className="reality-context-panel"
      >
        <RealityPanel
          panel={panel}
          game={game}
          catalog={catalog}
          now={now}
          onAction={onAction}
          notificationPermission={notificationPermission}
          onRequestNotificationPermission={onRequestNotificationPermission}
          pomodoroCancelRequestToken={pomodoroCancelRequestToken}
          onPomodoroCancelRequestHandled={onPomodoroCancelRequestHandled}
          streamPlayback={streamPlayback}
        />
      </PanelFrame>
    )
  }

  if (panel === 'debug') {
    return (
      <PanelFrame key={panel} panel={panel} tag="调试门牌" className="debug-panel-shell">
        <DebugPanel game={game} onAction={onAction} onBackup={onBackup} />
      </PanelFrame>
    )
  }

  if (panel === 'wardrobe') {
    const availableShopItems = getWardrobeShopItems(game)

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
      >
        <h2>奇迹饼狗</h2>
        <p>进入搭配室前，可以先看看今天衣架上还有哪些衣服。</p>
        {availableShopItems.length > 0 && (
          <section className="miracle-panel__shop" aria-labelledby="miracle-panel-shop-title">
            <h3 id="miracle-panel-shop-title">今天仍可购买</h3>
            <div className="miracle-panel__offers">
              {availableShopItems.map((item) => {
                const visual = getWardrobeAssetVisual(item.id)
                const affordable = game.economy.apples >= item.priceApples
                return (
                  <article className="shop-item miracle-panel__offer" key={item.id}>
                    <span className="shop-item__emoji miracle-panel__thumbnail" aria-hidden="true">
                      <img src={visual.url} alt="" draggable={false} />
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.category === 'outfit' ? '服装' : '配饰'}</small>
                    </div>
                    <button
                      type="button"
                      disabled={!affordable}
                      aria-label={`购买${item.name}，${item.priceApples}🍎${affordable ? '' : `，还差${item.priceApples - game.economy.apples}🍎`}`}
                      onClick={() => onAction({ type: 'wardrobe/item-purchase', assetId: item.id })}
                    >
                      {affordable ? (
                        <AppleAmount value={item.priceApples} />
                      ) : (
                        <>
                          还差 <AppleAmount value={item.priceApples - game.economy.apples} />
                        </>
                      )}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        )}
        <button
          className="paper-button paper-button--primary"
          type="button"
          onClick={onOpenWardrobe}
        >
          进入奇迹饼狗
        </button>
        <button className="paper-button" type="button" onClick={openStageTest}>
          打开独立舞台测试
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
      <PanelFrame key={panel} panel={panel} tag="软乎乎的床铺" className="quiet-panel rest-panel">
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

  return (
    <PanelFrame key={panel} panel={panel} tag="铲铲饼屋" className="status-panel status-panel--v3">
      <h2>{game.profile.displayName}，和饼狗一起玩吧</h2>
      <p className="panel-intro">
        {activity
          ? `${ACTIVITY_COPY[activity.kind].verb}，点击饼狗可以查看进度。`
          : '点房间里的文字标签，饼狗会自己走到那里。'}
      </p>

      <InterestSummary game={game} />
      <TaskBoard game={game} />
    </PanelFrame>
  )
}
