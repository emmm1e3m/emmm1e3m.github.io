import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import type { GameBalance } from './gameBalance'
import { normalizeImportedGameBalance } from './normalizeImportedGameBalance'
import type { ActivityRun, GameState } from './types'

const futureDefault: Readonly<GameBalance> = {
  activityDurationMs: 300_000,
  probabilities: { postcard: 0.8, millionShot: 0.5, siteFirst: 0.15, friend: 0.25 },
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
      friendEventId: 'signal-dog',
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
      probabilities: { postcard: 1, millionShot: 0.3, siteFirst: 0.05, friend: 0.1 },
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
