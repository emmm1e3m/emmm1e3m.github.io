import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { migrateGameStateV5ToV6 } from './migrateGameStateV5'
import {
  gameStateV7Schema,
  migrateGameStateV6ToV7,
  migrateStoredGameStateToV7,
} from './migrateGameStateV6'
import { gameStateV12Schema } from './migrateGameStateV11'
import { reduceGame } from './reducer'
import type {
  CollectionCatalog,
  GameStateV5,
  GameStateV6,
  PomodoroState,
  PomodoroStateV12,
} from './types'

const catalog: CollectionCatalog = {
  postcard: ['postcard-1'],
  'million-shot': ['million-1'],
  'site-first': ['site-first-1'],
  siteFirstChronology: ['site-first-1'],
}

function projectPomodoroV12ToLegacy(pomodoro: PomodoroStateV12): PomodoroState {
  const session =
    pomodoro.session === null
      ? null
      : (() => {
          const { background, ...legacySession } = pomodoro.session
          return {
            ...legacySession,
            postcardId: background?.kind === 'postcard' ? background.id : null,
          }
        })()
  return {
    nextSessionSequence: pomodoro.nextSessionSequence,
    selectedPostcardId:
      pomodoro.selectedBackground?.kind === 'postcard' ? pomodoro.selectedBackground.id : null,
    session,
  }
}

function v5Fixture(): GameStateV5 {
  const current = createInitialGameState({ now: 1_000, seed: 'v7-v5-fixture' })
  const reality = {
    nextStaySequence: current.reality.nextStaySequence,
    activeStay: current.reality.activeStay,
    pendingSettlement: current.reality.pendingSettlement,
    todos: current.reality.todos,
    pomodoro: projectPomodoroV12ToLegacy(current.reality.pomodoro),
  }
  const { wardrobe: _wardrobe, ...withoutWardrobe } = current
  void _wardrobe
  return { ...withoutWardrobe, schemaVersion: 5, reality }
}

function v6Fixture(): GameStateV6 {
  return migrateGameStateV5ToV6(v5Fixture())
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

describe('冻结的刷播历史兼容字段', () => {
  it('当前设置动作不会改写已有历史', () => {
    const initial = createInitialGameState({ now: 1_000, seed: 'stream-history-read-only' })
    const streamHistory = {
      completedRounds: 2,
      recentSessions: [
        {
          sessionId: 'legacy-session',
          startedAt: 1_500,
          endedAt: 2_000,
          roundsCompleted: 2,
          outcome: 'completed' as const,
        },
      ],
    }
    const state = {
      ...initial,
      reality: { ...initial.reality, streamHistory },
    }

    const transition = reduceGame(
      state,
      { type: 'reality/stream-favorite-set', favoriteId: 3986840044 },
      catalog,
    )

    expect(transition.ok).toBe(true)
    expect(transition.state.reality.streamHistory).toBe(streamHistory)
  })

  it('当前严格 schema 拒绝额外字段、重复会话、非因果时间和会话轮次超出累计值', () => {
    const valid = createInitialGameState({ now: 1_000, seed: 'v8-stream-history-schema' })
    expect(gameStateV12Schema.safeParse(valid).success).toBe(true)

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
        gameStateV12Schema.safeParse({
          ...valid,
          reality: { ...valid.reality, streamHistory },
        }).success,
      ).toBe(false)
    }
  })
})
