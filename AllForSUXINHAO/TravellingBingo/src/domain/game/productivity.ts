import {
  MAX_APPLES,
  MAX_COMPANION_DAYS,
  MAX_POMODORO_DURATION_MS,
  MAX_TODO_ID_LENGTH,
  MAX_TODO_TITLE_LENGTH,
  MAX_TODOS,
  MIN_POMODORO_DURATION_MS,
  REALITY_REWARD_INTERVAL_MS,
} from './constants'
import { saturatingAddSafeCounter } from './counters'
import { isPetTired } from '../pet/preferences'
import { resolveVitalityForCompanionDayAdvance } from '../player/vitality'
import { isValidTimestamp } from './time'
import type {
  CollectionCatalog,
  GameAction,
  GameEffect,
  GameError,
  GameState,
  GameTransition,
  PomodoroSession,
  TodoItem,
} from './types'
import { validateCollectionCatalog } from './validateCollectionCatalog'

export type ProductivityAction = Extract<
  GameAction,
  {
    type:
      | 'reality/enter'
      | 'reality/leave'
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
  const stay = { stayId: `reality-stay-${sequence}`, enteredAt: action.now }
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

  const settlement = {
    ...stay,
    leftAt: action.now,
    fullRewardApples: Math.floor((action.now - stay.enteredAt) / REALITY_REWARD_INTERVAL_MS),
  }
  return succeed(
    {
      ...state,
      world: 'game',
      reality: {
        ...state.reality,
        activeStay: null,
        pendingSettlement: settlement,
      },
    },
    [{ type: 'reality-reward-pending', settlement }],
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
  if (action.postcardId !== null) {
    const catalogFailure = validateCatalog(state, catalog)
    if (catalogFailure !== null) return catalogFailure
    if (!isOwnedPostcard(state, catalog, action.postcardId)) {
      return fail(state, 'UNKNOWN_COLLECTION', '苹果钟背景必须是已经收藏的明信片')
    }
  }
  if (state.reality.pomodoro.selectedPostcardId === action.postcardId) return succeed(state)
  return succeed({
    ...state,
    reality: {
      ...state.reality,
      pomodoro: { ...state.reality.pomodoro, selectedPostcardId: action.postcardId },
    },
  })
}

function startPomodoro(
  state: GameState,
  action: Extract<ProductivityAction, { type: 'pomodoro/start' }>,
  catalog: CollectionCatalog,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '苹果钟开始时间无效')
  if (state.profile.companionDays >= MAX_COMPANION_DAYS) {
    return fail(state, 'COMPANION_DAY_LIMIT_REACHED', '陪伴天数已达到存档上限')
  }
  if (
    !Number.isSafeInteger(action.durationMs) ||
    action.durationMs < MIN_POMODORO_DURATION_MS ||
    action.durationMs > MAX_POMODORO_DURATION_MS
  ) {
    return fail(state, 'INVALID_DURATION', '苹果钟时长必须是 1 秒到 24 小时之间的整毫秒数')
  }
  if (state.reality.pomodoro.session?.status === 'running') {
    return fail(state, 'POMODORO_ALREADY_RUNNING', '已经有一轮苹果钟在进行中')
  }
  const todoId = action.todoId ?? null
  if (todoId !== null && state.reality.todos[todoId] === undefined) {
    return fail(state, 'TODO_NOT_FOUND', '苹果钟关联的待办不存在')
  }
  const postcardId = state.reality.pomodoro.selectedPostcardId
  if (postcardId !== null) {
    const catalogFailure = validateCatalog(state, catalog)
    if (catalogFailure !== null) return catalogFailure
    if (!isOwnedPostcard(state, catalog, postcardId)) {
      return fail(state, 'UNKNOWN_COLLECTION', '苹果钟背景明信片已经不在收藏中')
    }
  }
  const endsAt = action.now + action.durationMs
  if (!isValidTimestamp(endsAt)) {
    return fail(state, 'INVALID_TIME', '苹果钟结束时间超出 Date 可表示范围')
  }
  if (state.reality.pomodoro.nextSessionSequence >= Number.MAX_SAFE_INTEGER) {
    return fail(state, 'INVALID_AMOUNT', '苹果钟次数已达到存档上限')
  }
  const sequence = state.reality.pomodoro.nextSessionSequence + 1

  const session: PomodoroSession = {
    sessionId: `pomodoro-${sequence}`,
    status: 'running',
    startedAt: action.now,
    endsAt,
    durationMs: action.durationMs,
    completedAt: null,
    notificationIssuedAt: null,
    todoId,
    postcardId,
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
  const dueSession =
    previousSession !== null &&
    previousSession.status === 'running' &&
    previousSession.endsAt <= now
      ? previousSession
      : null
  if (dueSession !== null && state.profile.companionDays >= MAX_COMPANION_DAYS) {
    return fail(state, 'COMPANION_DAY_LIMIT_REACHED', '陪伴天数已达到存档上限')
  }

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
  if (dueSession !== null) {
    session = {
      ...dueSession,
      status: 'completed',
      completedAt: dueSession.endsAt,
      notificationIssuedAt: now,
    }
    const linkedTitle =
      dueSession.todoId === null ? null : state.reality.todos[dueSession.todoId]?.title
    effects.push({
      type: 'pomodoro-completed',
      notificationId: `pomodoro:${dueSession.sessionId}:${dueSession.endsAt}`,
      session,
      notificationTitle: '苹果钟完成啦',
      notificationBody:
        linkedTitle === null || linkedTitle === undefined
          ? '这一轮专注时间到了'
          : `“${linkedTitle}”的专注时间到了`,
    })

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
  if (session === null || session.status !== 'running') {
    return fail(state, 'POMODORO_NOT_RUNNING', '当前没有进行中的苹果钟')
  }
  if (session.sessionId !== action.sessionId) {
    return fail(state, 'RUN_ID_MISMATCH', '取消请求与当前苹果钟不一致')
  }
  if (action.now < session.startedAt) {
    return fail(state, 'INVALID_TIME', '取消时间不能早于苹果钟开始时间')
  }
  // 绝对截止时间已经到达时必须完成，不能利用延迟的界面计时器绕过完成通知。
  if (action.now >= session.endsAt && state.profile.companionDays < MAX_COMPANION_DAYS) {
    return completeDueWork(state, action.now)
  }

  return succeed(
    {
      ...state,
      reality: {
        ...state.reality,
        pomodoro: { ...state.reality.pomodoro, session: null },
      },
    },
    [{ type: 'pomodoro-cancelled', sessionId: session.sessionId, cancelledAt: action.now }],
  )
}

export function isProductivityAction(action: GameAction): action is ProductivityAction {
  return PRODUCTIVITY_ACTION_TYPES.has(action.type as ProductivityAction['type'])
}

/**
 * 现实空间、待办与苹果钟的纯状态机。所有时间由 action 显式传入，失败分支保留原 state 引用。
 */
export function reduceProductivity(
  state: GameState,
  action: ProductivityAction,
  catalog: CollectionCatalog,
): GameTransition {
  switch (action.type) {
    case 'reality/enter':
      return enterReality(state, action)
    case 'reality/leave':
      return leaveReality(state, action)
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
