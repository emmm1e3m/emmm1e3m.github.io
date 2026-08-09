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
        friendId: null,
        giftItemId: null,
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

  it('不通过删除重复项掩盖活动类别或新旅行好友组合篡改', () => {
    const wrongCategory = stateWithPlannedPostcard('postcard-owned')
    wrongCategory.collections['postcard-owned'] = {
      id: 'postcard-owned',
      firstObtainedAt: 1,
      duplicateCount: 0,
    }
    wrongCategory.activeActivity!.kind = 'stream'
    wrongCategory.activeActivity!.supplyId = 'signal-headphones'
    expect(reconcileGameStateWithCatalog(wrongCategory, catalog)).toBe(wrongCategory)

    const invalidNewFriend = stateWithPlannedPostcard('postcard-owned')
    invalidNewFriend.collections['postcard-owned'] = {
      id: 'postcard-owned',
      firstObtainedAt: 1,
      duplicateCount: 0,
    }
    invalidNewFriend.activeActivity!.rewardPlan.friendId = 'signal-dog'
    invalidNewFriend.activeActivity!.rewardPlan.giftItemId = 'signal-headphones'
    expect(reconcileGameStateWithCatalog(invalidNewFriend, catalog)).toBe(invalidNewFriend)
  })

  it('清理不再拥有的苹果钟明信片背景，同时保留计时绝对时间', () => {
    const state = stateWithPlannedPostcard('postcard-new')
    state.reality.pomodoro.selectedPostcardId = 'postcard-new'
    state.reality.pomodoro.session = {
      sessionId: 'pomodoro-1',
      status: 'running',
      startedAt: 10,
      endsAt: 1_010,
      durationMs: 1_000,
      completedAt: null,
      notificationIssuedAt: null,
      todoId: null,
      postcardId: 'postcard-new',
    }

    const reconciled = reconcileGameStateWithCatalog(state, catalog)

    expect(reconciled.reality.pomodoro.selectedPostcardId).toBeNull()
    expect(reconciled.reality.pomodoro.session).toMatchObject({
      startedAt: 10,
      endsAt: 1_010,
      postcardId: null,
    })
    expect(state.reality.pomodoro.selectedPostcardId).toBe('postcard-new')
  })
})
