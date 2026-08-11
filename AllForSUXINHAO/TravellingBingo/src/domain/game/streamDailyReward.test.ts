import { describe, expect, it } from 'vitest'

import { MAX_APPLES } from './constants'
import { createInitialGameState } from './createGameState'
import { reduceGame } from './reducer'
import { STREAM_DAILY_REWARD_APPLES } from './streamDailyReward'
import type { CollectionCatalog, GameState, GameTransition } from './types'

const catalog: CollectionCatalog = {
  postcard: [],
  'million-shot': [],
  'site-first': [],
  siteFirstChronology: [],
}

function createState(seed = 'stream-daily-reward'): GameState {
  return createInitialGameState({ now: 1_000, seed })
}

function successful(transition: GameTransition): Extract<GameTransition, { ok: true }> {
  if (!transition.ok) {
    throw new Error(`${transition.error.code}: ${transition.error.message}`)
  }
  return transition
}

describe('每日在线刷播奖励', () => {
  it('首次领取有效日期奖励 20 个苹果，并记录实际收益与领取效果', () => {
    const initial = createState()
    const claimed = successful(
      reduceGame(initial, { type: 'stream/daily-reward-claim', dateKey: '2026-08-11' }, catalog),
    )

    expect(STREAM_DAILY_REWARD_APPLES).toBe(20)
    expect(claimed.state.economy.apples).toBe(initial.economy.apples + 20)
    expect(claimed.state.statistics.applesEarned).toBe(initial.statistics.applesEarned + 20)
    expect(claimed.state.reality.streamDailyReward).toEqual({
      lastRewardDateKey: '2026-08-11',
    })
    expect(claimed.effects).toEqual([
      {
        type: 'stream-daily-reward-claimed',
        dateKey: '2026-08-11',
        applesAwarded: 20,
      },
    ])
  })

  it('同一日期严格幂等，成功但保留输入状态原引用且不产生效果', () => {
    const first = successful(
      reduceGame(
        createState('same-date'),
        { type: 'stream/daily-reward-claim', dateKey: '2026-08-11' },
        catalog,
      ),
    ).state
    const repeated = successful(
      reduceGame(first, { type: 'stream/daily-reward-claim', dateKey: '2026-08-11' }, catalog),
    )

    expect(repeated.state).toBe(first)
    expect(repeated.effects).toEqual([])
  })

  it('只有严格更晚的日期可以再次领取，更早日期保持当前状态原引用', () => {
    const first = successful(
      reduceGame(
        createState('different-date'),
        { type: 'stream/daily-reward-claim', dateKey: '2026-08-11' },
        catalog,
      ),
    ).state
    const nextDay = successful(
      reduceGame(first, { type: 'stream/daily-reward-claim', dateKey: '2026-08-12' }, catalog),
    )
    const earlierDay = successful(
      reduceGame(
        nextDay.state,
        { type: 'stream/daily-reward-claim', dateKey: '2025-01-01' },
        catalog,
      ),
    )

    expect(nextDay.state.economy.apples).toBe(first.economy.apples + 20)
    expect(nextDay.state.reality.streamDailyReward.lastRewardDateKey).toBe('2026-08-12')
    expect(earlierDay.state).toBe(nextDay.state)
    expect(earlierDay.effects).toEqual([])
  })

  it.each(['2026-8-11', '2026/08/11', '2025-02-29', '2026-04-31'])(
    '非法或不存在的日期 %s 失败并返回原状态',
    (dateKey) => {
      const initial = createState(`invalid-${dateKey}`)
      const result = reduceGame(initial, { type: 'stream/daily-reward-claim', dateKey }, catalog)

      expect(result.ok).toBe(false)
      expect(result.state).toBe(initial)
      expect(result.effects).toEqual([])
      if (!result.ok) expect(result.error.code).toBe('INVALID_DATE_KEY')
    },
  )

  it('容量不足时只发放可容纳的苹果，并按实际值累计统计', () => {
    const base = createState('limited-capacity')
    const initial: GameState = {
      ...base,
      economy: { apples: MAX_APPLES - 7 },
      statistics: {
        ...base.statistics,
        applesEarned: 100,
      },
    }
    const claimed = successful(
      reduceGame(initial, { type: 'stream/daily-reward-claim', dateKey: '2026-08-11' }, catalog),
    )

    expect(claimed.state.economy.apples).toBe(MAX_APPLES)
    expect(claimed.state.statistics.applesEarned).toBe(107)
    expect(claimed.effects).toEqual([
      {
        type: 'stream-daily-reward-claimed',
        dateKey: '2026-08-11',
        applesAwarded: 7,
      },
    ])
  })

  it('苹果已满时仍提交领取日期，并产生奖励为零的效果', () => {
    const base = createState('full-capacity')
    const initial: GameState = {
      ...base,
      economy: { apples: MAX_APPLES },
      statistics: { ...base.statistics, applesEarned: 123 },
    }
    const claimed = successful(
      reduceGame(initial, { type: 'stream/daily-reward-claim', dateKey: '2026-08-11' }, catalog),
    )

    expect(claimed.state).not.toBe(initial)
    expect(claimed.state.economy.apples).toBe(MAX_APPLES)
    expect(claimed.state.statistics.applesEarned).toBe(123)
    expect(claimed.state.reality.streamDailyReward.lastRewardDateKey).toBe('2026-08-11')
    expect(claimed.effects).toEqual([
      {
        type: 'stream-daily-reward-claimed',
        dateKey: '2026-08-11',
        applesAwarded: 0,
      },
    ])
  })

  it('苹果收益计数器在安全整数上限饱和', () => {
    const base = createState('safe-counter')
    const initial: GameState = {
      ...base,
      statistics: {
        ...base.statistics,
        applesEarned: Number.MAX_SAFE_INTEGER - 5,
      },
    }
    const claimed = successful(
      reduceGame(initial, { type: 'stream/daily-reward-claim', dateKey: '2024-02-29' }, catalog),
    )

    expect(claimed.state.economy.apples).toBe(initial.economy.apples + 20)
    expect(claimed.state.statistics.applesEarned).toBe(Number.MAX_SAFE_INTEGER)
    expect(claimed.effects[0]).toMatchObject({ applesAwarded: 20 })
  })
})
