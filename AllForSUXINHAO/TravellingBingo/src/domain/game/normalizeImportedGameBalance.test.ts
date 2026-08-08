import { describe, expect, it } from 'vitest'

import { deriveActivityTiming } from '../activities/timing'
import { createInitialGameState } from './createGameState'
import type { GameBalance } from './gameBalance'
import { normalizeImportedGameBalance } from './normalizeImportedGameBalance'
import { reduceGame } from './reducer'
import type { ActivityRun, GameState } from './types'

const futureDefault: Readonly<GameBalance> = {
  activityDurationMs: 300_000,
  probabilities: {
    postcard: 0.8,
    millionShot: 0.5,
    siteFirst: 0.15,
    travelFriend: 0.25,
    musicFriend: 0.3,
  },
}

function oldOrdinaryState(): GameState {
  const state = createInitialGameState({ now: 1_000, seed: 'old-ordinary-balance' })
  const activeActivity: ActivityRun = {
    runId: 'old-short-run',
    kind: 'travel',
    startedAt: 10_000,
    endsAt: 15_000,
    rewardSeed: 'old-short-reward',
    rewardPlan: {
      baseApples: 0,
      modifierApples: 0,
      collection: { id: 'postcard-old', category: 'postcard' },
      friendId: 'signal-dog',
      giftItemId: null,
      guaranteedByPity: false,
      pityAfterClaim: null,
    },
    supplyId: 'travel-basic',
    usedLuckyApple: false,
  }

  return {
    ...state,
    gameBalance: {
      activityDurationMs: 5_000,
      probabilities: {
        postcard: 0.65,
        millionShot: 0.3,
        siteFirst: 0.05,
        travelFriend: 0.1,
        musicFriend: 0.2,
      },
    },
    activeActivity,
  }
}

describe('普通档导入平衡规范化', () => {
  it('只更新未来活动使用的 balance，进行中活动快照保持完全不变', () => {
    const oldState = oldOrdinaryState()
    const activeActivity = oldState.activeActivity
    const normalized = normalizeImportedGameBalance(oldState, futureDefault)

    expect(normalized).not.toBe(oldState)
    expect(normalized.gameBalance).toEqual(futureDefault)
    expect(normalized.gameBalance).not.toBe(futureDefault)
    expect(normalized.gameBalance.probabilities).not.toBe(futureDefault.probabilities)
    expect(normalized.activeActivity).toBe(activeActivity)
    expect(normalized.activeActivity).toEqual(oldState.activeActivity)
    expect(deriveActivityTiming(normalized.activeActivity!, 14_999).phase).toBe('running')
    expect(deriveActivityTiming(normalized.activeActivity!, 15_000).phase).toBe('ready')

    const catalog = {
      postcard: ['postcard-old'],
      'million-shot': ['million-shot-old'],
      'site-first': ['site-first-old'],
      siteFirstChronology: ['site-first-old'],
    } as const
    const claimed = reduceGame(
      normalized,
      { type: 'activity/claim', runId: normalized.activeActivity!.runId, now: 15_000 },
      catalog,
    )
    if (!claimed.ok) throw new Error(claimed.error.message)
    const prepared = {
      ...claimed.state,
      pet: {
        ...claimed.state.pet,
        preferences: { ...claimed.state.pet.preferences, music: true },
      },
    }
    const next = reduceGame(
      prepared,
      { type: 'activity/start', kind: 'music', now: 20_000 },
      catalog,
    )
    if (!next.ok) throw new Error(next.error.message)
    expect(next.state.activeActivity?.endsAt).toBe(20_000 + futureDefault.activityDurationMs)
  })

  it('DEBUG 档保留存档中的自定义 balance', () => {
    const oldState = oldOrdinaryState()
    const debugState: GameState = { ...oldState, profile: { ...oldState.profile, debug: true } }

    expect(normalizeImportedGameBalance(debugState, futureDefault)).toBe(debugState)
  })

  it('普通档已经使用当前默认时保持原 state 引用', () => {
    const oldState = oldOrdinaryState()
    const currentState: GameState = {
      ...oldState,
      gameBalance: {
        activityDurationMs: futureDefault.activityDurationMs,
        probabilities: { ...futureDefault.probabilities },
      },
    }

    expect(normalizeImportedGameBalance(currentState, futureDefault)).toBe(currentState)
  })
})
