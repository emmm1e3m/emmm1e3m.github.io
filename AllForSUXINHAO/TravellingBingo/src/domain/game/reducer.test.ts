import { describe, expect, it } from 'vitest'

import { deriveActivityTiming } from '../activities/timing'
import { interestForActivity } from '../pet/preferences'
import { canUseLuckyApple, getLuckyAppleAvailability } from '../rewards/luckyApple'
import { createRandomCursor, nextRandom } from '../rewards/prng'
import {
  BASE_ACTIVITY_DURATION_MS,
  INITIAL_APPLES,
  ITEM_PRICES,
  MAX_APPLES,
  MAX_COMPANION_DAYS,
  PET_ENCOURAGEMENT_APPLE_COST,
} from './constants'
import { createInitialGameState } from './createGameState'
import { DEFAULT_GAME_BALANCE, LUCKY_APPLE_COLLECTION_DROP_BONUS } from './gameBalance'
import { gameStateV5Schema } from './migrateGameStateV4'
import { reduceGame } from './reducer'
import { MAX_DATE_TIMESTAMP_MS } from './time'
import type { ActivityKind, CollectionCatalog, GameState, GameTransition, ItemId } from './types'

const catalog: CollectionCatalog = {
  postcard: ['postcard-1', 'postcard-2'],
  'million-shot': ['million-1'],
  'site-first': ['site-first-1'],
  siteFirstChronology: ['site-first-1'],
}

function successful(transition: GameTransition): Extract<GameTransition, { ok: true }> {
  if (!transition.ok) {
    throw new Error(`${transition.error.code}: ${transition.error.message}`)
  }
  return transition
}

function withItem(state: GameState, itemId: ItemId, quantity = 1): GameState {
  return { ...state, inventory: { ...state.inventory, [itemId]: quantity } }
}

function willing(state: GameState, kind: ActivityKind): GameState {
  const interest = interestForActivity(kind)
  if (interest === null) return state
  return {
    ...state,
    pet: {
      ...state.pet,
      preferences: { ...state.pet.preferences, [interest]: true },
      tired: false,
    },
  }
}

function withProbability(
  state: GameState,
  key: keyof GameState['gameBalance']['probabilities'],
  value: number,
): GameState {
  return {
    ...state,
    gameBalance: {
      ...state.gameBalance,
      probabilities: { ...state.gameBalance.probabilities, [key]: value },
    },
  }
}

function seedWhoseRewardRollIsBelow(limit: number, rollIndex: number): string {
  for (let index = 0; index < 10_000; index += 1) {
    const seed = `game-reward-boundary-${rollIndex}-${index}`
    let cursor = createRandomCursor(`${seed}:reward:0`)
    let value = 0
    for (let roll = 0; roll <= rollIndex; roll += 1) {
      const next = nextRandom(cursor)
      cursor = next.cursor
      value = next.value
    }
    if (value < limit) return seed
  }
  throw new Error(`没有找到小于 ${limit} 的第 ${rollIndex + 1} 次奖励随机值`)
}

describe('旅行饼狗 v5 领域状态', () => {
  it('新游戏使用 schema v5、用户名、零天陪伴、10 秒活动与独立随机序列', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'save-seed' })

    expect(state.schemaVersion).toBe(5)
    expect(state.profile).toMatchObject({ displayName: '你', companionDays: 0 })
    expect(state.friends).toEqual({})
    expect(state.economy.apples).toBe(INITIAL_APPLES)
    expect(state.gameBalance).toEqual(DEFAULT_GAME_BALANCE)
    expect(state.gameBalance).toEqual({
      activityDurationMs: 10_000,
      probabilities: {
        postcard: 0.65,
        millionShot: 0.4,
        siteFirst: 0.1,
        travelFriend: 0.2,
        musicFriend: 0.2,
      },
    })
    expect(ITEM_PRICES).toEqual({
      'travel-basic': 3,
      'travel-apple': 5,
      'signal-headphones': 4,
      'trend-toolbox': 7,
      'lucky-apple': 6,
      'bottled-speed-magic': 3,
      'bottled-vitality-magic': 12,
    })
    expect(PET_ENCOURAGEMENT_APPLE_COST).toBe(2)
    expect(state.tasks.active).toHaveLength(3)
    expect(state.random.seed).toBe('save-seed')
    expect(state.random.sequences).toEqual({ reward: 0, tasks: 1, preferences: 1 })
    expect(Object.values(state.pet.preferences).some(Boolean)).toBe(true)
  })

  it('开始活动原子扣除补给，并以绝对时间推导 10 秒边界', () => {
    const initial = willing(createInitialGameState({ now: 1_000, seed: 'travel-seed' }), 'travel')
    const started = successful(
      reduceGame(initial, { type: 'activity/start', kind: 'travel', now: 10_000 }, catalog),
    ).state
    const activity = started.activeActivity

    expect(initial.inventory['travel-basic']).toBe(1)
    expect(started.inventory['travel-basic']).toBe(0)
    expect(started.economy.apples).toBe(initial.economy.apples)
    expect(activity?.endsAt).toBe(10_000 + BASE_ACTIVITY_DURATION_MS)
    expect(started.pet.location).toBe('outside')
    expect(deriveActivityTiming(activity, 10_000 + BASE_ACTIVITY_DURATION_MS - 1)).toMatchObject({
      phase: 'running',
      remainingMs: 1,
      remainingSeconds: 1,
    })
    expect(deriveActivityTiming(activity, 10_000 + BASE_ACTIVITY_DURATION_MS)).toMatchObject({
      phase: 'ready',
      remainingMs: 0,
      remainingSeconds: 0,
      progress: 1,
    })
  })

  it('拒绝不符合当前偏好的活动，且不消耗补给或任何随机序列', () => {
    const initial = createInitialGameState({ now: 0, seed: 'refuse-seed' })
    const refused: GameState = {
      ...initial,
      pet: {
        ...initial.pet,
        preferences: { ...initial.pet.preferences, travel: false },
      },
    }

    const result = reduceGame(
      refused,
      { type: 'activity/start', kind: 'travel', now: 100 },
      catalog,
    )

    expect(result).toMatchObject({ ok: false, error: { code: 'ACTIVITY_REFUSED' } })
    expect(result.state).toBe(refused)
    expect(result.state.inventory).toBe(refused.inventory)
    expect(result.state.random).toBe(refused.random)
  })

  it('疲劳标记会在领域层阻止活动，即使异常存档仍把该意愿记为愿意', () => {
    const initial = createInitialGameState({ now: 0, seed: 'tired-domain-guard' })
    const tired: GameState = {
      ...initial,
      pet: {
        ...initial.pet,
        tired: true,
        preferences: { ...initial.pet.preferences, music: true },
      },
    }

    const result = reduceGame(tired, { type: 'activity/start', kind: 'music', now: 100 }, catalog)

    expect(result).toMatchObject({ ok: false, error: { code: 'ACTIVITY_REFUSED' } })
    expect(result.state).toBe(tired)
    expect(result.state.random).toBe(tired.random)
  })

  it('刷播和冲热都把饼狗移动到电脑，旅行期间位于屋外', () => {
    const streamBase = willing(
      withItem(createInitialGameState({ now: 0, seed: 'stream-location' }), 'signal-headphones'),
      'stream',
    )
    const stream = successful(
      reduceGame(streamBase, { type: 'activity/start', kind: 'stream', now: 100 }, catalog),
    ).state
    expect(stream.pet.location).toBe('computer')

    const trendBase = willing(
      withItem(createInitialGameState({ now: 0, seed: 'trend-location' }), 'trend-toolbox'),
      'trend',
    )
    const trend = successful(
      reduceGame(trendBase, { type: 'activity/start', kind: 'trend', now: 100 }, catalog),
    ).state
    expect(trend.pet.location).toBe('computer')
  })

  it('活动命中、未命中与重复收藏均不产生苹果', () => {
    const cases = [
      { kind: 'travel' as const, item: 'travel-basic' as const, key: 'postcard' as const },
      { kind: 'stream' as const, item: 'signal-headphones' as const, key: 'millionShot' as const },
      { kind: 'trend' as const, item: 'trend-toolbox' as const, key: 'siteFirst' as const },
    ]

    for (const [index, testCase] of cases.entries()) {
      let state = createInitialGameState({ now: 0, seed: `no-apples-${index}` })
      state = withItem(state, testCase.item)
      state = willing(state, testCase.kind)
      state = withProbability(state, testCase.key, index === 1 ? 0 : 1)
      if (index === 2) {
        state = {
          ...state,
          collections: {
            'site-first-1': { id: 'site-first-1', firstObtainedAt: 1, duplicateCount: 0 },
          },
        }
      }
      const applesBefore = state.economy.apples
      const started = successful(
        reduceGame(state, { type: 'activity/start', kind: testCase.kind, now: 100 }, catalog),
      ).state
      const claimed = successful(
        reduceGame(
          started,
          {
            type: 'activity/claim',
            runId: started.activeActivity!.runId,
            now: started.activeActivity!.endsAt,
          },
          catalog,
        ),
      )

      expect(claimed.state.economy.apples).toBe(applesBefore)
      expect(claimed.state.statistics.applesEarned).toBe(state.statistics.applesEarned)
      expect(claimed.effects[0]).toMatchObject({
        type: 'activity-claimed',
        summary: {
          apples: { base: 0, modifier: 0, duplicateCompensation: 0, total: 0 },
        },
      })
    }
  })

  it('没有首次刷播固定掉落或冲热保底，概率 0 时稳定不掉落', () => {
    let stream = createInitialGameState({ now: 0, seed: 'no-first-gift' })
    stream = willing(withItem(stream, 'signal-headphones'), 'stream')
    stream = withProbability(stream, 'millionShot', 0)
    const streamStarted = successful(
      reduceGame(stream, { type: 'activity/start', kind: 'stream', now: 100 }, catalog),
    ).state
    expect(streamStarted.activeActivity?.rewardPlan.collection).toBeNull()

    let trend = createInitialGameState({ now: 0, seed: 'no-trend-pity' })
    trend = willing(withItem(trend, 'trend-toolbox'), 'trend')
    trend = withProbability(trend, 'siteFirst', 0)
    const trendStarted = successful(
      reduceGame(trend, { type: 'activity/start', kind: 'trend', now: 100 }, catalog),
    ).state
    expect(trendStarted.activeActivity?.rewardPlan.collection).toBeNull()
    expect(trendStarted.activeActivity?.rewardPlan.guaranteedByPity).toBe(false)
    expect(trendStarted.activeActivity?.rewardPlan.pityAfterClaim).toBeNull()
  })

  it('遇见朋友概率可由同一 gameBalance 覆盖为 0% 或 100%', () => {
    const startWithFriendChance = (chance: number) => {
      let state = willing(createInitialGameState({ now: 0, seed: `friend-${chance}` }), 'travel')
      state = withProbability(state, 'travelFriend', chance)
      return successful(
        reduceGame(state, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
      ).state.activeActivity?.rewardPlan.friendId
    }

    expect(startWithFriendChance(0)).toBeNull()
    expect(startWithFriendChance(1)).not.toBeNull()
  })

  it('概率在活动开始时固化，之后的 DEBUG 修改不会改写既定收藏', () => {
    let state = createInitialGameState({ now: 0, seed: 'probability-snapshot', debug: true })
    state = willing(withItem(state, 'trend-toolbox'), 'trend')
    state = successful(
      reduceGame(state, { type: 'debug/probability-set', key: 'siteFirst', value: 1 }, catalog),
    ).state
    const started = successful(
      reduceGame(state, { type: 'activity/start', kind: 'trend', now: 100 }, catalog),
    ).state
    expect(started.activeActivity?.rewardPlan.collection?.category).toBe('site-first')

    const tuned = successful(
      reduceGame(started, { type: 'debug/probability-set', key: 'siteFirst', value: 0 }, catalog),
    ).state
    const claimed = successful(
      reduceGame(
        tuned,
        {
          type: 'activity/claim',
          runId: tuned.activeActivity!.runId,
          now: tuned.activeActivity!.endsAt,
        },
        catalog,
      ),
    )
    expect(claimed.effects[0]).toMatchObject({
      type: 'activity-claimed',
      summary: { collection: { category: 'site-first' } },
    })
  })

  it('DEBUG 可以持久修改时长和全部概率，普通档与非法概率会被拒绝', () => {
    const normal = createInitialGameState({ now: 0, seed: 'normal' })
    expect(
      reduceGame(normal, { type: 'debug/duration-set', durationMs: 5_000 }, catalog),
    ).toMatchObject({ ok: false, error: { code: 'DEBUG_REQUIRED' } })

    let debug = createInitialGameState({ now: 0, seed: 'debug', debug: true })
    const preferences = debug.pet.preferences
    debug = successful(
      reduceGame(debug, { type: 'debug/duration-set', durationMs: 5_000 }, catalog),
    ).state
    debug = successful(
      reduceGame(
        debug,
        { type: 'debug/probability-set', key: 'travelFriend', value: 0.75 },
        catalog,
      ),
    ).state
    expect(debug.gameBalance).toMatchObject({
      activityDurationMs: 5_000,
      probabilities: { travelFriend: 0.75 },
    })
    expect(debug.pet.preferences).toBe(preferences)
    expect(
      reduceGame(debug, { type: 'debug/probability-set', key: 'siteFirst', value: 1.01 }, catalog),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PROBABILITY' } })

    const started = successful(
      reduceGame(
        willing(debug, 'travel'),
        { type: 'activity/start', kind: 'travel', now: 20 },
        catalog,
      ),
    ).state
    expect(started.activeActivity?.endsAt).toBe(5_020)
  })

  it('基础收藏概率已是 100% 时拒绝幸运苹果，且不消耗或推进任何状态', () => {
    let state = willing(createInitialGameState({ now: 0, seed: 'lucky-guaranteed' }), 'travel')
    state = withProbability(state, 'postcard', 1)
    state = withItem(state, 'lucky-apple')
    const result = reduceGame(
      state,
      { type: 'activity/start', kind: 'travel', now: 100, useLuckyApple: true },
      catalog,
    )

    expect(getLuckyAppleAvailability(state, 'travel', catalog)).toMatchObject({
      canUse: false,
      reason: 'drop-already-guaranteed',
    })
    expect(canUseLuckyApple(state, 'travel', catalog)).toBe(false)
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'LUCKY_APPLE_NOT_USEFUL', message: expect.stringContaining('100%') },
    })
    expect(result.state).toBe(state)
    expect(result.state.inventory).toBe(state.inventory)
    expect(result.state.random).toBe(state.random)
    expect(result.state.activeActivity).toBeNull()
  })

  it('对应收藏已经集齐时拒绝幸运苹果，且不扣活动补给', () => {
    let state = willing(createInitialGameState({ now: 0, seed: 'lucky-complete' }), 'stream')
    state = withItem(withItem(state, 'signal-headphones'), 'lucky-apple')
    state = {
      ...state,
      collections: {
        'million-1': { id: 'million-1', firstObtainedAt: 1, duplicateCount: 0 },
      },
    }
    const result = reduceGame(
      state,
      { type: 'activity/start', kind: 'stream', now: 100, useLuckyApple: true },
      catalog,
    )

    expect(getLuckyAppleAvailability(state, 'stream', catalog)).toMatchObject({
      canUse: false,
      reason: 'category-complete',
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'LUCKY_APPLE_NOT_USEFUL', message: expect.stringContaining('已经集齐') },
    })
    expect(result.state).toBe(state)
    expect(result.state.inventory['signal-headphones']).toBe(1)
    expect(result.state.inventory['lucky-apple']).toBe(1)
    expect(result.state.random.sequences.reward).toBe(state.random.sequences.reward)
  })

  it('DEBUG 将旅行收藏概率调低后允许幸运苹果，并原子扣除两项补给', () => {
    let state = willing(
      createInitialGameState({ now: 0, seed: 'lucky-debug-travel', debug: true }),
      'travel',
    )
    state = withItem(state, 'lucky-apple')
    state = successful(
      reduceGame(state, { type: 'debug/probability-set', key: 'postcard', value: 0.5 }, catalog),
    ).state
    const rewardSequence = state.random.sequences.reward

    expect(canUseLuckyApple(state, 'travel', catalog)).toBe(true)
    const started = successful(
      reduceGame(
        state,
        { type: 'activity/start', kind: 'travel', now: 100, useLuckyApple: true },
        catalog,
      ),
    ).state

    expect(started.inventory['travel-basic']).toBe(0)
    expect(started.inventory['lucky-apple']).toBe(0)
    expect(started.random.sequences.reward).toBe(rewardSequence + 1)
    expect(started.activeActivity?.usedLuckyApple).toBe(true)
  })

  it('旅行 0% 遇友和明信片时，幸运苹果加成会实际写入明信片计划', () => {
    const seed = seedWhoseRewardRollIsBelow(LUCKY_APPLE_COLLECTION_DROP_BONUS, 1)
    let state = willing(createInitialGameState({ now: 0, seed, debug: true }), 'travel')
    state = withItem(state, 'lucky-apple')
    state = withProbability(withProbability(state, 'travelFriend', 0), 'postcard', 0)

    const started = successful(
      reduceGame(
        state,
        { type: 'activity/start', kind: 'travel', now: 100, useLuckyApple: true },
        catalog,
      ),
    ).state
    expect(started.activeActivity?.rewardPlan).toMatchObject({
      friendId: null,
      collection: { category: 'postcard' },
    })
  })

  it.each(['music', 'rest'] as const)('%s 不接受幸运苹果且不会推进状态', (kind) => {
    let state = willing(createInitialGameState({ now: 0, seed: `no-lucky-${kind}` }), kind)
    state = withItem(state, 'lucky-apple')
    const result = reduceGame(
      state,
      { type: 'activity/start', kind, now: 100, useLuckyApple: true },
      catalog,
    )
    expect(getLuckyAppleAvailability(state, kind, catalog)).toMatchObject({
      canUse: false,
      reason: 'activity-not-collectible',
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'LUCKY_APPLE_NOT_USEFUL' } })
    expect(result.state).toBe(state)
    expect(result.state.inventory['lucky-apple']).toBe(1)
  })

  it('旅行已必遇朋友时拒绝无效幸运苹果，苹果便当加成也计入判断', () => {
    let state = willing(
      createInitialGameState({ now: 0, seed: 'friend-guaranteed-lucky', debug: true }),
      'travel',
    )
    state = withItem(withItem(state, 'travel-apple'), 'lucky-apple')
    state = withProbability(state, 'travelFriend', 0.9)
    expect(getLuckyAppleAvailability(state, 'travel', catalog, 'travel-apple')).toMatchObject({
      canUse: false,
      reason: 'friend-result-guaranteed',
    })
    const result = reduceGame(
      state,
      {
        type: 'activity/start',
        kind: 'travel',
        now: 100,
        supplyId: 'travel-apple',
        useLuckyApple: true,
      },
      catalog,
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'LUCKY_APPLE_NOT_USEFUL' } })
    expect(result.state).toBe(state)
    expect(result.state.inventory['travel-apple']).toBe(1)
    expect(result.state.inventory['lucky-apple']).toBe(1)
  })

  it('睡觉也要完整读条；领取后才增加一天、一个苹果并推进偏好序列', () => {
    const state = createInitialGameState({ now: 0, seed: 'rest-streams' })
    const before = structuredClone(state.random.sequences)
    const started = successful(
      reduceGame(state, { type: 'activity/start', kind: 'rest', now: 100 }, catalog),
    ).state

    expect(started.profile.companionDays).toBe(0)
    expect(started.economy.apples).toBe(state.economy.apples)
    expect(started.pet.preferences).toEqual(state.pet.preferences)
    expect(started.random.sequences).toEqual(before)
    expect(started.pet.location).toBe('bed')
    expect(started.activeActivity!.endsAt).toBe(100 + BASE_ACTIVITY_DURATION_MS)

    const tooEarly = reduceGame(
      started,
      {
        type: 'activity/claim',
        runId: started.activeActivity!.runId,
        now: started.activeActivity!.endsAt - 1,
      },
      catalog,
    )
    expect(tooEarly).toMatchObject({ ok: false, error: { code: 'ACTIVITY_NOT_READY' } })
    expect(tooEarly.state).toBe(started)

    const rested = successful(
      reduceGame(
        started,
        {
          type: 'activity/claim',
          runId: started.activeActivity!.runId,
          now: started.activeActivity!.endsAt,
        },
        catalog,
      ),
    )

    expect(rested.state.pet.location).toBe('bed')
    expect(rested.state.pet.restCount).toBe(1)
    expect(rested.state.pet.tired).toBe(false)
    expect(Object.values(rested.state.pet.preferences).some(Boolean)).toBe(true)
    expect(rested.state.profile.companionDays).toBe(1)
    expect(rested.state.economy.apples).toBe(state.economy.apples + 1)
    expect(rested.state.random.sequences).toEqual({
      reward: before.reward,
      tasks: before.tasks,
      preferences: before.preferences + 1,
    })
    expect(rested.effects).toMatchObject([
      { type: 'activity-claimed', summary: { apples: { total: 1 } } },
      { type: 'pet-rested', replayKey: 1 },
    ])
  })

  it('陪伴天数达到上限后不能再开始扣资源，最后一天仍可正常领取', () => {
    let capped = willing(createInitialGameState({ now: 0, seed: 'day-limit' }), 'travel')
    capped = withItem(capped, 'lucky-apple')
    capped = {
      ...capped,
      profile: { ...capped.profile, companionDays: MAX_COMPANION_DAYS },
    }
    const denied = reduceGame(
      capped,
      { type: 'activity/start', kind: 'travel', now: 100, useLuckyApple: true },
      catalog,
    )
    expect(denied).toMatchObject({
      ok: false,
      error: { code: 'COMPANION_DAY_LIMIT_REACHED' },
    })
    expect(denied.state).toBe(capped)

    const finalDayBase = createInitialGameState({ now: 0, seed: 'final-day' })
    const finalDay = {
      ...finalDayBase,
      profile: {
        ...finalDayBase.profile,
        companionDays: MAX_COMPANION_DAYS - 1,
      },
    }
    const started = successful(
      reduceGame(finalDay, { type: 'activity/start', kind: 'rest', now: 100 }, catalog),
    ).state
    const claimed = successful(
      reduceGame(
        started,
        {
          type: 'activity/claim',
          runId: started.activeActivity!.runId,
          now: started.activeActivity!.endsAt,
        },
        catalog,
      ),
    )
    expect(claimed.state.profile.companionDays).toBe(MAX_COMPANION_DAYS)
  })

  it.each(['running', 'ready'] as const)(
    '%s 阶段取消活动都不返补给、幸运苹果或增加陪伴天数',
    (phase) => {
      let state = willing(createInitialGameState({ now: 0, seed: `cancel-${phase}` }), 'travel')
      state = withItem(state, 'lucky-apple')
      const preferences = state.pet.preferences
      const started = successful(
        reduceGame(
          state,
          { type: 'activity/start', kind: 'travel', now: 100, useLuckyApple: true },
          catalog,
        ),
      ).state
      const cancelledAt = phase === 'ready' ? started.activeActivity!.endsAt : 101
      const randomAfterStart = started.random
      const cancelled = successful(
        reduceGame(
          started,
          { type: 'activity/cancel', runId: started.activeActivity!.runId, now: cancelledAt },
          catalog,
        ),
      )

      expect(cancelled.state.activeActivity).toBeNull()
      expect(cancelled.state.inventory['travel-basic']).toBe(0)
      expect(cancelled.state.inventory['lucky-apple']).toBe(0)
      expect(cancelled.state.profile.companionDays).toBe(0)
      expect(cancelled.state.pet.preferences).toBe(preferences)
      expect(cancelled.state.random).toBe(randomAfterStart)
      expect(cancelled.effects).toMatchObject([{ type: 'activity-cancelled', cancelledAt }])
    },
  )

  it('取消时间不能早于活动开始时间', () => {
    const state = willing(createInitialGameState({ now: 0, seed: 'cancel-time' }), 'travel')
    const started = successful(
      reduceGame(state, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state
    const result = reduceGame(
      started,
      { type: 'activity/cancel', runId: started.activeActivity!.runId, now: 99 },
      catalog,
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_TIME' } })
    expect(result.state).toBe(started)
  })

  it('刷播与冲热共享电脑意愿，完成其中一项后另一项也会被拒绝', () => {
    let state = createInitialGameState({ now: 0, seed: 'shared-computer-interest' })
    state = withItem(withItem(state, 'signal-headphones'), 'trend-toolbox')
    state = willing(state, 'stream')
    const started = successful(
      reduceGame(state, { type: 'activity/start', kind: 'stream', now: 100 }, catalog),
    ).state
    const claimed = successful(
      reduceGame(
        started,
        {
          type: 'activity/claim',
          runId: started.activeActivity!.runId,
          now: started.activeActivity!.endsAt,
        },
        catalog,
      ),
    ).state

    expect(claimed.pet.preferences.computer).toBe(false)
    expect(
      reduceGame(claimed, { type: 'activity/start', kind: 'trend', now: 300_000 }, catalog),
    ).toMatchObject({ ok: false, error: { code: 'ACTIVITY_REFUSED' } })
  })

  it('旅行朋友与明信片互斥，领取后更新好友图鉴并发放确定性道具', () => {
    let state = willing(createInitialGameState({ now: 0, seed: 'travel-friend-book' }), 'travel')
    state = withProbability(withProbability(state, 'travelFriend', 1), 'postcard', 1)
    const started = successful(
      reduceGame(state, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state
    const plan = started.activeActivity!.rewardPlan
    expect(plan.friendId).not.toBeNull()
    expect(plan.collection).toBeNull()
    expect(plan.giftItemId).not.toBeNull()
    const giftBefore = started.inventory[plan.giftItemId!]

    const claimed = successful(
      reduceGame(
        started,
        {
          type: 'activity/claim',
          runId: started.activeActivity!.runId,
          now: started.activeActivity!.endsAt,
        },
        catalog,
      ),
    )
    expect(claimed.state.friends[plan.friendId!]).toMatchObject({
      id: plan.friendId,
      encounterCount: 1,
      totalGiftApples: 0,
    })
    expect(claimed.state.inventory[plan.giftItemId!]).toBe(giftBefore + 1)
    expect(claimed.state.profile.companionDays).toBe(1)
    expect(claimed.effects[0]).toMatchObject({
      type: 'activity-claimed',
      summary: { friendId: plan.friendId, giftItemId: plan.giftItemId, giftApples: 0 },
    })
  })

  it('电子琴只召来已认识朋友，领取后赠苹果并累计好友赠礼', () => {
    let state = willing(createInitialGameState({ now: 0, seed: 'music-known-friend' }), 'music')
    state = withProbability(state, 'musicFriend', 1)
    state = {
      ...state,
      friends: {
        'signal-dog': {
          id: 'signal-dog',
          firstMetAt: 10,
          lastMetAt: 10,
          encounterCount: 1,
          totalGiftApples: 0,
        },
      },
    }
    const applesBefore = state.economy.apples
    const started = successful(
      reduceGame(state, { type: 'activity/start', kind: 'music', now: 100 }, catalog),
    ).state
    expect(started.pet.location).toBe('piano')
    expect(started.activeActivity?.rewardPlan.friendId).toBe('signal-dog')

    const claimed = successful(
      reduceGame(
        started,
        {
          type: 'activity/claim',
          runId: started.activeActivity!.runId,
          now: started.activeActivity!.endsAt,
        },
        catalog,
      ),
    )
    expect(claimed.state.economy.apples).toBe(applesBefore + 3)
    expect(claimed.state.friends['signal-dog']).toMatchObject({
      firstMetAt: 10,
      lastMetAt: started.activeActivity!.endsAt,
      encounterCount: 2,
      totalGiftApples: 3,
    })
    expect(claimed.effects[0]).toMatchObject({
      summary: { friendId: 'signal-dog', giftItemId: null, giftApples: 3 },
    })
  })

  it('好友累计字段到达存档上限后仍可领取，不会生成不可再次导入的状态', () => {
    let state = willing(createInitialGameState({ now: 0, seed: 'music-friend-cap' }), 'music')
    state = withProbability(state, 'musicFriend', 1)
    state = {
      ...state,
      friends: {
        'signal-dog': {
          id: 'signal-dog',
          firstMetAt: 10,
          lastMetAt: 10,
          encounterCount: Number.MAX_SAFE_INTEGER,
          totalGiftApples: MAX_APPLES,
        },
      },
    }
    const started = successful(
      reduceGame(state, { type: 'activity/start', kind: 'music', now: 100 }, catalog),
    ).state
    const claimed = successful(
      reduceGame(
        started,
        {
          type: 'activity/claim',
          runId: started.activeActivity!.runId,
          now: started.activeActivity!.endsAt,
        },
        catalog,
      ),
    ).state

    expect(claimed.friends['signal-dog']).toMatchObject({
      encounterCount: Number.MAX_SAFE_INTEGER,
      totalGiftApples: MAX_APPLES,
    })
  })

  it('好友图鉴为空时，即使音乐好友概率为 100% 也不会凭空创建好友', () => {
    let state = willing(createInitialGameState({ now: 0, seed: 'music-empty-book' }), 'music')
    state = withProbability(state, 'musicFriend', 1)
    const applesBefore = state.economy.apples
    const started = successful(
      reduceGame(state, { type: 'activity/start', kind: 'music', now: 100 }, catalog),
    ).state
    expect(started.activeActivity?.rewardPlan.friendId).toBeNull()

    const claimed = successful(
      reduceGame(
        started,
        {
          type: 'activity/claim',
          runId: started.activeActivity!.runId,
          now: started.activeActivity!.endsAt,
        },
        catalog,
      ),
    )
    expect(claimed.state.friends).toEqual({})
    expect(claimed.state.economy.apples).toBe(applesBefore)
    expect(claimed.effects[0]).toMatchObject({
      summary: { friendId: null, giftApples: 0 },
    })
  })

  it('活动结束后消耗对应偏好；鼓励只花苹果，不产生任务收入', () => {
    const state = willing(createInitialGameState({ now: 0, seed: 'encourage' }), 'travel')
    const started = successful(
      reduceGame(state, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state
    const claimed = successful(
      reduceGame(
        started,
        {
          type: 'activity/claim',
          runId: started.activeActivity!.runId,
          now: started.activeActivity!.endsAt,
        },
        catalog,
      ),
    ).state
    expect(claimed.pet.preferences.travel).toBe(false)

    const applesBefore = claimed.economy.apples
    const tasksBefore = claimed.tasks
    const encouraged = successful(
      reduceGame(claimed, { type: 'pet/encourage', interest: 'travel' }, catalog),
    )
    expect(encouraged.state.economy.apples).toBe(applesBefore - 2)
    expect(encouraged.state.pet.preferences.travel).toBe(true)
    expect(encouraged.state.tasks).toBe(tasksBefore)
    expect(encouraged.effects).toEqual([
      { type: 'pet-encouraged', interest: 'travel', applesSpent: 2 },
    ])
  })

  it('活动期间不能移动或开始另一段睡觉，失败时保持原状态引用', () => {
    const initial = willing(createInitialGameState({ now: 0, seed: 'busy' }), 'travel')
    const started = successful(
      reduceGame(initial, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state
    for (const action of [
      { type: 'pet/move', location: 'bed' } as const,
      { type: 'activity/start', kind: 'rest', now: 101 } as const,
    ]) {
      const result = reduceGame(started, action, catalog)
      expect(result).toMatchObject({
        ok: false,
        error: { code: action.type === 'pet/move' ? 'PET_BUSY' : 'ACTIVITY_ALREADY_ACTIVE' },
      })
      expect(result.state).toBe(started)
    }
  })

  it('补充道具只花苹果，不推进任务', () => {
    const state = createInitialGameState({ now: 0, seed: 'fridge' })
    const purchased = successful(
      reduceGame(state, { type: 'item/purchase', itemId: 'signal-headphones' }, catalog),
    )
    expect(purchased.state.economy.apples).toBe(INITIAL_APPLES - 4)
    expect(purchased.state.inventory['signal-headphones']).toBe(1)
    expect(purchased.state.tasks).toBe(state.tasks)
    expect(purchased.state.statistics.applesEarned).toBe(0)
  })

  it('同一持久种子与状态产生相同奖励，睡觉和任务不会扰动奖励序列', () => {
    const base = willing(createInitialGameState({ now: 0, seed: 'independent-streams' }), 'travel')
    const restStarted = successful(
      reduceGame(base, { type: 'activity/start', kind: 'rest', now: 10 }, catalog),
    ).state
    const rested = successful(
      reduceGame(
        restStarted,
        {
          type: 'activity/claim',
          runId: restStarted.activeActivity!.runId,
          now: restStarted.activeActivity!.endsAt,
        },
        catalog,
      ),
    ).state
    const prepared = willing(rested, 'travel')

    const first = successful(
      reduceGame(base, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state
    const second = successful(
      reduceGame(prepared, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state

    expect(first.activeActivity?.rewardPlan).toEqual(second.activeActivity?.rewardPlan)
    expect(first.activeActivity?.rewardSeed).toBe('independent-streams:reward:0')
    expect(second.random.sequences.preferences).toBe(base.random.sequences.preferences + 1)
    expect(second.random.sequences.reward).toBe(1)
  })

  it('奖励序列到达上限时在扣补给前拒绝收藏活动，睡觉仍可独立完成', () => {
    const base = createInitialGameState({ now: 0, seed: 'reward-sequence-cap' })
    const capped: GameState = {
      ...base,
      random: {
        ...base.random,
        sequences: {
          reward: Number.MAX_SAFE_INTEGER,
          tasks: base.random.sequences.tasks,
          preferences: Number.MAX_SAFE_INTEGER,
        },
      },
      pet: { ...base.pet, restCount: Number.MAX_SAFE_INTEGER },
      statistics: {
        ...base.statistics,
        started: { ...base.statistics.started, rest: Number.MAX_SAFE_INTEGER },
        claimed: { ...base.statistics.claimed, rest: Number.MAX_SAFE_INTEGER },
        applesEarned: Number.MAX_SAFE_INTEGER,
      },
    }
    const willingTravel = willing(capped, 'travel')
    const rejected = reduceGame(
      willingTravel,
      { type: 'activity/start', kind: 'travel', now: 100 },
      catalog,
    )

    expect(rejected).toMatchObject({ ok: false, error: { code: 'INVALID_AMOUNT' } })
    expect(rejected.state).toBe(willingTravel)
    expect(rejected.state.inventory).toBe(willingTravel.inventory)
    expect(rejected.state.statistics).toBe(willingTravel.statistics)

    const restStarted = successful(
      reduceGame(capped, { type: 'activity/start', kind: 'rest', now: 100 }, catalog),
    ).state
    const restClaimed = successful(
      reduceGame(
        restStarted,
        {
          type: 'activity/claim',
          runId: restStarted.activeActivity!.runId,
          now: restStarted.activeActivity!.endsAt,
        },
        catalog,
      ),
    ).state

    expect(restClaimed.random.sequences).toMatchObject({
      reward: Number.MAX_SAFE_INTEGER,
      preferences: Number.MAX_SAFE_INTEGER,
    })
    expect(restClaimed.pet.restCount).toBe(Number.MAX_SAFE_INTEGER)
    expect(restClaimed.statistics.started.rest).toBe(Number.MAX_SAFE_INTEGER)
    expect(restClaimed.statistics.claimed.rest).toBe(Number.MAX_SAFE_INTEGER)
    expect(restClaimed.statistics.applesEarned).toBe(Number.MAX_SAFE_INTEGER)
    expect(gameStateV5Schema.safeParse(restClaimed).success).toBe(true)
  })

  it('活动统计达到上限后饱和，仍可生成可导出的活动状态', () => {
    const base = willing(createInitialGameState({ now: 0, seed: 'started-counter-cap' }), 'travel')
    const capped: GameState = {
      ...base,
      statistics: {
        ...base.statistics,
        started: { ...base.statistics.started, travel: Number.MAX_SAFE_INTEGER },
      },
    }

    const started = successful(
      reduceGame(capped, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state
    expect(started.statistics.started.travel).toBe(Number.MAX_SAFE_INTEGER)
    expect(started.random.sequences.reward).toBe(1)
    expect(gameStateV5Schema.safeParse(started).success).toBe(true)
  })

  it('结束时间超出 Date 上限时在扣补给与推进随机序列前拒绝开始', () => {
    const state = willing(createInitialGameState({ now: 0, seed: 'activity-date-cap' }), 'travel')
    const before = structuredClone(state)
    const result = reduceGame(
      state,
      {
        type: 'activity/start',
        kind: 'travel',
        now: MAX_DATE_TIMESTAMP_MS - BASE_ACTIVITY_DURATION_MS + 1,
      },
      catalog,
    )

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_DURATION' } })
    expect(result.state).toBe(state)
    expect(state).toEqual(before)
  })
})
