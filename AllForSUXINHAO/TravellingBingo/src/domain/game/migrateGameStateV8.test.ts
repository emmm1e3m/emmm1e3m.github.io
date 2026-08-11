import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { migrateGameStateV7ToV8 } from './migrateGameStateV7'
import {
  gameStateV9Schema,
  isStrictGameStateV9,
  migrateGameStateV8ToV9,
  migrateStoredGameStateToV9,
} from './migrateGameStateV8'
import type {
  CollectionCatalog,
  GameStateV7,
  GameStateV8,
  PomodoroState,
  PomodoroStateV12,
} from './types'

const catalog: CollectionCatalog = {
  postcard: ['postcard-v9'],
  'million-shot': ['million-v9'],
  'site-first': ['first-v9'],
  siteFirstChronology: ['first-v9'],
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

function v8Fixture(active = false): GameStateV8 {
  const current = createInitialGameState({ now: 1_000, seed: 'strict-v8-to-v9' })
  const { wardrobe: _wardrobe, ...withoutWardrobe } = structuredClone(current)
  void _wardrobe
  const v7: GameStateV7 = {
    ...withoutWardrobe,
    schemaVersion: 7,
    reality: {
      nextStaySequence: active ? 1 : 0,
      activeStay: active ? { stayId: 'reality-stay-1', enteredAt: 1_500 } : null,
      pendingSettlement: null,
      todos: structuredClone(current.reality.todos),
      pomodoro: projectPomodoroV12ToLegacy(current.reality.pomodoro),
      streamHistory: structuredClone(current.reality.streamHistory),
    },
    world: active ? 'reality' : 'game',
  }
  return migrateGameStateV7ToV8(v7)
}

describe('schemaVersion 8 -> 9 显式迁移', () => {
  it('只新增现实页面租约状态，不修改冻结的 V8 输入', () => {
    const v8 = v8Fixture(true)
    const before = structuredClone(v8)
    const migrated = migrateGameStateV8ToV9(v8)

    expect(v8).toEqual(before)
    expect(migrated).toMatchObject({
      schemaVersion: 9,
      world: 'reality',
      reality: {
        activeStay: {
          stayId: 'reality-stay-1',
          enteredAt: 1_500,
          activeDurationMs: 0,
          leaseStartedAt: null,
        },
      },
    })
    expect(gameStateV9Schema.safeParse(migrated).success).toBe(true)
  })

  it('V1-V8 先收敛到 V8 再迁移，严格 V9 原样返回', () => {
    const migrated = migrateStoredGameStateToV9(v8Fixture(), { now: 2_000, catalog })
    expect(migrated.schemaVersion).toBe(9)
    expect(migrateStoredGameStateToV9(migrated, { now: 3_000, catalog })).toBe(migrated)
  })

  it('已结束的 V8 待结算按原墙钟时长补充有效时长证据', () => {
    const v8 = v8Fixture()
    v8.reality.pendingSettlement = {
      stayId: 'legacy-settlement',
      enteredAt: 2_000,
      leftAt: 1_202_000,
      fullRewardApples: 2,
    }

    const migrated = migrateGameStateV8ToV9(v8)
    expect(migrated.reality.pendingSettlement).toEqual({
      ...v8.reality.pendingSettlement,
      activeDurationMs: 1_200_000,
    })
    expect(gameStateV9Schema.safeParse(migrated).success).toBe(true)
  })

  it('严格拒绝缺失、多余或非法的租约字段', () => {
    const current = migrateGameStateV8ToV9(v8Fixture(true))
    expect(isStrictGameStateV9(current)).toBe(true)
    expect(isStrictGameStateV9({ ...current, unexpected: true })).toBe(false)

    const missingDuration = structuredClone(current) as unknown as {
      reality: { activeStay: Record<string, unknown> }
    }
    delete missingDuration.reality.activeStay.activeDurationMs
    expect(isStrictGameStateV9(missingDuration)).toBe(false)

    expect(
      isStrictGameStateV9({
        ...current,
        reality: {
          ...current.reality,
          activeStay: { ...current.reality.activeStay!, activeDurationMs: -1 },
        },
      }),
    ).toBe(false)
    expect(
      isStrictGameStateV9({
        ...current,
        reality: {
          ...current.reality,
          activeStay: { ...current.reality.activeStay!, leaseStartedAt: 1_499 },
        },
      }),
    ).toBe(false)
  })
})
