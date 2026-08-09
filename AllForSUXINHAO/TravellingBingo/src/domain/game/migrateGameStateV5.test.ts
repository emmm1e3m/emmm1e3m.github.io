import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { gameStateV5Schema } from './migrateGameStateV4'
import {
  gameStateV6Schema,
  migrateGameStateV5ToV6,
  migrateStoredGameStateToV6,
} from './migrateGameStateV5'
import { reduceGame } from './reducer'
import type { CollectionCatalog, GameState, GameStateV5, GameTransition } from './types'

const catalog: CollectionCatalog = {
  postcard: ['postcard-1'],
  'million-shot': ['million-1'],
  'site-first': ['site-first-1'],
  siteFirstChronology: ['site-first-1'],
}

function v5Fixture(): GameStateV5 {
  const current = createInitialGameState({ now: 1_000, seed: 'v5-fixture' })
  const reality: GameStateV5['reality'] = {
    nextStaySequence: current.reality.nextStaySequence,
    activeStay: current.reality.activeStay,
    pendingSettlement: current.reality.pendingSettlement,
    todos: current.reality.todos,
    pomodoro: current.reality.pomodoro,
  }
  return { ...current, schemaVersion: 5, reality }
}

function successful(transition: GameTransition): Extract<GameTransition, { ok: true }> {
  if (!transition.ok) throw new Error(transition.error.message)
  return transition
}

describe('schemaVersion 5 -> 6 显式迁移', () => {
  it('保持 V5 冻结，并为 V6 初始化空刷播历史', () => {
    const v5 = v5Fixture()
    const before = structuredClone(v5)

    expect(gameStateV5Schema.safeParse(v5).success).toBe(true)
    const migrated = migrateGameStateV5ToV6(v5)

    expect(migrated.schemaVersion).toBe(6)
    expect(migrated.reality.streamHistory).toEqual({ completedRounds: 0, recentRounds: [] })
    expect(gameStateV6Schema.safeParse(migrated).success).toBe(true)
    expect(gameStateV5Schema.safeParse(migrated).success).toBe(false)
    expect(v5).toEqual(before)
    expect(migrated).not.toBe(v5)
    expect(migrated.reality).not.toBe(v5.reality)
  })

  it('旧存档先收敛到 V5 再迁移，严格 V6 原样返回', () => {
    const migrated = migrateStoredGameStateToV6(v5Fixture(), { now: 2_000, catalog })
    expect(migrated.schemaVersion).toBe(6)
    expect(migrated.reality.streamHistory).toEqual({ completedRounds: 0, recentRounds: [] })
    expect(migrateStoredGameStateToV6(migrated, { now: 3_000, catalog })).toBe(migrated)
  })
})

describe('V6 刷播历史严格状态', () => {
  it('拒绝缺失、额外字段、断裂轮次和非因果时间', () => {
    const valid = createInitialGameState({ now: 1_000, seed: 'v6-schema' })
    expect(gameStateV6Schema.safeParse(valid).success).toBe(true)

    const missingHistory = structuredClone(valid) as unknown as {
      reality: Record<string, unknown>
    }
    delete missingHistory.reality.streamHistory
    expect(gameStateV6Schema.safeParse(missingHistory).success).toBe(false)

    expect(
      gameStateV6Schema.safeParse({
        ...valid,
        reality: {
          ...valid.reality,
          streamHistory: { completedRounds: 0, recentRounds: [], stray: true },
        },
      }).success,
    ).toBe(false)

    const discontinuous: GameState = {
      ...valid,
      reality: {
        ...valid.reality,
        streamHistory: {
          completedRounds: 2,
          recentRounds: [
            { round: 2, completedAt: 3_000 },
            { round: 0, completedAt: 2_000 },
          ],
        },
      },
    }
    expect(gameStateV6Schema.safeParse(discontinuous).success).toBe(false)

    const nonMonotonic: GameState = {
      ...valid,
      reality: {
        ...valid.reality,
        streamHistory: {
          completedRounds: 2,
          recentRounds: [
            { round: 2, completedAt: 2_000 },
            { round: 1, completedAt: 3_000 },
          ],
        },
      },
    }
    expect(gameStateV6Schema.safeParse(nonMonotonic).success).toBe(false)

    const beforeProfileCreated: GameState = {
      ...valid,
      reality: {
        ...valid.reality,
        streamHistory: {
          completedRounds: 1,
          recentRounds: [{ round: 1, completedAt: valid.profile.createdAt - 1 }],
        },
      },
    }
    expect(gameStateV6Schema.safeParse(beforeProfileCreated).success).toBe(false)

    const invalidTimestamp: GameState = {
      ...valid,
      reality: {
        ...valid.reality,
        streamHistory: {
          completedRounds: 1,
          recentRounds: [{ round: 1, completedAt: Number.MAX_SAFE_INTEGER }],
        },
      },
    }
    expect(gameStateV6Schema.safeParse(invalidTimestamp).success).toBe(false)
  })

  it('reducer 生成连续轮次，最新在前并只保留十条', () => {
    let state = createInitialGameState({ now: 1_000, seed: 'stream-rounds' })
    for (let round = 1; round <= 12; round += 1) {
      state = successful(
        reduceGame(
          state,
          { type: 'reality/stream-round-complete', completedAt: 10_000 + round },
          catalog,
        ),
      ).state
    }

    expect(state.reality.streamHistory.completedRounds).toBe(12)
    expect(state.reality.streamHistory.recentRounds).toEqual(
      Array.from({ length: 10 }, (_, index) => ({
        round: 12 - index,
        completedAt: 10_012 - index,
      })),
    )
    expect(gameStateV6Schema.safeParse(state).success).toBe(true)
  })

  it('拒绝非法、早于建档、不晚于上轮的时间与计数器上限', () => {
    const initial = createInitialGameState({ now: 1_000, seed: 'stream-invalid' })
    const beforeProfileCreated = reduceGame(
      initial,
      { type: 'reality/stream-round-complete', completedAt: 999 },
      catalog,
    )
    expect(beforeProfileCreated).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TIME' },
    })
    expect(beforeProfileCreated.state).toBe(initial)

    const once = successful(
      reduceGame(initial, { type: 'reality/stream-round-complete', completedAt: 2_000 }, catalog),
    ).state

    for (const completedAt of [-1, 1.5, Number.MAX_SAFE_INTEGER]) {
      const rejected = reduceGame(
        once,
        { type: 'reality/stream-round-complete', completedAt },
        catalog,
      )
      expect(rejected).toMatchObject({ ok: false, error: { code: 'INVALID_TIME' } })
      expect(rejected.state).toBe(once)
    }

    for (const completedAt of [2_000, 1_999]) {
      const rejected = reduceGame(
        once,
        { type: 'reality/stream-round-complete', completedAt },
        catalog,
      )
      expect(rejected).toMatchObject({ ok: false, error: { code: 'INVALID_TIME' } })
      expect(rejected.state).toBe(once)
    }

    const capped: GameState = {
      ...once,
      reality: {
        ...once.reality,
        streamHistory: {
          completedRounds: Number.MAX_SAFE_INTEGER,
          recentRounds: Array.from({ length: 10 }, (_, index) => ({
            round: Number.MAX_SAFE_INTEGER - index,
            completedAt: 20_000 - index,
          })),
        },
      },
    }
    expect(gameStateV6Schema.safeParse(capped).success).toBe(true)
    const rejected = reduceGame(
      capped,
      { type: 'reality/stream-round-complete', completedAt: 20_001 },
      catalog,
    )
    expect(rejected).toMatchObject({ ok: false, error: { code: 'INVALID_AMOUNT' } })
    expect(rejected.state).toBe(capped)
  })
})
