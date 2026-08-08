import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { reconcileGameStateWithCatalog } from './reconcileGameStateWithCatalog'
import type { CollectionCatalog, GameState } from './types'

const catalog: CollectionCatalog = {
  postcard: ['postcard-owned', 'postcard-new'],
  'million-shot': ['million-1'],
  'site-first': ['first-1'],
  siteFirstChronology: ['first-1'],
}

function stateWithPlannedPostcard(id: string): GameState {
  const state = createInitialGameState({ now: 0, seed: 'reconcile' })
  return {
    ...state,
    activeActivity: {
      runId: 'legacy-v2-run',
      kind: 'travel',
      startedAt: 0,
      endsAt: 112_000,
      rewardSeed: 'legacy-v2-reward',
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: { id, category: 'postcard' },
        friendEventId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: 'travel-basic',
      usedLuckyApple: false,
    },
  }
}

describe('早期 v2 存档目录协调', () => {
  it('清除尚未领取的重复收藏计划且不修改原对象', () => {
    const state = stateWithPlannedPostcard('postcard-owned')
    state.collections['postcard-owned'] = {
      id: 'postcard-owned',
      firstObtainedAt: 1,
      duplicateCount: 0,
    }
    const reconciled = reconcileGameStateWithCatalog(state, catalog)

    expect(reconciled).not.toBe(state)
    expect(reconciled.activeActivity).toMatchObject({
      startedAt: 0,
      endsAt: 112_000,
      rewardSeed: 'legacy-v2-reward',
      rewardPlan: { collection: null },
    })
    expect(state.activeActivity?.rewardPlan.collection?.id).toBe('postcard-owned')
  })

  it('保留目录扩充后尚未拥有的新收藏计划', () => {
    const state = stateWithPlannedPostcard('postcard-new')
    state.collections['postcard-owned'] = {
      id: 'postcard-owned',
      firstObtainedAt: 1,
      duplicateCount: 0,
    }

    expect(reconcileGameStateWithCatalog(state, catalog)).toBe(state)
  })
})
