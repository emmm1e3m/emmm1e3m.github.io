import { describe, expect, it } from 'vitest'

import { deriveActivityTiming } from '../activities/timing'
import { canUseLuckyApple, getLuckyAppleAvailability } from '../rewards/luckyApple'
import {
  BASE_ACTIVITY_DURATION_MS,
  INITIAL_APPLES,
  ITEM_PRICES,
  PET_ENCOURAGEMENT_APPLE_COST,
} from './constants'
import { createInitialGameState } from './createGameState'
import { DEFAULT_GAME_BALANCE } from './gameBalance'
import { reduceGame } from './reducer'
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
  return {
    ...state,
    pet: {
      ...state.pet,
      preferences: { ...state.pet.preferences, [kind]: true },
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

describe('旅行饼狗 v2 领域状态', () => {
  it('新游戏使用 schema v2、112 秒活动、三条任务与三条独立随机序列', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'save-seed' })

    expect(state.schemaVersion).toBe(2)
    expect(state.economy.apples).toBe(INITIAL_APPLES)
    expect(state.gameBalance).toEqual(DEFAULT_GAME_BALANCE)
    expect(state.gameBalance).toEqual({
      activityDurationMs: 112_000,
      probabilities: { postcard: 1, millionShot: 0.4, siteFirst: 0.1, friend: 0.2 },
    })
    expect(ITEM_PRICES).toEqual({
      'travel-basic': 3,
      'travel-apple': 5,
      'signal-headphones': 4,
      'trend-toolbox': 7,
      'lucky-apple': 6,
    })
    expect(PET_ENCOURAGEMENT_APPLE_COST).toBe(2)
    expect(state.tasks.active).toHaveLength(3)
    expect(state.random.seed).toBe('save-seed')
    expect(state.random.sequences).toEqual({ reward: 0, tasks: 1, preferences: 1 })
    expect(Object.values(state.pet.preferences).some(Boolean)).toBe(true)
  })

  it('开始活动原子扣除补给，并以绝对时间推导 112 秒边界', () => {
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
      state = withProbability(state, 'friend', chance)
      return successful(
        reduceGame(state, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
      ).state.activeActivity?.rewardPlan.friendEventId
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
    debug = successful(
      reduceGame(debug, { type: 'debug/duration-set', durationMs: 5_000 }, catalog),
    ).state
    debug = successful(
      reduceGame(debug, { type: 'debug/probability-set', key: 'friend', value: 0.75 }, catalog),
    ).state
    expect(debug.gameBalance).toMatchObject({
      activityDurationMs: 5_000,
      probabilities: { friend: 0.75 },
    })
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

  it('休息只推进偏好序列，重置心情且不改变苹果、任务或收藏奖励序列', () => {
    const state = createInitialGameState({ now: 0, seed: 'rest-streams' })
    const before = structuredClone(state.random.sequences)
    const rested = successful(reduceGame(state, { type: 'pet/rest', now: 100 }, catalog))

    expect(rested.state.pet.location).toBe('bed')
    expect(rested.state.pet.restCount).toBe(1)
    expect(rested.state.pet.tired).toBe(false)
    expect(Object.values(rested.state.pet.preferences).some(Boolean)).toBe(true)
    expect(rested.state.economy).toEqual(state.economy)
    expect(rested.state.random.sequences).toEqual({
      reward: before.reward,
      tasks: before.tasks,
      preferences: before.preferences + 1,
    })
    expect(rested.effects).toMatchObject([{ type: 'pet-rested', replayKey: 1 }])
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
      reduceGame(claimed, { type: 'pet/encourage', kind: 'travel' }, catalog),
    )
    expect(encouraged.state.economy.apples).toBe(applesBefore - 2)
    expect(encouraged.state.pet.preferences.travel).toBe(true)
    expect(encouraged.state.tasks).toBe(tasksBefore)
    expect(encouraged.effects).toEqual([{ type: 'pet-encouraged', kind: 'travel', applesSpent: 2 }])
  })

  it('活动期间不能移动或休息，失败时保持原状态引用', () => {
    const initial = willing(createInitialGameState({ now: 0, seed: 'busy' }), 'travel')
    const started = successful(
      reduceGame(initial, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state
    for (const action of [
      { type: 'pet/move', location: 'bed' } as const,
      { type: 'pet/rest', now: 101 } as const,
    ]) {
      const result = reduceGame(started, action, catalog)
      expect(result).toMatchObject({ ok: false, error: { code: 'PET_BUSY' } })
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
    const rested = successful(reduceGame(base, { type: 'pet/rest', now: 10 }, catalog)).state
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
})
