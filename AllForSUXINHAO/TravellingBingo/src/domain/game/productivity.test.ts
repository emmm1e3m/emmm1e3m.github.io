import { describe, expect, it } from 'vitest'

import {
  MAX_APPLES,
  MAX_COMPANION_DAYS,
  MAX_TODOS,
  POMODORO_PRESETS,
  REALITY_REWARD_INTERVAL_MS,
} from './constants'
import { createInitialGameState } from './createGameState'
import { gameStateV6Schema } from './migrateGameStateV5'
import { isProductivityAction, reduceProductivity, type ProductivityAction } from './productivity'
import { MAX_DATE_TIMESTAMP_MS } from './time'
import type { CollectionCatalog, GameAction, GameState, GameTransition, TodoItem } from './types'
import { generateActivityPreferences, isPetTired } from '../pet/preferences'

const catalog: CollectionCatalog = {
  postcard: ['postcard-1', 'postcard-2'],
  'million-shot': ['million-1'],
  'site-first': ['first-1'],
  siteFirstChronology: ['first-1'],
}

const CLASSIC_POMODORO = POMODORO_PRESETS[0]
const FOCUS_MS = CLASSIC_POMODORO.focusDurationMs
const BREAK_MS = CLASSIC_POMODORO.breakDurationMs
const CYCLE_MS = FOCUS_MS + BREAK_MS

function initialState(): GameState {
  return createInitialGameState({ now: 0, seed: 'productivity-tests' })
}

function successful(transition: GameTransition): Extract<GameTransition, { ok: true }> {
  if (!transition.ok) throw new Error(`${transition.error.code}: ${transition.error.message}`)
  return transition
}

function reduce(state: GameState, action: ProductivityAction): GameTransition {
  return reduceProductivity(state, action, catalog)
}

function createdTodo(state: GameState, options?: Partial<TodoItem>): GameState {
  const todo: TodoItem = {
    id: 'todo-1',
    title: '吃苹果',
    createdAt: 100,
    updatedAt: 100,
    dueAt: null,
    completedAt: null,
    notificationIssuedAt: null,
    ...options,
  }
  return {
    ...state,
    reality: {
      ...state.reality,
      todos: { ...state.reality.todos, [todo.id]: todo },
    },
  }
}

describe('现实维度', () => {
  it('用持久序号创建停留，并在完整十分钟边界生成待决奖励', () => {
    const original = initialState()
    const entered = successful(reduce(original, { type: 'reality/enter', now: 1_000 }))

    expect(entered.state.world).toBe('reality')
    expect(entered.state.reality.activeStay).toEqual({
      stayId: 'reality-stay-1',
      enteredAt: 1_000,
    })
    expect(entered.state.reality.nextStaySequence).toBe(1)
    expect(original.world).toBe('game')
    expect(entered.effects).toEqual([
      {
        type: 'reality-entered',
        stay: { stayId: 'reality-stay-1', enteredAt: 1_000 },
      },
    ])

    const left = successful(
      reduce(entered.state, {
        type: 'reality/leave',
        now: 1_000 + REALITY_REWARD_INTERVAL_MS * 2 + 599_999,
      }),
    )
    expect(left.state.world).toBe('game')
    expect(left.state.reality.activeStay).toBeNull()
    expect(left.state.reality.pendingSettlement).toMatchObject({
      stayId: 'reality-stay-1',
      fullRewardApples: 2,
    })
  })

  it('现实停留序号到达安全整数上限时原子拒绝进入', () => {
    const state = initialState()
    state.reality.nextStaySequence = Number.MAX_SAFE_INTEGER
    const before = structuredClone(state)

    const result = reduce(state, { type: 'reality/enter', now: 1_000 })
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_AMOUNT' } })
    expect(result.state).toBe(state)
    expect(state).toEqual(before)
  })

  it.each([
    [REALITY_REWARD_INTERVAL_MS - 1, 0],
    [REALITY_REWARD_INTERVAL_MS, 1],
    [REALITY_REWARD_INTERVAL_MS * 2 - 1, 1],
  ])('停留 %i 毫秒只奖励 %i 个完整区间', (duration, expected) => {
    const entered = successful(reduce(initialState(), { type: 'reality/enter', now: 10 })).state
    const left = successful(reduce(entered, { type: 'reality/leave', now: 10 + duration }))
    expect(left.state.reality.pendingSettlement?.fullRewardApples).toBe(expected)
  })

  it('认真给全额、不认真向下取半，并且同一待决不能重复领取', () => {
    const entered = successful(reduce(initialState(), { type: 'reality/enter', now: 0 })).state
    const left = successful(
      reduce(entered, {
        type: 'reality/leave',
        now: REALITY_REWARD_INTERVAL_MS * 5,
      }),
    ).state
    const settled = successful(
      reduce(left, {
        type: 'reality/settle',
        stayId: 'reality-stay-1',
        decision: 'not-serious',
        now: REALITY_REWARD_INTERVAL_MS * 5,
      }),
    )

    expect(settled.state.economy.apples).toBe(left.economy.apples + 2)
    expect(settled.state.statistics.applesEarned).toBe(2)
    expect(settled.state.reality.pendingSettlement).toBeNull()
    expect(settled.effects[0]).toMatchObject({
      type: 'reality-reward-settled',
      fullRewardApples: 5,
      awardedApples: 2,
    })

    const repeated = reduce(settled.state, {
      type: 'reality/settle',
      stayId: 'reality-stay-1',
      decision: 'serious',
      now: REALITY_REWARD_INTERVAL_MS * 5 + 1,
    })
    expect(repeated).toMatchObject({
      ok: false,
      error: { code: 'REALITY_SETTLEMENT_NOT_FOUND' },
    })
    expect(repeated.state).toBe(settled.state)
  })

  it('待决阻止再次进入，陈旧 stayId 不能结算', () => {
    const entered = successful(reduce(initialState(), { type: 'reality/enter', now: 0 })).state
    const left = successful(
      reduce(entered, { type: 'reality/leave', now: REALITY_REWARD_INTERVAL_MS }),
    ).state

    const blocked = reduce(left, { type: 'reality/enter', now: REALITY_REWARD_INTERVAL_MS + 1 })
    expect(blocked).toMatchObject({ ok: false, error: { code: 'REALITY_SETTLEMENT_PENDING' } })
    expect(blocked.state).toBe(left)

    const stale = reduce(left, {
      type: 'reality/settle',
      stayId: 'reality-stay-0',
      decision: 'serious',
      now: REALITY_REWARD_INTERVAL_MS + 1,
    })
    expect(stale).toMatchObject({
      ok: false,
      error: { code: 'REALITY_SETTLEMENT_NOT_FOUND' },
    })
  })

  it('结算奖励受苹果上限约束', () => {
    const state = {
      ...initialState(),
      economy: { apples: MAX_APPLES - 1 },
      reality: {
        ...initialState().reality,
        pendingSettlement: {
          stayId: 'reality-stay-8',
          enteredAt: 0,
          leftAt: REALITY_REWARD_INTERVAL_MS * 8,
          fullRewardApples: 8,
        },
      },
    }
    const result = successful(
      reduce(state, {
        type: 'reality/settle',
        stayId: 'reality-stay-8',
        decision: 'serious',
        now: REALITY_REWARD_INTERVAL_MS * 8,
      }),
    )
    expect(result.state.economy.apples).toBe(MAX_APPLES)
    expect(result.effects[0]).toMatchObject({ awardedApples: 1, fullRewardApples: 8 })
  })
})

describe('待办', () => {
  it('创建时整理标题，并支持更新、完成与重新打开', () => {
    const created = successful(
      reduce(initialState(), {
        type: 'todo/create',
        todoId: 'todo-1',
        title: '  好好吃苹果  ',
        dueAt: 500,
        now: 100,
      }),
    )
    expect(created.state.reality.todos['todo-1']).toMatchObject({
      title: '好好吃苹果',
      dueAt: 500,
      createdAt: 100,
      updatedAt: 100,
    })

    const updated = successful(
      reduce(created.state, {
        type: 'todo/update',
        todoId: 'todo-1',
        title: '  写完页面  ',
        dueAt: null,
        now: 110,
      }),
    )
    expect(updated.state.reality.todos['todo-1']).toMatchObject({
      title: '写完页面',
      dueAt: null,
      updatedAt: 110,
    })

    const completed = successful(
      reduce(updated.state, {
        type: 'todo/completion-set',
        todoId: 'todo-1',
        completed: true,
        now: 120,
      }),
    ).state
    expect(completed.reality.todos['todo-1']?.completedAt).toBe(120)
    const reopened = successful(
      reduce(completed, {
        type: 'todo/completion-set',
        todoId: 'todo-1',
        completed: false,
        now: 130,
      }),
    ).state
    expect(reopened.reality.todos['todo-1']?.completedAt).toBeNull()
  })

  it('截止时间改变会重置通知签发状态', () => {
    const state = createdTodo(initialState(), {
      dueAt: 200,
      notificationIssuedAt: 210,
    })
    const result = successful(
      reduce(state, {
        type: 'todo/update',
        todoId: 'todo-1',
        dueAt: 300,
        now: 220,
      }),
    )
    expect(result.state.reality.todos['todo-1']?.notificationIssuedAt).toBeNull()
  })

  it('拒绝空标题、重复 ID 和超过数量上限，失败保持原引用', () => {
    const state = createdTodo(initialState())
    for (const action of [
      { type: 'todo/create', todoId: 'todo-2', title: '  ', now: 200 },
      { type: 'todo/create', todoId: 'todo-1', title: '重复', now: 200 },
    ] satisfies ProductivityAction[]) {
      const result = reduce(state, action)
      expect(result.ok).toBe(false)
      expect(result.state).toBe(state)
    }

    const todos = Object.fromEntries(
      Array.from({ length: MAX_TODOS }, (_, index) => {
        const id = `todo-${index}`
        return [
          id,
          {
            id,
            title: `待办 ${index}`,
            createdAt: 0,
            updatedAt: 0,
            dueAt: null,
            completedAt: null,
            notificationIssuedAt: null,
          } satisfies TodoItem,
        ]
      }),
    )
    const full = {
      ...initialState(),
      reality: { ...initialState().reality, todos },
    }
    expect(
      reduce(full, { type: 'todo/create', todoId: 'overflow', title: '多一条', now: 1 }),
    ).toMatchObject({ ok: false, error: { code: 'TODO_LIMIT_REACHED' } })
  })

  it('删除苹果钟绑定的待办时原子解绑 session', () => {
    const withTodo = createdTodo(initialState())
    const started = successful(
      reduce(withTodo, {
        type: 'pomodoro/start',
        now: 200,
        durationMs: FOCUS_MS,
        todoId: 'todo-1',
      }),
    ).state
    const deleted = successful(
      reduce(started, { type: 'todo/delete', todoId: 'todo-1', now: 201 }),
    ).state

    expect(deleted.reality.todos['todo-1']).toBeUndefined()
    expect(deleted.reality.pomodoro.session?.todoId).toBeNull()
    expect(started.reality.pomodoro.session?.todoId).toBe('todo-1')
  })
})

describe('苹果钟与通知', () => {
  it('苹果钟序号或结束时间越界时均在创建 session 前原子拒绝', () => {
    const sequenceCapped = initialState()
    sequenceCapped.reality.pomodoro.nextSessionSequence = Number.MAX_SAFE_INTEGER
    const cappedBefore = structuredClone(sequenceCapped)
    const sequenceResult = reduce(sequenceCapped, {
      type: 'pomodoro/start',
      now: 0,
      durationMs: FOCUS_MS,
    })
    expect(sequenceResult).toMatchObject({ ok: false, error: { code: 'INVALID_AMOUNT' } })
    expect(sequenceResult.state).toBe(sequenceCapped)
    expect(sequenceCapped).toEqual(cappedBefore)

    const dateCapped = initialState()
    const dateBefore = structuredClone(dateCapped)
    const dateResult = reduce(dateCapped, {
      type: 'pomodoro/start',
      now: MAX_DATE_TIMESTAMP_MS - CYCLE_MS + 1,
      durationMs: FOCUS_MS,
    })
    expect(dateResult).toMatchObject({ ok: false, error: { code: 'INVALID_TIME' } })
    expect(dateResult.state).toBe(dateCapped)
    expect(dateCapped).toEqual(dateBefore)
  })

  it('只允许已收藏的明信片背景，并在开始时锁定背景', () => {
    const unowned = reduce(initialState(), {
      type: 'pomodoro/background-set',
      postcardId: 'postcard-1',
    })
    expect(unowned).toMatchObject({ ok: false, error: { code: 'UNKNOWN_COLLECTION' } })

    const owned = {
      ...initialState(),
      collections: {
        'postcard-1': { id: 'postcard-1', firstObtainedAt: 1, duplicateCount: 0 },
      },
    }
    const selected = successful(
      reduce(owned, { type: 'pomodoro/background-set', postcardId: 'postcard-1' }),
    ).state
    const started = successful(
      reduce(selected, {
        type: 'pomodoro/start',
        now: 10,
        durationMs: FOCUS_MS,
      }),
    ).state
    expect(started.reality.pomodoro.session).toMatchObject({
      sessionId: 'pomodoro-1',
      postcardId: 'postcard-1',
      status: 'focus',
      focusEndsAt: 10 + FOCUS_MS,
      cycleEndsAt: 10 + CYCLE_MS,
      focusDurationMs: FOCUS_MS,
      breakDurationMs: BREAK_MS,
    })

    const changed = successful(
      reduce(started, { type: 'pomodoro/background-set', postcardId: null }),
    ).state
    expect(changed.reality.pomodoro.selectedPostcardId).toBeNull()
    expect(changed.reality.pomodoro.session?.postcardId).toBe('postcard-1')
  })

  it.each([5 * 60_000, 24 * 60 * 60_000])('拒绝固定档位以外的时长 %i', (durationMs) => {
    const state = initialState()
    const result = reduce(state, { type: 'pomodoro/start', now: 0, durationMs })
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_DURATION' } })
    expect(result.state).toBe(state)
  })

  it('专注到点进入休息且不推进伴随日，休息结束才完成整轮', () => {
    const started = successful(
      reduce(initialState(), { type: 'pomodoro/start', now: 100, durationMs: FOCUS_MS }),
    ).state
    const resting = successful(reduce(started, { type: 'clock/tick', now: 100 + FOCUS_MS }))

    expect(resting.state.reality.pomodoro.session).toMatchObject({
      status: 'break',
      focusNotificationIssuedAt: 100 + FOCUS_MS,
      completionNotificationIssuedAt: null,
    })
    expect(resting.state.profile.companionDays).toBe(0)
    expect(resting.effects).toHaveLength(1)
    expect(resting.effects[0]).toMatchObject({
      type: 'pomodoro-break-started',
      notificationId: `pomodoro:pomodoro-1:focus:${100 + FOCUS_MS}`,
    })

    const completed = successful(reduce(resting.state, { type: 'clock/tick', now: 100 + CYCLE_MS }))
    expect(completed.state.reality.pomodoro.session).toMatchObject({
      status: 'completed',
      completedAt: 100 + CYCLE_MS,
    })
    expect(completed.state.profile.companionDays).toBe(1)
    expect(completed.effects[0]).toMatchObject({ type: 'pomodoro-completed' })
  })

  it('截止 tick 同时签发待办和苹果钟通知，后续 tick 不会重复', () => {
    const withTodo = createdTodo(initialState(), { dueAt: 500 })
    const started = successful(
      reduce(withTodo, {
        type: 'pomodoro/start',
        now: 0,
        durationMs: FOCUS_MS,
        todoId: 'todo-1',
      }),
    ).state
    const ticked = successful(reduce(started, { type: 'clock/tick', now: CYCLE_MS }))

    expect(started.profile.companionDays).toBe(0)
    expect(ticked.state.profile.companionDays).toBe(1)

    expect(ticked.effects).toEqual([
      {
        type: 'todo-notification-due',
        notificationId: 'todo:todo-1:500',
        todoId: 'todo-1',
        dueAt: 500,
        issuedAt: CYCLE_MS,
        notificationTitle: '待办时间到啦',
        notificationBody: '吃苹果',
      },
      {
        type: 'pomodoro-completed',
        notificationId: `pomodoro:pomodoro-1:complete:${CYCLE_MS}`,
        session: {
          sessionId: 'pomodoro-1',
          status: 'completed',
          startedAt: 0,
          focusEndsAt: FOCUS_MS,
          cycleEndsAt: CYCLE_MS,
          focusDurationMs: FOCUS_MS,
          breakDurationMs: BREAK_MS,
          completedAt: CYCLE_MS,
          focusNotificationIssuedAt: CYCLE_MS,
          completionNotificationIssuedAt: CYCLE_MS,
          todoId: 'todo-1',
          postcardId: null,
        },
        notificationTitle: '苹果钟完成啦',
        notificationBody: '“吃苹果”的专注和休息都完成啦',
      },
    ])

    const repeated = successful(reduce(ticked.state, { type: 'clock/tick', now: CYCLE_MS + 1 }))
    expect(repeated.state).toBe(ticked.state)
    expect(repeated.state.profile.companionDays).toBe(1)
    expect(repeated.effects).toEqual([])
  })

  it('已完成待办不签发截止通知', () => {
    const state = createdTodo(initialState(), { dueAt: 100, completedAt: 90 })
    const result = successful(reduce(state, { type: 'clock/tick', now: 100 }))
    expect(result.state).toBe(state)
    expect(result.effects).toEqual([])
  })

  it('截止前可取消，截止后取消会按绝对时间完成', () => {
    const started = successful(
      reduce(initialState(), {
        type: 'pomodoro/start',
        now: 100,
        durationMs: FOCUS_MS,
      }),
    ).state
    const cancelled = successful(
      reduce(started, { type: 'pomodoro/cancel', sessionId: 'pomodoro-1', now: 200 }),
    )
    expect(cancelled.state.reality.pomodoro.session).toBeNull()
    expect(cancelled.state.profile.companionDays).toBe(0)
    expect(cancelled.effects[0]).toMatchObject({ type: 'pomodoro-cancelled' })

    const restarted = successful(
      reduce(cancelled.state, {
        type: 'pomodoro/start',
        now: 300,
        durationMs: FOCUS_MS,
      }),
    ).state
    const afterDeadline = successful(
      reduce(restarted, {
        type: 'pomodoro/cancel',
        sessionId: 'pomodoro-2',
        now: 300 + CYCLE_MS,
      }),
    )
    expect(afterDeadline.state.reality.pomodoro.session?.status).toBe('completed')
    expect(afterDeadline.state.profile.companionDays).toBe(1)
    expect(afterDeadline.effects[0]).toMatchObject({ type: 'pomodoro-completed' })
  })

  it('取消前先按时间推进到休息阶段，再清除会话', () => {
    const started = successful(
      reduce(initialState(), { type: 'pomodoro/start', now: 0, durationMs: FOCUS_MS }),
    ).state
    const cancelled = successful(
      reduce(started, {
        type: 'pomodoro/cancel',
        sessionId: 'pomodoro-1',
        now: FOCUS_MS,
      }),
    )

    expect(cancelled.state.reality.pomodoro.session).toBeNull()
    expect(cancelled.state.profile.companionDays).toBe(0)
    expect(cancelled.effects.map((effect) => effect.type)).toEqual([
      'pomodoro-break-started',
      'pomodoro-cancelled',
    ])
  })

  it('未到点的 tick、现实停留结算和待办操作都不推进伴随日', () => {
    const entered = successful(reduce(initialState(), { type: 'reality/enter', now: 0 })).state
    const left = successful(
      reduce(entered, { type: 'reality/leave', now: REALITY_REWARD_INTERVAL_MS }),
    ).state
    const settled = successful(
      reduce(left, {
        type: 'reality/settle',
        stayId: 'reality-stay-1',
        decision: 'serious',
        now: REALITY_REWARD_INTERVAL_MS,
      }),
    ).state
    const withTodo = successful(
      reduce(settled, { type: 'todo/create', todoId: 'todo-1', title: '专注一下', now: 1 }),
    ).state
    const started = successful(
      reduce(withTodo, {
        type: 'pomodoro/start',
        now: 10,
        durationMs: FOCUS_MS,
      }),
    ).state
    const earlyTick = successful(reduce(started, { type: 'clock/tick', now: 10 + FOCUS_MS - 1 }))

    expect(entered.profile.companionDays).toBe(0)
    expect(left.profile.companionDays).toBe(0)
    expect(settled.profile.companionDays).toBe(0)
    expect(withTodo.profile.companionDays).toBe(0)
    expect(earlyTick.state.profile.companionDays).toBe(0)
  })

  it('苹果钟推进的第七个伴随日会结束活力效果并恢复普通偏好', () => {
    const original = initialState()
    const preferenceSequence = Number.MAX_SAFE_INTEGER
    let state: GameState = {
      ...original,
      profile: { ...original.profile, companionDays: 5 },
      player: {
        effects: {
          vitality: {
            activatedAt: 0,
            activatedOnCompanionDay: 0,
            expiresAfterCompanionDay: 7,
          },
        },
      },
      pet: {
        ...original.pet,
        preferences: { travel: true, computer: true, music: true },
        tired: false,
      },
      random: {
        ...original.random,
        sequences: { ...original.random.sequences, preferences: preferenceSequence },
      },
    }

    state = successful(
      reduce(state, { type: 'pomodoro/start', now: 0, durationMs: FOCUS_MS }),
    ).state
    const sixthDay = successful(reduce(state, { type: 'clock/tick', now: CYCLE_MS }))
    expect(sixthDay.state.profile.companionDays).toBe(6)
    expect(sixthDay.state.player.effects.vitality).not.toBeNull()
    expect(sixthDay.state.pet.preferences).toEqual({ travel: true, computer: true, music: true })
    expect(sixthDay.state.random.sequences.preferences).toBe(preferenceSequence)

    state = successful(
      reduce(sixthDay.state, {
        type: 'pomodoro/start',
        now: CYCLE_MS + 1_000,
        durationMs: FOCUS_MS,
      }),
    ).state
    const seventhDay = successful(reduce(state, { type: 'clock/tick', now: CYCLE_MS * 2 + 1_000 }))
    const expectedPreferenceGeneration = generateActivityPreferences(
      state.random.seed,
      preferenceSequence,
    )

    expect(seventhDay.state.profile.companionDays).toBe(7)
    expect(seventhDay.state.player.effects.vitality).toBeNull()
    expect(seventhDay.state.pet.preferences).toEqual(expectedPreferenceGeneration.preferences)
    expect(seventhDay.state.pet.tired).toBe(isPetTired(expectedPreferenceGeneration.preferences))
    expect(seventhDay.state.random.sequences.preferences).toBe(
      expectedPreferenceGeneration.nextSequence,
    )
    expect(gameStateV6Schema.safeParse(seventhDay.state).success).toBe(true)
    expect(seventhDay.effects).toContainEqual({
      type: 'player-effect-expired',
      effect: 'vitality',
      expiredAtCompanionDay: 7,
    })

    const repeated = successful(
      reduce(seventhDay.state, { type: 'clock/tick', now: CYCLE_MS * 2 + 1_001 }),
    )
    expect(repeated.state).toBe(seventhDay.state)
    expect(repeated.state.profile.companionDays).toBe(7)
  })

  it('达到伴随日上限后仍可计时、完成和签发待办提醒，但天数不再增长', () => {
    const original = createdTodo(initialState(), { dueAt: 1 })
    const capped: GameState = {
      ...original,
      profile: { ...original.profile, companionDays: MAX_COMPANION_DAYS },
    }
    const started = successful(
      reduce(capped, { type: 'pomodoro/start', now: 0, durationMs: FOCUS_MS }),
    ).state
    const completed = successful(reduce(started, { type: 'clock/tick', now: CYCLE_MS }))

    expect(completed.state.reality.pomodoro.session?.status).toBe('completed')
    expect(completed.state.profile.companionDays).toBe(MAX_COMPANION_DAYS)
    expect(completed.effects.map((effect) => effect.type)).toEqual([
      'todo-notification-due',
      'pomodoro-completed',
    ])

    const repeated = successful(reduce(completed.state, { type: 'clock/tick', now: CYCLE_MS + 1 }))
    expect(repeated.state).toBe(completed.state)
    expect(repeated.effects).toEqual([])
  })
})

describe('动作路由', () => {
  it('只识别生产力领域动作', () => {
    const productivity: GameAction = { type: 'clock/tick', now: 0 }
    const unrelated: GameAction = { type: 'pet/move', location: 'center' }
    expect(isProductivityAction(productivity)).toBe(true)
    expect(isProductivityAction(unrelated)).toBe(false)
  })
})
