import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { migrateGameStateV5ToV6 } from './migrateGameStateV5'
import {
  gameStateV7Schema,
  migrateGameStateV6ToV7,
  migrateStoredGameStateToV7,
} from './migrateGameStateV6'
import { gameStateV11Schema } from './migrateGameStateV10'
import { reduceGame } from './reducer'
import type { CollectionCatalog, GameStateV5, GameStateV6, GameTransition } from './types'

const catalog: CollectionCatalog = {
  postcard: ['postcard-1'],
  'million-shot': ['million-1'],
  'site-first': ['site-first-1'],
  siteFirstChronology: ['site-first-1'],
}

function v5Fixture(): GameStateV5 {
  const current = createInitialGameState({ now: 1_000, seed: 'v7-v5-fixture' })
  const reality = {
    nextStaySequence: current.reality.nextStaySequence,
    activeStay: current.reality.activeStay,
    pendingSettlement: current.reality.pendingSettlement,
    todos: current.reality.todos,
    pomodoro: current.reality.pomodoro,
  }
  const { wardrobe: _wardrobe, ...withoutWardrobe } = current
  void _wardrobe
  return { ...withoutWardrobe, schemaVersion: 5, reality }
}

function v6Fixture(): GameStateV6 {
  return migrateGameStateV5ToV6(v5Fixture())
}

function successful(transition: GameTransition): Extract<GameTransition, { ok: true }> {
  if (!transition.ok) throw new Error(transition.error.message)
  return transition
}

describe('schemaVersion 6 -> 7 显式迁移', () => {
  it('保留累计轮次，并把每条旧轮次确定性转换为一次完成会话', () => {
    const empty = v6Fixture()
    const v6: GameStateV6 = {
      ...empty,
      reality: {
        ...empty.reality,
        streamHistory: {
          completedRounds: 12,
          recentRounds: Array.from({ length: 10 }, (_, index) => ({
            round: 12 - index,
            completedAt: 20_000 - index,
          })),
        },
      },
    }
    const before = structuredClone(v6)

    const migrated = migrateGameStateV6ToV7(v6)

    expect(migrated).not.toBe(v6)
    expect(v6).toEqual(before)
    expect(migrated.schemaVersion).toBe(7)
    expect(migrated.reality.streamHistory).toEqual({
      completedRounds: 12,
      recentSessions: Array.from({ length: 10 }, (_, index) => {
        const round = 12 - index
        const completedAt = 20_000 - index
        return {
          sessionId: `legacy-v6-round-${round}`,
          startedAt: completedAt,
          endedAt: completedAt,
          roundsCompleted: 1,
          outcome: 'completed',
        }
      }),
    })
    expect(gameStateV7Schema.safeParse(migrated).success).toBe(true)
  })

  it('V1-V5 先收敛到 V6 再迁移，严格 V7 原样返回', () => {
    const migrated = migrateStoredGameStateToV7(v5Fixture(), { now: 2_000, catalog })
    expect(migrated.schemaVersion).toBe(7)
    expect(migrated.reality.streamHistory).toEqual({
      completedRounds: 0,
      recentSessions: [],
    })
    expect(migrateStoredGameStateToV7(migrated, { now: 3_000, catalog })).toBe(migrated)
  })
})

describe('V7 刷播会话历史', () => {
  it('每轮只增加累计轮次，任务结束时才新增一条会话记录', () => {
    let state = createInitialGameState({ now: 1_000, seed: 'stream-session' })
    for (const completedAt of [2_000, 3_000, 4_000]) {
      state = successful(
        reduceGame(
          state,
          {
            type: 'reality/stream-session-progress',
            sessionId: 'session-1',
            startedAt: 1_500,
            completedAt,
          },
          catalog,
        ),
      ).state
    }

    expect(state.reality.streamHistory).toEqual({
      completedRounds: 3,
      recentSessions: [],
    })

    state = successful(
      reduceGame(
        state,
        {
          type: 'reality/stream-session-end',
          sessionId: 'session-1',
          startedAt: 1_500,
          endedAt: 4_500,
          roundsCompleted: 3,
          outcome: 'completed',
        },
        catalog,
      ),
    ).state

    expect(state.reality.streamHistory).toEqual({
      completedRounds: 3,
      recentSessions: [
        {
          sessionId: 'session-1',
          startedAt: 1_500,
          endedAt: 4_500,
          roundsCompleted: 3,
          outcome: 'completed',
        },
      ],
    })
    expect(gameStateV11Schema.safeParse(state).success).toBe(true)
  })

  it('相同的结束动作保持幂等，冲突动作不能改写已结束记录', () => {
    let state = createInitialGameState({ now: 1_000, seed: 'stream-session-upsert' })
    state = successful(
      reduceGame(
        state,
        {
          type: 'reality/stream-session-progress',
          sessionId: 'session-1',
          startedAt: 1_500,
          completedAt: 2_000,
        },
        catalog,
      ),
    ).state
    state = successful(
      reduceGame(
        state,
        {
          type: 'reality/stream-session-end',
          sessionId: 'session-1',
          startedAt: 1_500,
          endedAt: 2_500,
          roundsCompleted: 1,
          outcome: 'stopped',
        },
        catalog,
      ),
    ).state
    const duplicate = reduceGame(
      state,
      {
        type: 'reality/stream-session-end',
        sessionId: 'session-1',
        startedAt: 1_500,
        endedAt: 2_500,
        roundsCompleted: 1,
        outcome: 'stopped',
      },
      catalog,
    )
    expect(duplicate).toMatchObject({ ok: true })
    expect(duplicate.state).toBe(state)

    const conflicting = reduceGame(
      state,
      {
        type: 'reality/stream-session-end',
        sessionId: 'session-1',
        startedAt: 1_500,
        endedAt: 2_600,
        roundsCompleted: 1,
        outcome: 'completed',
      },
      catalog,
    )
    expect(conflicting).toMatchObject({ ok: false, error: { code: 'DUPLICATE_ID' } })
    expect(conflicting.state).toBe(state)

    expect(state.reality.streamHistory.completedRounds).toBe(1)
    expect(state.reality.streamHistory.recentSessions).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        endedAt: 2_500,
        roundsCompleted: 1,
        outcome: 'stopped',
      }),
    ])
  })

  it('最近记录按结束时间排列并只保留十次任务', () => {
    let state = createInitialGameState({ now: 1_000, seed: 'stream-session-limit' })
    for (let index = 1; index <= 12; index += 1) {
      state = successful(
        reduceGame(
          state,
          {
            type: 'reality/stream-session-progress',
            sessionId: `session-${index}`,
            startedAt: 1_000 + index,
            completedAt: 2_000 + index,
          },
          catalog,
        ),
      ).state
      state = successful(
        reduceGame(
          state,
          {
            type: 'reality/stream-session-end',
            sessionId: `session-${index}`,
            startedAt: 1_000 + index,
            endedAt: 3_000 + index,
            roundsCompleted: 1,
            outcome: index % 2 === 0 ? 'completed' : 'stopped',
          },
          catalog,
        ),
      ).state
    }

    expect(state.reality.streamHistory.completedRounds).toBe(12)
    expect(state.reality.streamHistory.recentSessions.map((session) => session.sessionId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `session-${12 - index}`),
    )
    expect(gameStateV11Schema.safeParse(state).success).toBe(true)
  })

  it('拒绝非法时间、轮次、重复身份及超过累计轮次的结束记录', () => {
    const initial = createInitialGameState({ now: 1_000, seed: 'stream-session-invalid' })

    for (const action of [
      {
        type: 'reality/stream-session-progress' as const,
        sessionId: '',
        startedAt: 1_500,
        completedAt: 2_000,
      },
      {
        type: 'reality/stream-session-progress' as const,
        sessionId: 'session-1',
        startedAt: 999,
        completedAt: 2_000,
      },
      {
        type: 'reality/stream-session-end' as const,
        sessionId: 'session-1',
        startedAt: 1_500,
        endedAt: 1_499,
        roundsCompleted: 0,
        outcome: 'stopped' as const,
      },
      {
        type: 'reality/stream-session-end' as const,
        sessionId: 'session-1',
        startedAt: 1_500,
        endedAt: 2_000,
        roundsCompleted: 1,
        outcome: 'stopped' as const,
      },
    ]) {
      const rejected = reduceGame(initial, action, catalog)
      expect(rejected.ok).toBe(false)
      expect(rejected.state).toBe(initial)
    }
  })

  it('当前严格 schema 拒绝额外字段、重复会话、非因果时间和会话轮次超出累计值', () => {
    const valid = createInitialGameState({ now: 1_000, seed: 'v8-stream-history-schema' })
    expect(gameStateV11Schema.safeParse(valid).success).toBe(true)

    const session = {
      sessionId: 'session-1',
      startedAt: 1_500,
      endedAt: 2_000,
      roundsCompleted: 1,
      outcome: 'completed' as const,
    }
    const invalidHistories = [
      { completedRounds: 0, recentSessions: [], stray: true },
      { completedRounds: 1, recentSessions: [session, session] },
      {
        completedRounds: 1,
        recentSessions: [{ ...session, startedAt: 2_100, endedAt: 2_000 }],
      },
      { completedRounds: 0, recentSessions: [session] },
      {
        completedRounds: 1,
        recentSessions: [{ ...session, startedAt: 999, endedAt: 2_000 }],
      },
    ]

    for (const streamHistory of invalidHistories) {
      expect(
        gameStateV11Schema.safeParse({
          ...valid,
          reality: { ...valid.reality, streamHistory },
        }).success,
      ).toBe(false)
    }
  })
})
