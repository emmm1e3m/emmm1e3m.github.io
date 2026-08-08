import { describe, expect, it } from 'vitest'

import { TASK_LIBRARY } from '../tasks/taskBoard'
import { gameStateV1Schema, isStrictGameStateV1, migrateGameStateV1 } from './migrateGameStateV1'
import type { CollectionCatalog, GameStateV1 } from './types'

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
        guaranteedByPity: false,
        pityAfterClaim: null,
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
    expect(
      gameStateV1Schema.safeParse({
        ...legacy,
        activeActivity: { ...legacy.activeActivity!, visualPose: 'travel' },
      }).success,
    ).toBe(false)
  })

  it('活动中的旧档只返还一次补给，清零未领苹果与尚未领取的重复收藏', () => {
    const legacy = legacyState()
    const original = structuredClone(legacy)
    const migrated = migrateGameStateV1(legacy, { now: 9_000, catalog })

    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.inventory['travel-basic']).toBe(1)
    expect(migrated.inventory['lucky-apple']).toBe(1)
    expect(migrated.activeActivity).toMatchObject({
      runId: 'legacy-run',
      startedAt: 2_000,
      endsAt: 4_322_000,
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: null,
        friendEventId: 'signal-dog',
        guaranteedByPity: false,
        pityAfterClaim: null,
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

  it('拒绝无效迁移时间', () => {
    expect(() => migrateGameStateV1(legacyState(), { now: -1, catalog })).toThrow(RangeError)
  })
})
