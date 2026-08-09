import { describe, expect, it } from 'vitest'

import { deriveActivityTiming } from '../activities/timing'
import { generateTaskBoard } from '../tasks/taskBoard'
import { BASE_ACTIVITY_DURATION_MS, LEGACY_ACTIVITY_DURATION_MS } from './constants'
import { createDefaultGameBalanceV3, DEFAULT_GAME_BALANCE } from './gameBalance'
import { migrateGameStateV1 } from './migrateGameStateV1'
import { migrateGameStateV2ToV3 } from './migrateGameStateV2'
import {
  gameStateV3Schema,
  gameStateV4Schema,
  isStrictGameStateV3,
  isStrictGameStateV4,
  migrateGameStateV1ToV4,
  migrateGameStateV2ToV4,
  migrateGameStateV3ToV4,
  migrateStoredGameStateToV4,
} from './migrateGameStateV3'
import { migrateGameStateV4ToV5 } from './migrateGameStateV4'
import { gameStateV6Schema, migrateGameStateV5ToV6 } from './migrateGameStateV5'
import { migrateGameStateV6ToV7 } from './migrateGameStateV6'
import type { CollectionCatalog, GameStateV1, GameStateV3 } from './types'
import { MAX_DATE_TIMESTAMP_MS } from './time'
import { validateImportedGameState } from './validateImportedGameState'

const catalog: CollectionCatalog = {
  postcard: ['postcard-owned', 'postcard-planned'],
  'million-shot': ['million-1'],
  'site-first': ['site-first-1'],
  siteFirstChronology: ['site-first-1'],
}

const migrationOptions = { now: 500_000, catalog }

function v3Fixture(options: { active?: boolean; debug?: boolean } = {}): GameStateV3 {
  const active = options.active ?? true
  const debug = options.debug ?? false
  const tasks = generateTaskBoard({ seed: 'published-v3', sequence: 0, now: 1_000 }).board

  return {
    schemaVersion: 3,
    profile: {
      createdAt: 1_000,
      debug,
      displayName: '旧档玩家',
      companionDays: 6,
    },
    economy: { apples: 27 },
    inventory: {
      'travel-basic': 2,
      'travel-apple': 1,
      'signal-headphones': 3,
      'trend-toolbox': 4,
      'lucky-apple': 5,
    },
    collections: {
      'postcard-owned': {
        id: 'postcard-owned',
        firstObtainedAt: 2_000,
        duplicateCount: 0,
      },
    },
    friends: {
      'signal-dog': {
        id: 'signal-dog',
        firstMetAt: 3_000,
        lastMetAt: 4_000,
        encounterCount: 2,
        totalGiftApples: 3,
      },
    },
    activeActivity: active
      ? {
          runId: 'published-v3-active',
          kind: 'travel',
          startedAt: 10_000,
          endsAt: 10_000 + LEGACY_ACTIVITY_DURATION_MS,
          rewardSeed: 'published-v3-reward',
          rewardPlan: {
            baseApples: 0,
            modifierApples: 0,
            collection: { id: 'postcard-planned', category: 'postcard' },
            // V3 仍可能承载从 V1/V2 迁来的双结果活动。
            friendId: 'signal-dog',
            giftItemId: null,
            guaranteedByPity: false,
            pityAfterClaim: null,
          },
          supplyId: 'travel-basic',
          usedLuckyApple: false,
        }
      : null,
    pet: {
      location: active ? 'outside' : 'center',
      preferences: { travel: true, computer: false, music: true },
      tired: false,
      restCount: 2,
    },
    tasks,
    gameBalance: createDefaultGameBalanceV3(),
    statistics: {
      started: { travel: 3, stream: 2, trend: 1, music: 4, rest: 5 },
      claimed: { travel: 2, stream: 2, trend: 1, music: 3, rest: 4 },
      applesEarned: 18,
      duplicateRewards: 0,
    },
    random: {
      seed: 'published-v3',
      sequences: { reward: 12, tasks: 3, preferences: 7 },
    },
  }
}

function v1Fixture(): GameStateV1 {
  return {
    schemaVersion: 1,
    profile: { createdAt: 100, debug: false },
    economy: { apples: 9 },
    inventory: {
      'travel-basic': 1,
      'travel-apple': 0,
      'signal-headphones': 1,
      'trend-toolbox': 1,
      'lucky-apple': 0,
    },
    collections: {},
    activeActivity: null,
    pity: { stream: 0, trend: 0 },
    statistics: {
      started: { travel: 2, stream: 1, trend: 0 },
      claimed: { travel: 1, stream: 1, trend: 0 },
      applesEarned: 3,
      duplicateRewards: 0,
    },
    random: { seed: 'published-v1', sequence: 4 },
  }
}

describe('schemaVersion 3 -> 4 显式迁移', () => {
  it('冻结 V3 严格形状，不因 V4 新道具和字段而改变已发布格式', () => {
    const state = v3Fixture()
    expect(gameStateV3Schema.parse(state)).toEqual(state)
    expect(isStrictGameStateV3(state)).toBe(true)

    const dateBoundary = structuredClone(state)
    dateBoundary.profile.createdAt = MAX_DATE_TIMESTAMP_MS
    expect(isStrictGameStateV3(dateBoundary)).toBe(true)
    dateBoundary.profile.createdAt = MAX_DATE_TIMESTAMP_MS + 1
    expect(isStrictGameStateV3(dateBoundary)).toBe(false)

    const withMagicInventory = {
      ...state,
      inventory: { ...state.inventory, 'bottled-speed-magic': 0 },
    }
    expect(isStrictGameStateV3(withMagicInventory)).toBe(false)
    expect(isStrictGameStateV3({ ...state, world: 'game' })).toBe(false)
  })

  it('普通 V3 只让未来活动采用 10 秒，进行中的 112 秒绝对时间与奖励快照原样保留', () => {
    const state = v3Fixture()
    const before = structuredClone(state)
    const migrated = migrateGameStateV3ToV4(state, migrationOptions)

    expect(migrated.schemaVersion).toBe(4)
    expect(migrated.gameBalance).toEqual(DEFAULT_GAME_BALANCE)
    expect(migrated.gameBalance.activityDurationMs).toBe(BASE_ACTIVITY_DURATION_MS)
    expect(migrated.activeActivity).toEqual(state.activeActivity)
    expect(migrated.activeActivity).not.toBe(state.activeActivity)
    expect(deriveActivityTiming(migrated.activeActivity, 121_999)).toMatchObject({
      phase: 'running',
      remainingMs: 1,
    })
    expect(deriveActivityTiming(migrated.activeActivity, 122_000)).toMatchObject({
      phase: 'ready',
      remainingMs: 0,
      progress: 1,
    })

    expect(migrated.inventory).toEqual({
      ...state.inventory,
      'bottled-speed-magic': 0,
      'bottled-vitality-magic': 0,
    })
    expect(migrated).toMatchObject({
      world: 'game',
      player: { effects: { vitality: null } },
      reality: {
        nextStaySequence: 0,
        activeStay: null,
        pendingSettlement: null,
        todos: {},
        pomodoro: { nextSessionSequence: 0, selectedPostcardId: null, session: null },
      },
      musicPlayer: {
        playlists: {},
        order: [],
        activePlaylistId: null,
        currentBvid: null,
        currentIndex: 0,
        loopMode: 'list',
        startAtSeconds: 0,
        autoplay: true,
      },
    })
    expect(migrated.profile).toEqual(state.profile)
    expect(migrated.collections).toEqual(state.collections)
    expect(migrated.friends).toEqual(state.friends)
    expect(migrated.tasks).toEqual(state.tasks)
    expect(migrated.statistics).toEqual(state.statistics)
    expect(migrated.random).toEqual(state.random)
    expect(state).toEqual(before)
    expect(isStrictGameStateV4(migrated)).toBe(true)
  })

  it('DEBUG V3 保留自定义时长与概率，仍不改写已签发活动', () => {
    const state = v3Fixture({ debug: true })
    state.gameBalance = {
      activityDurationMs: 5_000,
      probabilities: {
        postcard: 0.1,
        millionShot: 0.2,
        siteFirst: 0.3,
        travelFriend: 0.4,
        musicFriend: 0.5,
      },
    }

    const migrated = migrateGameStateV3ToV4(state, migrationOptions)
    expect(migrated.gameBalance).toEqual(state.gameBalance)
    expect(migrated.gameBalance).not.toBe(state.gameBalance)
    expect(migrated.activeActivity).toEqual(state.activeActivity)
    expect(gameStateV4Schema.safeParse(migrated).success).toBe(true)
  })

  it.each([
    {
      label: '睡觉固定苹果',
      kind: 'rest' as const,
      location: 'bed' as const,
      supplyId: null,
      rewardPlan: {
        baseApples: 1,
        modifierApples: 0,
        collection: null,
        friendId: null,
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
    },
    {
      label: '电子琴好友苹果',
      kind: 'music' as const,
      location: 'piano' as const,
      supplyId: null,
      rewardPlan: {
        baseApples: 0,
        modifierApples: 3,
        collection: null,
        friendId: 'signal-dog' as const,
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
    },
    {
      label: '旅行旧 0 苹果赠礼',
      kind: 'travel' as const,
      location: 'outside' as const,
      supplyId: 'travel-basic' as const,
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: null,
        friendId: 'signal-dog' as const,
        giftItemId: 'signal-headphones' as const,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
    },
  ])(
    '严格 V3 $label活动不被误判为 V1 来源且奖励快照不重算',
    ({ kind, location, supplyId, rewardPlan }) => {
      const state = v3Fixture()
      state.activeActivity = {
        ...state.activeActivity!,
        kind,
        rewardPlan,
        supplyId,
        usedLuckyApple: false,
      }
      state.pet.location = location

      expect(gameStateV3Schema.safeParse(state).success).toBe(true)
      const migrated = migrateGameStateV3ToV4(state, migrationOptions)

      expect(migrated.activeActivity).toEqual(state.activeActivity)
      expect(migrated.activeActivity?.legacySource).toBeUndefined()
      expect(gameStateV4Schema.safeParse(migrated).success).toBe(true)
      const v5 = migrateGameStateV4ToV5(migrated)
      const v6 = migrateGameStateV5ToV6(v5)
      expect(v5.activeActivity?.rewardPlan).toEqual(rewardPlan)
      expect(v6.activeActivity?.rewardPlan).toEqual(rewardPlan)
      expect(gameStateV6Schema.safeParse(v6).success).toBe(true)
      expect(validateImportedGameState(migrateGameStateV6ToV7(v6), catalog)).toEqual({ ok: true })
    },
  )

  it('迁移时确定性替换已删除的打招呼任务，且只推进 tasks 随机序列', () => {
    const state = v3Fixture({ active: false })
    const retained = structuredClone(state.tasks.active.slice(1))
    state.tasks.active[0] = {
      instanceId: 'legacy-greeting',
      taskId: 'greet-bingo',
      assignedAt: 1_000,
      progress: 0,
      target: 1,
      rewardApples: 1,
      seenKeys: [],
    }
    const before = structuredClone(state)

    const first = migrateGameStateV3ToV4(state, migrationOptions)
    const repeated = migrateGameStateV3ToV4(state, migrationOptions)

    expect(first.tasks).toEqual(repeated.tasks)
    expect(first.tasks.active.map((task) => task.taskId)).not.toContain('greet-bingo')
    expect(first.tasks.active.slice(1)).toEqual(retained)
    expect(first.random.sequences.reward).toBe(state.random.sequences.reward)
    expect(first.random.sequences.preferences).toBe(state.random.sequences.preferences)
    expect(first.random.sequences.tasks).toBe(state.random.sequences.tasks + 1)
    expect(state).toEqual(before)
  })

  it('退役任务在 tasks 序列上限仍可替换，且迁移结果保持严格可导出', () => {
    const state = v3Fixture({ active: false })
    state.tasks.active[0] = {
      instanceId: 'legacy-greeting-at-cap',
      taskId: 'greet-bingo',
      assignedAt: 1_000,
      progress: 0,
      target: 1,
      rewardApples: 1,
      seenKeys: [],
    }
    state.random.sequences.tasks = Number.MAX_SAFE_INTEGER

    const migrated = migrateGameStateV3ToV4(state, migrationOptions)
    expect(migrated.tasks.active.map((task) => task.taskId)).not.toContain('greet-bingo')
    expect(migrated.random.sequences.tasks).toBe(Number.MAX_SAFE_INTEGER)
    expect(gameStateV4Schema.safeParse(migrated).success).toBe(true)
    expect(
      validateImportedGameState(
        migrateGameStateV6ToV7(migrateGameStateV5ToV6(migrateGameStateV4ToV5(migrated))),
        catalog,
      ),
    ).toEqual({
      ok: true,
    })
  })

  it('拒绝非法迁移时间与非法收藏目录', () => {
    const state = v3Fixture({ active: false })
    expect(() => migrateGameStateV3ToV4(state, { now: -1, catalog })).toThrow(RangeError)
    expect(() => migrateGameStateV3ToV4(state, { now: 1.5, catalog })).toThrow(RangeError)
    expect(() =>
      migrateGameStateV3ToV4(state, {
        now: 1,
        catalog: { ...catalog, siteFirstChronology: [] },
      }),
    ).toThrow(TypeError)
  })
})

describe('V1/V2/V3/V4 通用迁移入口', () => {
  it('四代状态都汇聚为严格 V4，V4 输入保持原引用', () => {
    const v1 = v1Fixture()
    const v2 = migrateGameStateV1(v1, migrationOptions)
    const v3 = migrateGameStateV2ToV3(v2, migrationOptions)
    const v4 = migrateGameStateV3ToV4(v3, migrationOptions)

    const fromV1 = migrateStoredGameStateToV4(v1, migrationOptions)
    const fromV2 = migrateStoredGameStateToV4(v2, migrationOptions)
    const fromV3 = migrateStoredGameStateToV4(v3, migrationOptions)
    const fromV4 = migrateStoredGameStateToV4(v4, migrationOptions)

    for (const migrated of [fromV1, fromV2, fromV3, fromV4]) {
      expect(migrated.schemaVersion).toBe(4)
      expect(migrated.gameBalance.activityDurationMs).toBe(BASE_ACTIVITY_DURATION_MS)
      expect(migrated.inventory).toMatchObject({
        'bottled-speed-magic': 0,
        'bottled-vitality-magic': 0,
      })
      expect(gameStateV4Schema.safeParse(migrated).success).toBe(true)
    }

    expect(fromV1).toEqual(migrateGameStateV1ToV4(v1, migrationOptions))
    expect(fromV2).toEqual(migrateGameStateV2ToV4(v2, migrationOptions))
    expect(fromV3).toEqual(v4)
    expect(fromV4).toBe(v4)
  })

  it('兼容旧 V4 的 autoplay=false，并在采用前规范为始终自动播放', () => {
    const v4 = migrateGameStateV3ToV4(v3Fixture(), migrationOptions)
    const legacyV4 = {
      ...v4,
      musicPlayer: { ...v4.musicPlayer, autoplay: false },
    }

    expect(gameStateV4Schema.safeParse(legacyV4).success).toBe(true)
    const migrated = migrateStoredGameStateToV4(legacyV4, migrationOptions)
    expect(migrated.musicPlayer.autoplay).toBe(true)
    expect(migrated).not.toBe(legacyV4)
    expect(legacyV4.musicPlayer.autoplay).toBe(false)
  })
})
