import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import {
  gameStateV8Schema,
  isStrictGameStateV8,
  migrateGameStateV7ToV8,
  migrateStoredGameStateToV8,
} from './migrateGameStateV7'
import type { CollectionCatalog, GameStateV7 } from './types'

const catalog: CollectionCatalog = {
  postcard: ['postcard-v8'],
  'million-shot': ['million-v8'],
  'site-first': ['first-v8'],
  siteFirstChronology: ['first-v8'],
}

function v7Fixture(): GameStateV7 {
  const current = createInitialGameState({ now: 1_000, seed: 'strict-v7-to-v8' })
  const reality: GameStateV7['reality'] = {
    nextStaySequence: current.reality.nextStaySequence,
    activeStay: current.reality.activeStay,
    pendingSettlement: current.reality.pendingSettlement,
    todos: structuredClone(current.reality.todos),
    pomodoro: structuredClone(current.reality.pomodoro),
    streamHistory: structuredClone(current.reality.streamHistory),
  }
  return { ...structuredClone(current), schemaVersion: 7, reality }
}

describe('schemaVersion 7 -> 8 显式迁移', () => {
  it('只新增默认刷播设置，不修改冻结的 V7 输入', () => {
    const v7 = v7Fixture()
    const before = structuredClone(v7)
    const migrated = migrateGameStateV7ToV8(v7)

    expect(migrated).not.toBe(v7)
    expect(v7).toEqual(before)
    expect(migrated).toMatchObject({
      schemaVersion: 8,
      reality: {
        streamHistory: v7.reality.streamHistory,
        streamSettings: {
          selfTestBvid: null,
          dimensionPenetrationEnabled: false,
        },
      },
    })
    expect(gameStateV8Schema.safeParse(migrated).success).toBe(true)
  })

  it('V1-V7 先收敛到 V7 再迁移，严格 V8 原样返回', () => {
    const migrated = migrateStoredGameStateToV8(v7Fixture(), { now: 2_000, catalog })
    expect(migrated.schemaVersion).toBe(8)
    expect(migrateStoredGameStateToV8(migrated, { now: 3_000, catalog })).toBe(migrated)
  })

  it('严格拒绝缺失、多余或非法的刷播设置字段', () => {
    const current = migrateGameStateV7ToV8(v7Fixture())
    expect(isStrictGameStateV8(current)).toBe(true)
    expect(isStrictGameStateV8({ ...current, unexpected: true })).toBe(false)

    const missingSettings = structuredClone(current) as unknown as {
      reality: Record<string, unknown>
    }
    delete missingSettings.reality.streamSettings
    expect(isStrictGameStateV8(missingSettings)).toBe(false)

    expect(
      isStrictGameStateV8({
        ...current,
        reality: {
          ...current.reality,
          streamSettings: {
            selfTestBvid: '不是BV号',
            dimensionPenetrationEnabled: false,
          },
        },
      }),
    ).toBe(false)
    expect(
      isStrictGameStateV8({
        ...current,
        reality: {
          ...current.reality,
          streamSettings: {
            selfTestBvid: null,
            dimensionPenetrationEnabled: false,
            stray: true,
          },
        },
      }),
    ).toBe(false)
  })

  it('接受空自测视频和规范 BV，并保留维度穿透开关', () => {
    const current = migrateGameStateV7ToV8(v7Fixture())
    const configured = {
      ...current,
      reality: {
        ...current.reality,
        streamSettings: {
          selfTestBvid: 'BV1xx411c7mD',
          dimensionPenetrationEnabled: true,
        },
      },
    }

    expect(gameStateV8Schema.parse(configured).reality.streamSettings).toEqual({
      selfTestBvid: 'BV1xx411c7mD',
      dimensionPenetrationEnabled: true,
    })
  })
})
