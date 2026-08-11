import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { gameStateV5Schema } from './migrateGameStateV4'
import {
  gameStateV6Schema,
  migrateGameStateV5ToV6,
  migrateStoredGameStateToV6,
} from './migrateGameStateV5'
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
  const current = createInitialGameState({ now: 1_000, seed: 'v5-fixture' })
  const reality: GameStateV5['reality'] = {
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
    const valid = migrateGameStateV5ToV6(v5Fixture())
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

    const discontinuous: GameStateV6 = {
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

    const nonMonotonic: GameStateV6 = {
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

    const beforeProfileCreated: GameStateV6 = {
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

    const invalidTimestamp: GameStateV6 = {
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
})
