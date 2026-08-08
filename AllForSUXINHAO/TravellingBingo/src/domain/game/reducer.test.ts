import { describe, expect, it } from 'vitest'

import { deriveActivityTiming } from '../activities/timing'
import { BASE_ACTIVITY_DURATION_MS, INITIAL_APPLES } from './constants'
import { createInitialGameState } from './createGameState'
import { reduceGame } from './reducer'
import type { CollectionCatalog, GameState, GameTransition } from './types'

const catalog: CollectionCatalog = {
  postcard: ['postcard-1', 'postcard-2'],
  'million-shot': ['million-1'],
  'site-first': ['site-first-1'],
}

function successful(transition: GameTransition): Extract<GameTransition, { ok: true }> {
  if (!transition.ok) {
    throw new Error(`${transition.error.code}: ${transition.error.message}`)
  }
  return transition
}

function withItem(state: GameState, itemId: keyof GameState['inventory'], quantity = 1): GameState {
  return {
    ...state,
    inventory: { ...state.inventory, [itemId]: quantity },
  }
}

describe('旅行饼狗领域状态', () => {
  it('新游戏拥有 18 个苹果与一份普通旅行便当', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'save-seed' })

    expect(state.economy.apples).toBe(INITIAL_APPLES)
    expect(state.inventory).toEqual({
      'travel-basic': 1,
      'travel-apple': 0,
      'signal-headphones': 0,
      'trend-toolbox': 0,
      'lucky-apple': 0,
    })
    expect(state.random).toEqual({ seed: 'save-seed', sequence: 0 })
  })

  it('开始任务原子扣除补给，并以绝对时间推导 72 分钟边界', () => {
    const initial = createInitialGameState({ now: 1_000, seed: 'travel-seed' })
    const started = successful(
      reduceGame(initial, { type: 'activity/start', kind: 'travel', now: 10_000 }, catalog),
    ).state
    const activity = started.activeActivity

    expect(initial.inventory['travel-basic']).toBe(1)
    expect(started.inventory['travel-basic']).toBe(0)
    expect(activity?.endsAt).toBe(10_000 + BASE_ACTIVITY_DURATION_MS)
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

  it('只有调试档能覆盖下一次任务时长', () => {
    const normal = createInitialGameState({ now: 0, seed: 'normal' })
    const denied = reduceGame(
      normal,
      { type: 'activity/start', kind: 'travel', now: 0, debugDurationMs: 5_000 },
      catalog,
    )
    expect(denied).toMatchObject({ ok: false, error: { code: 'DEBUG_REQUIRED' } })
    expect(denied.state).toBe(normal)

    const debug = createInitialGameState({ now: 0, seed: 'debug', debug: true })
    const started = successful(
      reduceGame(
        debug,
        { type: 'activity/start', kind: 'travel', now: 20, debugDurationMs: 5_000 },
        catalog,
      ),
    ).state
    expect(started.activeActivity?.endsAt).toBe(5_020)
  })

  it('同一持久种子与状态产生完全相同的奖励计划，种子序号随任务推进', () => {
    const firstSave = createInitialGameState({ now: 0, seed: 'persistent-seed' })
    const importedCopy = structuredClone(firstSave)
    const firstStart = successful(
      reduceGame(firstSave, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state
    const importedStart = successful(
      reduceGame(importedCopy, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state

    expect(firstStart.activeActivity).toEqual(importedStart.activeActivity)
    expect(firstStart.activeActivity?.rewardSeed).toBe('persistent-seed:0')
    expect(firstStart.random.sequence).toBe(1)

    const claimed = successful(
      reduceGame(
        firstStart,
        {
          type: 'activity/claim',
          runId: firstStart.activeActivity!.runId,
          now: firstStart.activeActivity!.endsAt,
        },
        catalog,
      ),
    ).state
    const replenished = withItem(claimed, 'travel-basic')
    const secondStart = successful(
      reduceGame(replenished, { type: 'activity/start', kind: 'travel', now: 9_000_000 }, catalog),
    ).state
    expect(secondStart.activeActivity?.rewardSeed).toBe('persistent-seed:1')
  })

  it('刷播第 3 次与冲热第 8 次必定生成收藏奖励', () => {
    const base = createInitialGameState({ now: 0, seed: 'pity-boundary' })
    const streamReady: GameState = {
      ...withItem(base, 'signal-headphones'),
      pity: { stream: 2, trend: 0 },
    }
    const streamStart = successful(
      reduceGame(streamReady, { type: 'activity/start', kind: 'stream', now: 100 }, catalog),
    ).state
    expect(streamStart.activeActivity?.rewardPlan.collection?.category).toBe('million-shot')
    const streamClaim = successful(
      reduceGame(
        streamStart,
        {
          type: 'activity/claim',
          runId: streamStart.activeActivity!.runId,
          now: streamStart.activeActivity!.endsAt,
        },
        catalog,
      ),
    ).state
    expect(streamClaim.pity.stream).toBe(0)

    const trendReady: GameState = {
      ...withItem(streamClaim, 'trend-toolbox'),
      pity: { ...streamClaim.pity, trend: 7 },
    }
    const trendStart = successful(
      reduceGame(trendReady, { type: 'activity/start', kind: 'trend', now: 5_000_000 }, catalog),
    ).state
    expect(trendStart.activeActivity?.rewardPlan.collection?.category).toBe('site-first')
    const trendClaim = successful(
      reduceGame(
        trendStart,
        {
          type: 'activity/claim',
          runId: trendStart.activeActivity!.runId,
          now: trendStart.activeActivity!.endsAt,
        },
        catalog,
      ),
    ).state
    expect(trendClaim.pity.trend).toBe(0)
  })

  it('第一次刷播固定带回一张百万纪念海报', () => {
    const base = createInitialGameState({ now: 0, seed: 'first-stream-gift' })
    const prepared = withItem(base, 'signal-headphones')
    const started = successful(
      reduceGame(prepared, { type: 'activity/start', kind: 'stream', now: 100 }, catalog),
    ).state

    expect(started.activeActivity?.rewardPlan.collection?.category).toBe('million-shot')
    expect(started.activeActivity?.rewardPlan.guaranteedByPity).toBe(false)
  })

  it('领奖原子提交，重复百万直拍折算 5 个苹果且同一 runId 不能领两次', () => {
    const base = createInitialGameState({ now: 0, seed: 'duplicate' })
    const prepared: GameState = {
      ...withItem(base, 'signal-headphones'),
      collections: {
        'million-1': { id: 'million-1', firstObtainedAt: 1, duplicateCount: 0 },
      },
      pity: { stream: 2, trend: 0 },
    }
    const started = successful(
      reduceGame(prepared, { type: 'activity/start', kind: 'stream', now: 100 }, catalog),
    ).state
    const runId = started.activeActivity!.runId
    const applesBeforeClaim = started.economy.apples
    const firstClaim = successful(
      reduceGame(
        started,
        { type: 'activity/claim', runId, now: started.activeActivity!.endsAt },
        catalog,
      ),
    )
    const summary = firstClaim.effects[0]

    expect(summary).toMatchObject({
      type: 'activity-claimed',
      summary: {
        apples: { duplicateCompensation: 5 },
        collection: { id: 'million-1', duplicate: true },
      },
    })
    expect(firstClaim.state.economy.apples - applesBeforeClaim).toBe(
      started.activeActivity!.rewardPlan.baseApples + 5,
    )
    expect(firstClaim.state.collections['million-1'].duplicateCount).toBe(1)
    expect(firstClaim.state.activeActivity).toBeNull()

    const secondClaim = reduceGame(
      firstClaim.state,
      { type: 'activity/claim', runId, now: started.activeActivity!.endsAt },
      catalog,
    )
    expect(secondClaim).toMatchObject({ ok: false, error: { code: 'ACTIVITY_NOT_ACTIVE' } })
    expect(secondClaim.state).toBe(firstClaim.state)
  })

  it('支持购买与调试增减资源、立即完成和目录驱动的一键全收集', () => {
    const debug = createInitialGameState({ now: 0, seed: 'debug-tools', debug: true })
    const purchased = successful(
      reduceGame(debug, { type: 'item/purchase', itemId: 'signal-headphones' }, catalog),
    ).state
    expect(purchased.economy.apples).toBe(14)
    expect(purchased.inventory['signal-headphones']).toBe(1)

    const applesAdjusted = successful(
      reduceGame(purchased, { type: 'debug/apples-adjust', delta: 6 }, catalog),
    ).state
    const itemAdjusted = successful(
      reduceGame(
        applesAdjusted,
        { type: 'debug/item-adjust', itemId: 'trend-toolbox', delta: 2 },
        catalog,
      ),
    ).state
    expect(itemAdjusted.economy.apples).toBe(20)
    expect(itemAdjusted.inventory['trend-toolbox']).toBe(2)

    const allCollected = successful(
      reduceGame(itemAdjusted, { type: 'debug/collect-all', now: 500 }, catalog),
    )
    expect(Object.keys(allCollected.state.collections).sort()).toEqual([
      'million-1',
      'postcard-1',
      'postcard-2',
      'site-first-1',
    ])
    expect(allCollected.effects).toEqual([
      { type: 'debug-applied', action: 'debug/collect-all', changedCount: 4 },
    ])

    const started = successful(
      reduceGame(
        {
          ...allCollected.state,
          inventory: { ...allCollected.state.inventory, 'travel-basic': 1 },
        },
        { type: 'activity/start', kind: 'travel', now: 1_000 },
        catalog,
      ),
    ).state
    const completed = successful(
      reduceGame(started, { type: 'debug/activity-complete', now: 1_001 }, catalog),
    ).state
    expect(deriveActivityTiming(completed.activeActivity, 1_001).phase).toBe('ready')
  })

  it('普通档不能调用调试事件，失败时保持原对象引用', () => {
    const normal = createInitialGameState({ now: 0, seed: 'normal' })
    const result = reduceGame(normal, { type: 'debug/apples-adjust', delta: 1 }, catalog)

    expect(result).toMatchObject({ ok: false, error: { code: 'DEBUG_REQUIRED' } })
    expect(result.state).toBe(normal)
  })
})
