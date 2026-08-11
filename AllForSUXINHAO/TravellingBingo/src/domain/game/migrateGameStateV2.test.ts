import { describe, expect, it } from 'vitest'

import { deriveActivityTiming } from '../activities/timing'
import { generateTaskBoard } from '../tasks/taskBoard'
import { MAX_COMPANION_DAYS } from './constants'
import { createDefaultGameBalanceV2, DEFAULT_GAME_BALANCE_V3 } from './gameBalance'
import {
  gameStateV2Schema,
  isStrictGameStateV2,
  migrateGameStateV2ToV3,
  migrateStoredGameStateToV3,
} from './migrateGameStateV2'
import { migrateGameStateV3ToV4 } from './migrateGameStateV3'
import { migrateGameStateV4ToV5 } from './migrateGameStateV4'
import { migrateGameStateV5ToV6 } from './migrateGameStateV5'
import { migrateGameStateV6ToV7 } from './migrateGameStateV6'
import { migrateGameStateV7ToV8 } from './migrateGameStateV7'
import { migrateGameStateV8ToV9 } from './migrateGameStateV8'
import { migrateGameStateV9ToV10 } from './migrateGameStateV9'
import { migrateGameStateV10ToV11 } from './migrateGameStateV10'
import { reduceGame } from './reducer'
import type { CollectionCatalog, GameStateV2, GameTransition } from './types'
import { MAX_DATE_TIMESTAMP_MS } from './time'

const catalog: CollectionCatalog = {
  postcard: ['postcard-new'],
  'million-shot': ['million-new'],
  'site-first': ['first-new'],
  siteFirstChronology: ['first-new'],
}

function migrateGameStateV7ToCurrent(state: Parameters<typeof migrateGameStateV7ToV8>[0]) {
  return migrateGameStateV10ToV11(
    migrateGameStateV9ToV10(migrateGameStateV8ToV9(migrateGameStateV7ToV8(state))),
  )
}

function successful(transition: GameTransition): Extract<GameTransition, { ok: true }> {
  if (!transition.ok) throw new Error(`${transition.error.code}: ${transition.error.message}`)
  return transition
}

function v2Fixture(): GameStateV2 {
  const tasks = generateTaskBoard({ seed: 'legacy-v2', sequence: 0, now: 1_000 }).board
  return {
    schemaVersion: 2,
    profile: { createdAt: 100, debug: false },
    economy: { apples: 9 },
    inventory: {
      'travel-basic': 0,
      'travel-apple': 0,
      'signal-headphones': 1,
      'trend-toolbox': 1,
      'lucky-apple': 0,
    },
    collections: {},
    activeActivity: {
      runId: 'legacy-run',
      kind: 'travel',
      startedAt: 10_000,
      endsAt: 15_000,
      rewardSeed: 'legacy-reward',
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: { id: 'postcard-new', category: 'postcard' },
        // V2 允许旅行同时计划收藏与朋友；V3 迁移不能抹掉其中任一项。
        friendEventId: 'signal-dog',
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: 'travel-basic',
      usedLuckyApple: false,
    },
    pet: {
      location: 'outside',
      preferences: { travel: true, stream: false, trend: true },
      tired: false,
      restCount: 2,
    },
    tasks,
    gameBalance: createDefaultGameBalanceV2(),
    statistics: {
      started: { travel: 4, stream: 5, trend: 6 },
      claimed: { travel: 2, stream: 3, trend: 4 },
      applesEarned: 20,
      duplicateRewards: 0,
    },
    random: {
      seed: 'legacy-v2',
      sequences: { reward: 7, tasks: 1, preferences: 3 },
    },
  }
}

describe('schemaVersion 2 -> 3 显式迁移', () => {
  it('严格识别 V2，拒绝未知字段', () => {
    const fixture = v2Fixture()
    expect(gameStateV2Schema.parse(fixture)).toEqual(fixture)
    expect(isStrictGameStateV2(fixture)).toBe(true)
    expect(isStrictGameStateV2({ ...fixture, unexpected: true })).toBe(false)

    const reversed = structuredClone(fixture)
    reversed.activeActivity!.endsAt = reversed.activeActivity!.startedAt - 1
    expect(isStrictGameStateV2(reversed)).toBe(false)

    const immediatelyCompleted = structuredClone(fixture)
    immediatelyCompleted.activeActivity!.endsAt = immediatelyCompleted.activeActivity!.startedAt
    expect(isStrictGameStateV2(immediatelyCompleted)).toBe(true)

    const dateBoundary = structuredClone(fixture)
    dateBoundary.profile.createdAt = MAX_DATE_TIMESTAMP_MS
    expect(isStrictGameStateV2(dateBoundary)).toBe(true)
    dateBoundary.profile.createdAt = MAX_DATE_TIMESTAMP_MS + 1
    expect(isStrictGameStateV2(dateBoundary)).toBe(false)

    const nonNativeApplePlan = structuredClone(fixture)
    nonNativeApplePlan.activeActivity!.rewardPlan.baseApples = 1
    expect(isStrictGameStateV2(nonNativeApplePlan)).toBe(false)
  })

  it('回填用户名与历史陪伴天数，并把刷播/冲热合并为电脑意愿', () => {
    const migrated = migrateGameStateV2ToV3(v2Fixture(), { now: 20_000, catalog })

    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.profile).toMatchObject({ displayName: '你', companionDays: 9 })
    expect(migrated.friends).toEqual({})
    expect(migrated.pet.preferences).toEqual({ travel: true, computer: true, music: true })
    expect(migrated.gameBalance).toEqual(DEFAULT_GAME_BALANCE_V3)
    expect(migrated.statistics.started).toEqual({
      travel: 4,
      stream: 5,
      trend: 6,
      music: 0,
      rest: 0,
    })
  })

  it('保留旧档疲劳状态，并拒绝用新增的弹琴活动绕过睡觉', () => {
    const fixture = v2Fixture()
    fixture.activeActivity = null
    fixture.pet.tired = true
    fixture.pet.preferences = { travel: false, stream: false, trend: false }
    const migrated = migrateGameStateV2ToV3(fixture, { now: 20_000, catalog })

    expect(migrated.pet).toMatchObject({
      tired: true,
      preferences: { travel: false, computer: false, music: false },
    })

    const migratedV5 = migrateGameStateV7ToCurrent(
      migrateGameStateV6ToV7(
        migrateGameStateV5ToV6(
          migrateGameStateV4ToV5(migrateGameStateV3ToV4(migrated, { now: 20_000, catalog })),
        ),
      ),
    )
    const before = structuredClone(migratedV5)
    const result = reduceGame(
      migratedV5,
      { type: 'activity/start', kind: 'music', now: 20_000 },
      catalog,
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'ACTIVITY_REFUSED' } })
    expect(migratedV5).toEqual(before)
  })

  it('进行中活动保持绝对时间和 legacy 双结果，原 endsAt 到点即可领取', () => {
    const migrated = migrateGameStateV2ToV3(v2Fixture(), { now: 12_000, catalog })
    const activity = migrated.activeActivity!
    const migratedV5 = migrateGameStateV7ToCurrent(
      migrateGameStateV6ToV7(
        migrateGameStateV5ToV6(
          migrateGameStateV4ToV5(migrateGameStateV3ToV4(migrated, { now: 12_000, catalog })),
        ),
      ),
    )

    expect(activity).toMatchObject({
      startedAt: 10_000,
      endsAt: 15_000,
      rewardSeed: 'legacy-reward',
      rewardPlan: {
        collection: { id: 'postcard-new', category: 'postcard' },
        friendId: 'signal-dog',
        giftItemId: null,
        modifierApples: 0,
      },
    })
    expect(deriveActivityTiming(activity, 14_999).phase).toBe('running')
    expect(deriveActivityTiming(activity, 15_000).phase).toBe('ready')

    const claimed = successful(
      reduceGame(
        migratedV5,
        { type: 'activity/claim', runId: activity.runId, now: 15_000 },
        catalog,
      ),
    )
    expect(claimed.state.collections['postcard-new']).toBeDefined()
    expect(claimed.state.friends['signal-dog']).toMatchObject({
      encounterCount: 1,
      totalGiftApples: 0,
    })
    expect(claimed.state.profile.companionDays).toBe(10)
    expect(claimed.effects[0]).toMatchObject({
      summary: {
        friendId: 'signal-dog',
        giftItemId: null,
        giftApples: 0,
        collection: { id: 'postcard-new' },
      },
    })
  })

  it('DEBUG V2 只映射已有调参，音乐好友概率使用当前默认', () => {
    const fixture = v2Fixture()
    fixture.profile.debug = true
    fixture.gameBalance = {
      activityDurationMs: 5_000,
      probabilities: { postcard: 0.2, millionShot: 0.3, siteFirst: 0.4, friend: 0.7 },
    }
    const migrated = migrateGameStateV2ToV3(fixture, { now: 20_000, catalog })

    expect(migrated.gameBalance).toEqual({
      activityDurationMs: 5_000,
      probabilities: {
        postcard: 0.2,
        millionShot: 0.3,
        siteFirst: 0.4,
        travelFriend: 0.7,
        musicFriend: DEFAULT_GAME_BALANCE_V3.probabilities.musicFriend,
      },
    })
  })

  it('历史领取数按上限饱和，通用迁移入口路由 V2 并原样返回 V3', () => {
    const fixture = v2Fixture()
    fixture.activeActivity = null
    fixture.statistics.claimed = {
      travel: Number.MAX_SAFE_INTEGER,
      stream: Number.MAX_SAFE_INTEGER,
      trend: Number.MAX_SAFE_INTEGER,
    }
    const migrated = migrateGameStateV2ToV3(fixture, { now: 20_000, catalog })
    expect(migrated.profile.companionDays).toBe(MAX_COMPANION_DAYS)

    expect(migrateStoredGameStateToV3(fixture, { now: 20_000, catalog })).toEqual(migrated)
    expect(migrateStoredGameStateToV3(migrated, { now: 20_000, catalog })).toBe(migrated)
  })
})
