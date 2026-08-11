import {
  MAX_APPLES,
  MAX_COMPANION_DAYS,
  MAX_TODO_ID_LENGTH,
  MAX_TODO_TITLE_LENGTH,
  MAX_TODOS,
  POMODORO_PRESETS,
  REALITY_REWARD_INTERVAL_MS,
} from './constants'
import { saturatingAddSafeCounter } from './counters'
import { isPetTired } from '../pet/preferences'
import { resolveVitalityForCompanionDayAdvance } from '../player/vitality'
import { isValidTimestamp, MAX_DATE_TIMESTAMP_MS } from './time'
import { refreshWardrobeShopForCompanionDay } from './wardrobe'
import type {
  CollectionCatalog,
  GameAction,
  GameEffect,
  GameError,
  GameState,
  GameTransition,
  PomodoroBackgroundRef,
  PomodoroSessionV12,
  RealityStay,
  TodoItem,
} from './types'
import { validateCollectionCatalog } from './validateCollectionCatalog'

export type ProductivityAction = Extract<
  GameAction,
  {
    type:
      | 'reality/enter'
      | 'reality/leave'
      | 'reality/session-resume'
      | 'reality/session-heartbeat'
      | 'reality/session-suspend'
      | 'reality/settle'
      | 'todo/create'
      | 'todo/update'
      | 'todo/completion-set'
      | 'todo/delete'
      | 'pomodoro/background-set'
      | 'pomodoro/start'
      | 'pomodoro/cancel'
      | 'clock/tick'
  }
>

const PRODUCTIVITY_ACTION_TYPES = new Set<ProductivityAction['type']>([
  'reality/enter',
  'reality/leave',
  'reality/session-resume',
  'reality/session-heartbeat',
  'reality/session-suspend',
  'reality/settle',
  'todo/create',
  'todo/update',
  'todo/completion-set',
  'todo/delete',
  'pomodoro/background-set',
  'pomodoro/start',
  'pomodoro/cancel',
  'clock/tick',
])

function fail(state: GameState, code: GameError['code'], message: string): GameTransition {
  return { ok: false, state, error: { code, message }, effects: [] }
}

function succeed(state: GameState, effects: readonly GameEffect[] = []): GameTransition {
  return { ok: true, state, effects }
}

function isValidIdentifier(value: string, maxLength: number): boolean {
  return value === value.trim() && value.length >= 1 && value.length <= maxLength
}

function normalizeTodoTitle(value: string): string | null {
  const title = value.trim()
  const length = [...title].length
  return length >= 1 && length <= MAX_TODO_TITLE_LENGTH ? title : null
}

function isValidDueAt(value: number | null): boolean {
  return value === null || isValidTimestamp(value)
}

function isOwnedPostcard(
  state: GameState,
  catalog: CollectionCatalog,
  postcardId: string,
): boolean {
  return catalog.postcard.includes(postcardId) && state.collections[postcardId] !== undefined
}

function isSamePomodoroBackground(
  left: PomodoroBackgroundRef | null,
  right: PomodoroBackgroundRef | null,
): boolean {
  return (
    left === right ||
    (left !== null && right !== null && left.kind === right.kind && left.id === right.id)
  )
}

function validatePomodoroBackground(
  state: GameState,
  catalog: CollectionCatalog,
  background: PomodoroBackgroundRef | null,
): GameTransition | null {
  if (background === null) return null
  if (background.kind === 'wardrobe-photo') {
    return state.wardrobe.photos[background.id] === undefined
      ? fail(state, 'WARDROBE_PHOTO_NOT_FOUND', '苹果钟背景选择的合拍已经不存在')
      : null
  }
  const catalogFailure = validateCatalog(state, catalog)
  if (catalogFailure !== null) return catalogFailure
  return isOwnedPostcard(state, catalog, background.id)
    ? null
    : fail(state, 'UNKNOWN_COLLECTION', '苹果钟背景必须是已经收藏的明信片')
}

function validateCatalog(state: GameState, catalog: CollectionCatalog): GameTransition | null {
  const validation = validateCollectionCatalog(catalog)
  return validation.ok ? null : fail(state, 'INVALID_CATALOG', validation.message)
}

function enterReality(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'reality/enter' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '进入现实的时间无效')
  if (state.reality.pendingSettlement !== null) {
    return fail(state, 'REALITY_SETTLEMENT_PENDING', '请先确认上一段现实时间的奖励')
  }
  if (state.world === 'reality' || state.reality.activeStay !== null) {
    return fail(state, 'DIMENSION_ALREADY_ACTIVE', '已经在现实空间里了')
  }

  if (state.reality.nextStaySequence >= Number.MAX_SAFE_INTEGER) {
    return fail(state, 'INVALID_AMOUNT', '现实停留次数已达到存档上限')
  }
  const sequence = state.reality.nextStaySequence + 1
  const stay: RealityStay = {
    stayId: `reality-stay-${sequence}`,
    enteredAt: action.now,
    activeDurationMs: 0,
    leaseStartedAt: action.now,
  }
  return succeed(
    {
      ...state,
      world: 'reality',
      reality: {
        ...state.reality,
        nextStaySequence: sequence,
        activeStay: stay,
      },
    },
    [{ type: 'reality-entered', stay }],
  )
}

/** 载入缓存或本地存档时关闭旧页面遗留的租约，不把离线间隔计入现实时间。 */
export function suspendRealityLeaseAfterLoad(state: GameState): GameState {
  const stay = state.reality.activeStay
  if (stay === null || stay.leaseStartedAt === null) return state
  return {
    ...state,
    reality: {
      ...state.reality,
      activeStay: { ...stay, leaseStartedAt: null },
    },
  }
}

/** 当前页面内可展示、可结算的现实活跃时长。 */
export function deriveRealityActiveDurationMs(stay: RealityStay, now: number): number {
  return stay.activeDurationMs + (stay.leaseStartedAt === null ? 0 : now - stay.leaseStartedAt)
}

function updateRealityLease(
  state: GameState,
  action: Extract<
    ProductivityAction,
    {
      type: 'reality/session-resume' | 'reality/session-heartbeat' | 'reality/session-suspend'
    }
  >,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '现实计时时间无效')
  const stay = state.reality.activeStay
  if (state.world !== 'reality' || stay === null) {
    return fail(state, 'REALITY_STAY_NOT_ACTIVE', '当前没有进行中的现实停留')
  }
  if (stay.stayId !== action.stayId) {
    return fail(state, 'RUN_ID_MISMATCH', '现实计时请求与当前停留不一致')
  }

  if (action.type === 'reality/session-resume') {
    if (stay.leaseStartedAt !== null) return succeed(state)
    if (action.now < stay.enteredAt) {
      return fail(state, 'INVALID_TIME', '现实计时不能早于进入时间')
    }
    return succeed({
      ...state,
      reality: {
        ...state.reality,
        activeStay: { ...stay, leaseStartedAt: action.now },
      },
    })
  }

  if (stay.leaseStartedAt === null) return succeed(state)
  if (action.now < stay.leaseStartedAt) {
    return fail(state, 'INVALID_TIME', '现实计时不能早于上次心跳')
  }
  const activeDurationMs = stay.activeDurationMs + (action.now - stay.leaseStartedAt)
  if (!Number.isSafeInteger(activeDurationMs) || activeDurationMs > MAX_DATE_TIMESTAMP_MS) {
    return fail(state, 'INVALID_TIME', '现实计时累计时长无效')
  }
  return succeed({
    ...state,
    reality: {
      ...state.reality,
      activeStay: {
        ...stay,
        activeDurationMs,
        leaseStartedAt: action.type === 'reality/session-suspend' ? null : action.now,
      },
    },
  })
}

function leaveReality(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'reality/leave' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '离开现实的时间无效')
  if (state.reality.pendingSettlement !== null) {
    return fail(state, 'REALITY_SETTLEMENT_PENDING', '请先确认上一段现实时间的奖励')
  }
  const stay = state.reality.activeStay
  if (state.world !== 'reality' || stay === null) {
    return fail(state, 'REALITY_STAY_NOT_ACTIVE', '当前没有进行中的现实停留')
  }
  if (action.now < stay.enteredAt) {
    return fail(state, 'INVALID_TIME', '离开时间不能早于进入时间')
  }
  if (stay.leaseStartedAt !== null && action.now < stay.leaseStartedAt) {
    return fail(state, 'INVALID_TIME', '离开时间不能早于上次心跳')
  }

  const activeDurationMs = deriveRealityActiveDurationMs(stay, action.now)
  const settlement = {
    stayId: stay.stayId,
    enteredAt: stay.enteredAt,
    leftAt: action.now,
    activeDurationMs,
    fullRewardApples: Math.floor(activeDurationMs / REALITY_REWARD_INTERVAL_MS),
  }
  const pendingSettlement = settlement.fullRewardApples >= 1 ? settlement : null
  return succeed(
    {
      ...state,
      world: 'game',
      reality: {
        ...state.reality,
        activeStay: null,
        pendingSettlement,
      },
    },
    pendingSettlement === null ? [] : [{ type: 'reality-reward-pending', settlement }],
  )
}

function settleReality(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'reality/settle' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '确认奖励的时间无效')
  const settlement = state.reality.pendingSettlement
  if (settlement === null || settlement.stayId !== action.stayId) {
    return fail(state, 'REALITY_SETTLEMENT_NOT_FOUND', '这段现实时间已经结算或不属于当前存档')
  }
  if (action.now < settlement.leftAt) {
    return fail(state, 'INVALID_TIME', '确认时间不能早于离开时间')
  }

  const decidedReward =
    action.decision === 'serious'
      ? settlement.fullRewardApples
      : Math.floor(settlement.fullRewardApples / 2)
  const awardedApples = Math.min(decidedReward, MAX_APPLES - state.economy.apples)
  const nextEarned = saturatingAddSafeCounter(state.statistics.applesEarned, awardedApples)
  return succeed(
    {
      ...state,
      economy: { apples: state.economy.apples + awardedApples },
      statistics: { ...state.statistics, applesEarned: nextEarned },
      reality: { ...state.reality, pendingSettlement: null },
    },
    [
      {
        type: 'reality-reward-settled',
        stayId: settlement.stayId,
        decision: action.decision,
        settledAt: action.now,
        fullRewardApples: settlement.fullRewardApples,
        awardedApples,
      },
    ],
  )
}

function createTodo(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'todo/create' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '待办创建时间无效')
  if (!isValidIdentifier(action.todoId, MAX_TODO_ID_LENGTH)) {
    return fail(state, 'INVALID_AMOUNT', '待办 ID 必须是 1–64 个无首尾空白的字符')
  }
  if (state.reality.todos[action.todoId] !== undefined) {
    return fail(state, 'DUPLICATE_ID', '待办 ID 已存在')
  }
  if (Object.keys(state.reality.todos).length >= MAX_TODOS) {
    return fail(state, 'TODO_LIMIT_REACHED', `待办最多只能保留 ${MAX_TODOS} 条`)
  }
  const title = normalizeTodoTitle(action.title)
  if (title === null) {
    return fail(state, 'INVALID_AMOUNT', '待办标题去除首尾空白后必须是 1–120 个字符')
  }
  const dueAt = action.dueAt ?? null
  if (!isValidDueAt(dueAt)) return fail(state, 'INVALID_TIME', '待办到期时间无效')

  const todo: TodoItem = {
    id: action.todoId,
    title,
    createdAt: action.now,
    updatedAt: action.now,
    dueAt,
    completedAt: null,
    notificationIssuedAt: null,
  }
  return succeed(
    {
      ...state,
      reality: {
        ...state.reality,
        todos: { ...state.reality.todos, [todo.id]: todo },
      },
    },
    [{ type: 'todo-created', todo }],
  )
}

function updateTodo(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'todo/update' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '待办更新时间无效')
  const previous = state.reality.todos[action.todoId]
  if (previous === undefined) return fail(state, 'TODO_NOT_FOUND', '没有找到这个待办')
  if (action.now < previous.updatedAt) {
    return fail(state, 'INVALID_TIME', '待办更新时间不能早于上次修改时间')
  }
  if (action.title === undefined && action.dueAt === undefined) return succeed(state)

  const title = action.title === undefined ? previous.title : normalizeTodoTitle(action.title)
  if (title === null) {
    return fail(state, 'INVALID_AMOUNT', '待办标题去除首尾空白后必须是 1–120 个字符')
  }
  const dueAt = action.dueAt === undefined ? previous.dueAt : action.dueAt
  if (!isValidDueAt(dueAt)) return fail(state, 'INVALID_TIME', '待办到期时间无效')
  const deadlineChanged = dueAt !== previous.dueAt
  const todo: TodoItem = {
    ...previous,
    title,
    dueAt,
    updatedAt: action.now,
    notificationIssuedAt: deadlineChanged ? null : previous.notificationIssuedAt,
  }
  return succeed(
    {
      ...state,
      reality: {
        ...state.reality,
        todos: { ...state.reality.todos, [todo.id]: todo },
      },
    },
    [{ type: 'todo-updated', todo }],
  )
}

function setTodoCompletion(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'todo/completion-set' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '待办完成时间无效')
  const previous = state.reality.todos[action.todoId]
  if (previous === undefined) return fail(state, 'TODO_NOT_FOUND', '没有找到这个待办')
  if (action.now < previous.updatedAt) {
    return fail(state, 'INVALID_TIME', '待办完成时间不能早于上次修改时间')
  }
  const todo: TodoItem = {
    ...previous,
    updatedAt: action.now,
    completedAt: action.completed ? action.now : null,
  }
  return succeed(
    {
      ...state,
      reality: {
        ...state.reality,
        todos: { ...state.reality.todos, [todo.id]: todo },
      },
    },
    [{ type: 'todo-completion-set', todo }],
  )
}

function deleteTodo(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'todo/delete' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '待办删除时间无效')
  const previous = state.reality.todos[action.todoId]
  if (previous === undefined) return fail(state, 'TODO_NOT_FOUND', '没有找到这个待办')
  if (action.now < previous.updatedAt) {
    return fail(state, 'INVALID_TIME', '待办删除时间不能早于上次修改时间')
  }

  const todos = { ...state.reality.todos }
  delete todos[action.todoId]
  const session = state.reality.pomodoro.session
  const nextSession = session?.todoId === action.todoId ? { ...session, todoId: null } : session
  return succeed(
    {
      ...state,
      reality: {
        ...state.reality,
        todos,
        pomodoro: { ...state.reality.pomodoro, session: nextSession },
      },
    },
    [{ type: 'todo-deleted', todoId: action.todoId, deletedAt: action.now }],
  )
}

function setPomodoroBackground(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'pomodoro/background-set' }>,
  catalog: CollectionCatalog,
): GameTransition {
  const validationFailure = validatePomodoroBackground(state, catalog, action.background)
  if (validationFailure !== null) return validationFailure
  if (isSamePomodoroBackground(state.reality.pomodoro.selectedBackground, action.background)) {
    return succeed(state)
  }
  return succeed({
    ...state,
    reality: {
      ...state.reality,
      pomodoro: {
        ...state.reality.pomodoro,
        selectedBackground: action.background === null ? null : { ...action.background },
      },
    },
  })
}

function startPomodoro(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'pomodoro/start' }>,
  catalog: CollectionCatalog,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '苹果钟开始时间无效')
  const preset = POMODORO_PRESETS.find(
    (candidate) => candidate.focusDurationMs === action.durationMs,
  )
  if (!preset) {
    return fail(state, 'INVALID_DURATION', '苹果钟必须选择 25、50 或 90 分钟的专注时长')
  }
  if (
    state.reality.pomodoro.session !== null &&
    state.reality.pomodoro.session.status !== 'completed'
  ) {
    return fail(state, 'POMODORO_ALREADY_RUNNING', '已经有一轮苹果钟在进行中')
  }
  const todoId = action.todoId ?? null
  if (todoId !== null && state.reality.todos[todoId] === undefined) {
    return fail(state, 'TODO_NOT_FOUND', '苹果钟关联的待办不存在')
  }
  const background = state.reality.pomodoro.selectedBackground
  const backgroundFailure = validatePomodoroBackground(state, catalog, background)
  if (backgroundFailure !== null) return backgroundFailure
  const focusEndsAt = action.now + preset.focusDurationMs
  const cycleEndsAt = focusEndsAt + preset.breakDurationMs
  if (!isValidTimestamp(focusEndsAt) || !isValidTimestamp(cycleEndsAt)) {
    return fail(state, 'INVALID_TIME', '苹果钟截止时间超出 Date 可表示范围')
  }
  if (state.reality.pomodoro.nextSessionSequence >= Number.MAX_SAFE_INTEGER) {
    return fail(state, 'INVALID_AMOUNT', '苹果钟次数已达到存档上限')
  }
  const sequence = state.reality.pomodoro.nextSessionSequence + 1

  const session: PomodoroSessionV12 = {
    sessionId: `pomodoro-${sequence}`,
    status: 'focus',
    startedAt: action.now,
    focusEndsAt,
    cycleEndsAt,
    focusDurationMs: preset.focusDurationMs,
    breakDurationMs: preset.breakDurationMs,
    completedAt: null,
    focusNotificationIssuedAt: null,
    completionNotificationIssuedAt: null,
    todoId,
    background: background === null ? null : { ...background },
  }
  return succeed(
    {
      ...state,
      reality: {
        ...state.reality,
        pomodoro: {
          ...state.reality.pomodoro,
          nextSessionSequence: sequence,
          session,
        },
      },
    },
    [{ type: 'pomodoro-started', session }],
  )
}

function completeDueWork(state: GameState, now: number): GameTransition {
  const previousSession = state.reality.pomodoro.session
  let todos = state.reality.todos
  const effects: GameEffect[] = []
  const dueTodos = Object.values(todos)
    .filter(
      (todo) =>
        todo.completedAt === null &&
        todo.dueAt !== null &&
        todo.dueAt <= now &&
        todo.notificationIssuedAt === null,
    )
    .sort(
      (left, right) => (left.dueAt ?? 0) - (right.dueAt ?? 0) || left.id.localeCompare(right.id),
    )

  for (const previous of dueTodos) {
    const todo = { ...previous, notificationIssuedAt: now }
    if (todos === state.reality.todos) todos = { ...todos }
    todos[todo.id] = todo
    effects.push({
      type: 'todo-notification-due',
      notificationId: `todo:${todo.id}:${todo.dueAt}`,
      todoId: todo.id,
      dueAt: todo.dueAt as number,
      issuedAt: now,
      notificationTitle: '待办时间到啦',
      notificationBody: todo.title,
    })
  }

  let session = previousSession
  let profile = state.profile
  let player = state.player
  let pet = state.pet
  let random = state.random
  const cycleDue =
    previousSession !== null &&
    previousSession.status !== 'completed' &&
    previousSession.cycleEndsAt <= now
  const focusDue =
    previousSession?.status === 'focus' && previousSession.focusEndsAt <= now && !cycleDue

  if (focusDue && previousSession !== null) {
    session = {
      ...previousSession,
      status: 'break',
      focusNotificationIssuedAt: now,
    }
    effects.push({
      type: 'pomodoro-break-started',
      notificationId: `pomodoro:${previousSession.sessionId}:focus:${previousSession.focusEndsAt}`,
      session,
      notificationTitle: '专注结束啦',
      notificationBody: `休息 ${Math.ceil(previousSession.breakDurationMs / 60_000)} 分钟，再回来继续吧`,
    })
  } else if (cycleDue && previousSession !== null) {
    session = {
      ...previousSession,
      status: 'completed',
      completedAt: previousSession.cycleEndsAt,
      focusNotificationIssuedAt: previousSession.focusNotificationIssuedAt ?? now,
      completionNotificationIssuedAt: now,
    }
    const linkedTitle =
      previousSession.todoId === null ? null : state.reality.todos[previousSession.todoId]?.title
    effects.push({
      type: 'pomodoro-completed',
      notificationId: `pomodoro:${previousSession.sessionId}:complete:${previousSession.cycleEndsAt}`,
      session,
      notificationTitle: '苹果钟完成啦',
      notificationBody:
        linkedTitle === null || linkedTitle === undefined
          ? '这一轮专注和休息都完成啦'
          : `“${linkedTitle}”的专注和休息都完成啦`,
    })

    // 计时功能不能因为极高的陪伴日计数失效；到上限后只停止增长。
    if (state.profile.companionDays < MAX_COMPANION_DAYS) {
      const dayAdvance = resolveVitalityForCompanionDayAdvance(state)
      if (!dayAdvance.ok) {
        return fail(state, 'COMPANION_DAY_LIMIT_REACHED', '陪伴天数已达到存档上限')
      }
      profile = { ...state.profile, companionDays: dayAdvance.nextCompanionDay }
      if (dayAdvance.nextVitality !== state.player.effects.vitality) {
        player = { effects: { ...state.player.effects, vitality: dayAdvance.nextVitality } }
      }
      if (dayAdvance.preferences !== null) {
        pet = {
          ...state.pet,
          preferences: dayAdvance.preferences,
          tired: isPetTired(dayAdvance.preferences),
        }
      }
      if (dayAdvance.nextPreferenceSequence !== state.random.sequences.preferences) {
        random = {
          ...state.random,
          sequences: {
            ...state.random.sequences,
            preferences: dayAdvance.nextPreferenceSequence,
          },
        }
      }
      if (dayAdvance.vitalityExpired) {
        effects.push({
          type: 'player-effect-expired',
          effect: 'vitality',
          expiredAtCompanionDay: dayAdvance.nextCompanionDay,
        })
      }
    }
  }

  if (todos === state.reality.todos && session === previousSession) return succeed(state)
  return succeed(
    {
      ...state,
      profile,
      player,
      pet,
      random,
      reality: {
        ...state.reality,
        todos,
        pomodoro: { ...state.reality.pomodoro, session },
      },
    },
    effects,
  )
}

function cancelPomodoro(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'pomodoro/cancel' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '苹果钟取消时间无效')
  const session = state.reality.pomodoro.session
  if (session === null || session.status === 'completed') {
    return fail(state, 'POMODORO_NOT_RUNNING', '当前没有进行中的苹果钟')
  }
  if (session.sessionId !== action.sessionId) {
    return fail(state, 'RUN_ID_MISMATCH', '取消请求与当前苹果钟不一致')
  }
  if (action.now < session.startedAt) {
    return fail(state, 'INVALID_TIME', '取消时间不能早于苹果钟开始时间')
  }
  // 先按绝对时间推进阶段，不能利用延迟界面绕过休息或完成结算。
  const advanced = completeDueWork(state, action.now)
  if (!advanced.ok) return advanced
  const advancedSession = advanced.state.reality.pomodoro.session
  if (advancedSession?.status === 'completed') return advanced
  if (advancedSession === null || advancedSession.sessionId !== action.sessionId) {
    return fail(state, 'RUN_ID_MISMATCH', '取消请求与当前苹果钟不一致')
  }

  return succeed(
    {
      ...advanced.state,
      reality: {
        ...advanced.state.reality,
        pomodoro: { ...advanced.state.reality.pomodoro, session: null },
      },
    },
    [
      ...advanced.effects,
      { type: 'pomodoro-cancelled', sessionId: session.sessionId, cancelledAt: action.now },
    ],
  )
}

export function isProductivityAction(action: GameAction): action is ProductivityAction {
  return PRODUCTIVITY_ACTION_TYPES.has(action.type as ProductivityAction['type'])
}

/**
 * 现实空间、待办与苹果钟的纯状态机。所有时间由 action 显式传入，失败分支保留原 state 引用。
 */
function reducePreparedProductivity(
  state: GameState,
  action: ProductivityAction,
  catalog: CollectionCatalog,
): GameTransition {
  switch (action.type) {
    case 'reality/enter':
      return enterReality(state, action)
    case 'reality/leave':
      return leaveReality(state, action)
    case 'reality/session-resume':
    case 'reality/session-heartbeat':
    case 'reality/session-suspend':
      return updateRealityLease(state, action)
    case 'reality/settle':
      return settleReality(state, action)
    case 'todo/create':
      return createTodo(state, action)
    case 'todo/update':
      return updateTodo(state, action)
    case 'todo/completion-set':
      return setTodoCompletion(state, action)
    case 'todo/delete':
      return deleteTodo(state, action)
    case 'pomodoro/background-set':
      return setPomodoroBackground(state, action, catalog)
    case 'pomodoro/start':
      return startPomodoro(state, action, catalog)
    case 'pomodoro/cancel':
      return cancelPomodoro(state, action)
    case 'clock/tick':
      return isValidTimestamp(action.now)
        ? completeDueWork(state, action.now)
        : fail(state, 'INVALID_TIME', '时钟时间无效')
  }
}

export function reduceProductivity(
  state: GameState,
  action: ProductivityAction,
  catalog: CollectionCatalog,
): GameTransition {
  const transition = reducePreparedProductivity(state, action, catalog)
  if (!transition.ok || transition.state.profile.companionDays <= state.profile.companionDays) {
    return transition
  }
  const refreshed = refreshWardrobeShopForCompanionDay(transition.state)
  return refreshed === transition.state ? transition : { ...transition, state: refreshed }
}
