import { describe, expect, it } from 'vitest'

import { TASK_LIBRARY } from '../tasks/taskBoard'
import { MAX_APPLES } from './constants'
import { gameStateV1Schema, isStrictGameStateV1, migrateGameStateV1 } from './migrateGameStateV1'
import { migrateGameStateV1ToV3, migrateStoredGameStateToV3 } from './migrateGameStateV2'
import { migrateGameStateV1ToV4 } from './migrateGameStateV3'
import { migrateGameStateV4ToV5 } from './migrateGameStateV4'
import { reduceGame } from './reducer'
import type { CollectionCatalog, GameStateV1 } from './types'
import { validateImportedGameState } from './validateImportedGameState'
import { MAX_DATE_TIMESTAMP_MS } from './time'

const catalog: CollectionCatalog = {
  postcard: ['postcard-1'],
  'million-shot': ['million-1'],
  'site-first': ['first-1'],
  siteFirstChronology: ['first-1'],
}

function legacyState(): GameStateV1 {
  return {
    schemaVersion: 1,
    profile: { createdAt: 1_000, debug: true },
    economy: { apples: 23 },
    inventory: {
      'travel-basic': 0,
      'travel-apple': 2,
      'signal-headphones': 3,
      'trend-toolbox': 4,
      'lucky-apple': 0,
    },
    collections: {
      'postcard-1': { id: 'postcard-1', firstObtainedAt: 1_500, duplicateCount: 0 },
    },
    activeActivity: {
      runId: 'legacy-run',
      kind: 'travel',
      startedAt: 2_000,
      endsAt: 4_322_000,
      rewardSeed: 'legacy-seed:6',
      rewardPlan: {
        baseApples: 8,
        modifierApples: 3,
        collection: { id: 'postcard-1', category: 'postcard' },
        friendEventId: 'signal-dog',
        guaranteedByPity: true,
        pityAfterClaim: 6,
      },
      supplyId: 'travel-basic',
      usedLuckyApple: true,
    },
    pity: { stream: 2, trend: 7 },
    statistics: {
      started: { travel: 5, stream: 4, trend: 3 },
      claimed: { travel: 4, stream: 4, trend: 3 },
      applesEarned: 50,
      duplicateRewards: 2,
    },
    random: { seed: 'legacy-seed', sequence: 7 },
  }
}

describe('v1 存档显式迁移', () => {
  it('严格 v1 schema 接受完整旧状态并拒绝任意未知字段', () => {
    const legacy = legacyState()
    expect(gameStateV1Schema.safeParse(legacy).success).toBe(true)
    expect(isStrictGameStateV1(legacy)).toBe(true)
    expect(gameStateV1Schema.safeParse({ ...legacy, uiModalWasOpen: true }).success).toBe(false)
    expect(
      gameStateV1Schema.safeParse({
        ...legacy,
        profile: { ...legacy.profile, unknown: 'no' },
      }).success,
    ).toBe(false)

    const reversed = structuredClone(legacy)
    reversed.activeActivity!.endsAt = reversed.activeActivity!.startedAt - 1
    expect(isStrictGameStateV1(reversed)).toBe(false)

    const immediatelyCompleted = structuredClone(legacy)
    immediatelyCompleted.activeActivity!.endsAt = immediatelyCompleted.activeActivity!.startedAt
    expect(isStrictGameStateV1(immediatelyCompleted)).toBe(true)
    expect(
      gameStateV1Schema.safeParse({
        ...legacy,
        activeActivity: { ...legacy.activeActivity!, visualPose: 'travel' },
      }).success,
    ).toBe(false)

    const dateBoundary = structuredClone(legacy)
    dateBoundary.profile.createdAt = MAX_DATE_TIMESTAMP_MS
    expect(isStrictGameStateV1(dateBoundary)).toBe(true)
    dateBoundary.profile.createdAt = MAX_DATE_TIMESTAMP_MS + 1
    expect(isStrictGameStateV1(dateBoundary)).toBe(false)
  })

  it('活动中的旧档保留完整奖励与时间快照，不返还已经消耗的补给', () => {
    const legacy = legacyState()
    const original = structuredClone(legacy)
    const migrated = migrateGameStateV1(legacy, { now: 9_000, catalog })

    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.inventory['travel-basic']).toBe(0)
    expect(migrated.inventory['lucky-apple']).toBe(0)
    expect(migrated.activeActivity).toMatchObject({
      runId: 'legacy-run',
      startedAt: 2_000,
      endsAt: 4_322_000,
      rewardPlan: {
        baseApples: 8,
        modifierApples: 3,
        collection: { id: 'postcard-1', category: 'postcard' },
        friendEventId: 'signal-dog',
        guaranteedByPity: true,
        pityAfterClaim: 6,
      },
    })
    expect(migrated.pet.location).toBe('outside')
    expect(migrated.random.sequences.reward).toBe(7)
    expect(migrated.tasks.active).toHaveLength(3)
    expect(
      new Set(migrated.tasks.active.map((entry) => TASK_LIBRARY[entry.taskId].triggerGroup)).size,
    ).toBe(3)
    expect(legacy).toEqual(original)
    expect(gameStateV1Schema.safeParse(migrated).success).toBe(false)
  })

  it('没有进行中活动时不凭空返还补给', () => {
    const legacy = legacyState()
    legacy.activeActivity = null
    const migrated = migrateGameStateV1(legacy, { now: 9_000, catalog })

    expect(migrated.inventory).toEqual(legacy.inventory)
    expect(migrated.pet.location).toBe('center')
  })

  it('可沿严格迁移链直接升级到 V3，并保留旧活动时间与朋友结果', () => {
    const legacy = legacyState()
    const migrated = migrateGameStateV1ToV3(legacy, { now: 9_000, catalog })

    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.profile).toMatchObject({ displayName: '你', companionDays: 11 })
    expect(migrated.friends).toEqual({})
    expect(migrated.activeActivity).toMatchObject({
      runId: 'legacy-run',
      startedAt: 2_000,
      endsAt: 4_322_000,
      rewardSeed: 'legacy-seed:6',
      rewardPlan: {
        baseApples: 8,
        modifierApples: 3,
        collection: { id: 'postcard-1', category: 'postcard' },
        friendId: 'signal-dog',
        giftItemId: null,
        guaranteedByPity: true,
        pityAfterClaim: 6,
      },
    })
    expect(migrated.inventory).toMatchObject({ 'travel-basic': 0, 'lucky-apple': 0 })
    expect(migrateStoredGameStateToV3(legacy, { now: 9_000, catalog })).toEqual(migrated)
  })

  it('V1 未领取的收藏与朋友双结果可在 V3 原样结算', () => {
    const legacy = legacyState()
    legacy.activeActivity!.rewardPlan.collection = {
      id: 'postcard-2',
      category: 'postcard',
    }
    const expandedCatalog: CollectionCatalog = {
      ...catalog,
      postcard: [...catalog.postcard, 'postcard-2'],
    }
    const migratedV4 = migrateGameStateV1ToV4(legacy, {
      now: 9_000,
      catalog: expandedCatalog,
    })
    const migrated = migrateGameStateV4ToV5(migratedV4)
    expect(validateImportedGameState(migrated, expandedCatalog)).toEqual({ ok: true })
    expect(migrated.activeActivity?.legacySource).toBe('v1')
    const applesBefore = migrated.economy.apples
    const claimed = reduceGame(
      migrated,
      {
        type: 'activity/claim',
        runId: migrated.activeActivity!.runId,
        now: migrated.activeActivity!.endsAt,
      },
      expandedCatalog,
    )
    if (!claimed.ok) throw new Error(claimed.error.message)

    expect(claimed.state.collections['postcard-2']).toBeDefined()
    expect(claimed.state.friends['signal-dog']).toMatchObject({
      encounterCount: 1,
      totalGiftApples: 0,
    })
    expect(claimed.state.economy.apples).toBe(applesBefore + 11)
    expect(claimed.state.inventory).toMatchObject({ 'travel-basic': 0, 'lucky-apple': 0 })
    expect(claimed.effects[0]).toMatchObject({
      summary: {
        apples: { base: 8, modifier: 3, total: 11 },
        collection: { id: 'postcard-2' },
        friendId: 'signal-dog',
        giftItemId: null,
        giftApples: 0,
        guaranteedByPity: true,
      },
    })
  })

  it('V1 已拥有的计划收藏按历史规则结算重复次数与补偿', () => {
    const legacy = legacyState()
    const migrated = migrateGameStateV4ToV5(migrateGameStateV1ToV4(legacy, { now: 9_000, catalog }))
    const applesBefore = migrated.economy.apples
    const duplicateRewardsBefore = migrated.statistics.duplicateRewards
    expect(migrated.activeActivity?.legacySource).toBe('v1')
    expect(validateImportedGameState(migrated, catalog)).toEqual({ ok: true })

    const claimed = reduceGame(
      migrated,
      {
        type: 'activity/claim',
        runId: migrated.activeActivity!.runId,
        now: migrated.activeActivity!.endsAt,
      },
      catalog,
    )
    if (!claimed.ok) throw new Error(claimed.error.message)

    expect(claimed.state.economy.apples).toBe(applesBefore + 8 + 3 + 2)
    expect(claimed.state.collections['postcard-1']?.duplicateCount).toBe(1)
    expect(claimed.state.statistics.duplicateRewards).toBe(duplicateRewardsBefore + 1)
    expect(claimed.effects[0]).toMatchObject({
      summary: {
        apples: { base: 8, modifier: 3, duplicateCompensation: 2, total: 13 },
        collection: { id: 'postcard-1', duplicate: true },
        guaranteedByPity: true,
      },
    })
  })

  it('V1 冻结奖励空间不足时保持整次待领取，不截断或部分写入', () => {
    const migrated = migrateGameStateV4ToV5(
      migrateGameStateV1ToV4(legacyState(), { now: 9_000, catalog }),
    )
    const capped: typeof migrated = {
      ...migrated,
      economy: { apples: MAX_APPLES - 1 },
    }
    const result = reduceGame(
      capped,
      {
        type: 'activity/claim',
        runId: capped.activeActivity!.runId,
        now: capped.activeActivity!.endsAt,
      },
      catalog,
    )

    expect(result).toMatchObject({ ok: false, error: { code: 'APPLE_LIMIT_REACHED' } })
    expect(result.state).toBe(capped)
    expect(result.effects).toEqual([])
  })

  it('拒绝无效迁移时间', () => {
    expect(() => migrateGameStateV1(legacyState(), { now: -1, catalog })).toThrow(RangeError)
  })
})
