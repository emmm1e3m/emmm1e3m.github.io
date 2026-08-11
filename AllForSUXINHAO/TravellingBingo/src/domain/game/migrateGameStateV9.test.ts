import { describe, expect, it } from 'vitest'

import { DEFAULT_STREAM_FAVORITE_ID, STREAM_FAVORITE_IDS } from './constants'
import { createInitialGameState } from './createGameState'
import {
  gameStateV10Schema,
  isStrictGameStateV10,
  migrateGameStateV9ToV10,
  migrateStoredGameStateToV10,
} from './migrateGameStateV9'
import type { CollectionCatalog, GameStateV9 } from './types'

const catalog: CollectionCatalog = {
  postcard: ['postcard-v10'],
  'million-shot': ['million-v10'],
  'site-first': ['first-v10'],
  siteFirstChronology: ['first-v10'],
}

function v9Fixture(): GameStateV9 {
  const current = createInitialGameState({ now: 1_000, seed: 'strict-v9-to-v10' })
  return {
    ...structuredClone(current),
    schemaVersion: 9,
    reality: {
      ...structuredClone(current.reality),
      streamSettings: {
        selfTestBvid: 'BV1xx411c7mD',
        dimensionPenetrationEnabled: true,
      },
    },
  }
}

describe('schemaVersion 9 -> 10 显式迁移', () => {
  it('保留自测 BV、删除维度穿透开关并选择默认收藏夹，不修改冻结的 V9 输入', () => {
    const v9 = v9Fixture()
    const before = structuredClone(v9)
    const migrated = migrateGameStateV9ToV10(v9)

    expect(v9).toEqual(before)
    expect(migrated).toMatchObject({
      schemaVersion: 10,
      reality: {
        streamSettings: {
          selfTestBvid: 'BV1xx411c7mD',
          favoriteId: DEFAULT_STREAM_FAVORITE_ID,
        },
      },
    })
    expect(migrated.reality.streamSettings).not.toHaveProperty('dimensionPenetrationEnabled')
    expect(gameStateV10Schema.safeParse(migrated).success).toBe(true)
  })

  it('V1-V9 先收敛到 V9 再迁移，严格 V10 原样返回', () => {
    const migrated = migrateStoredGameStateToV10(v9Fixture(), { now: 2_000, catalog })
    expect(migrated.schemaVersion).toBe(10)
    expect(migrateStoredGameStateToV10(migrated, { now: 3_000, catalog })).toBe(migrated)
  })

  it('严格拒绝缺失、多余、旧版或未发布的刷播设置字段', () => {
    const current = migrateGameStateV9ToV10(v9Fixture())
    expect(isStrictGameStateV10(current)).toBe(true)
    expect(isStrictGameStateV10({ ...current, unexpected: true })).toBe(false)

    const missingFavorite = structuredClone(current) as unknown as {
      reality: { streamSettings: Record<string, unknown> }
    }
    delete missingFavorite.reality.streamSettings.favoriteId
    expect(isStrictGameStateV10(missingFavorite)).toBe(false)

    expect(
      isStrictGameStateV10({
        ...current,
        reality: {
          ...current.reality,
          streamSettings: { ...current.reality.streamSettings, favoriteId: 3963921644 },
        },
      }),
    ).toBe(false)
    expect(
      isStrictGameStateV10({
        ...current,
        reality: {
          ...current.reality,
          streamSettings: { ...current.reality.streamSettings, favoriteId: '3682220021' },
        },
      }),
    ).toBe(false)
    expect(
      isStrictGameStateV10({
        ...current,
        reality: {
          ...current.reality,
          streamSettings: {
            ...current.reality.streamSettings,
            dimensionPenetrationEnabled: false,
          },
        },
      }),
    ).toBe(false)
  })

  it('只接受两个发布收藏夹，并继续严格校验自测 BV', () => {
    const current = migrateGameStateV9ToV10(v9Fixture())
    for (const favoriteId of STREAM_FAVORITE_IDS) {
      expect(
        gameStateV10Schema.parse({
          ...current,
          reality: {
            ...current.reality,
            streamSettings: { selfTestBvid: null, favoriteId },
          },
        }).reality.streamSettings,
      ).toEqual({ selfTestBvid: null, favoriteId })
    }

    expect(
      isStrictGameStateV10({
        ...current,
        reality: {
          ...current.reality,
          streamSettings: {
            selfTestBvid: '不是BV号',
            favoriteId: DEFAULT_STREAM_FAVORITE_ID,
          },
        },
      }),
    ).toBe(false)
  })
})
