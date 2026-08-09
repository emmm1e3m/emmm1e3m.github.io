import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { reconcileGameStateWithCatalog } from './reconcileGameStateWithCatalog'
import type { CollectionCatalog, GameState } from './types'
import { validateImportedGameState } from './validateImportedGameState'

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

describe('存档目录与任务可达性协调', () => {
  it('替换导入任务板中已经失去收藏条件的未完成槽位并只推进任务序列', () => {
    const state = createInitialGameState({ now: 0, seed: 'reconcile-task-board' })
    const completedBackpack = {
      instanceId: 'keep-completed-backpack',
      taskId: 'open-backpack' as const,
      assignedAt: 10,
      progress: 1,
      target: 1,
      rewardApples: 1,
      seenKeys: ['opened'],
    }
    const partialRoom = {
      instanceId: 'keep-partial-room',
      taskId: 'room-stroll' as const,
      assignedAt: 10,
      progress: 1,
      target: 2,
      rewardApples: 2,
      seenKeys: ['bed'],
    }
    const unavailableFirst = {
      instanceId: 'replace-unavailable-first',
      taskId: 'remember-first' as const,
      assignedAt: 10,
      progress: 0,
      target: 1,
      rewardApples: 2,
      seenKeys: [],
    }
    state.tasks.active = [completedBackpack, partialRoom, unavailableFirst]
    const beforeSequence = state.random.sequences.tasks

    const reconciled = reconcileGameStateWithCatalog(state, catalog)

    expect(reconciled).not.toBe(state)
    expect(reconciled.tasks.active[0]).toBe(completedBackpack)
    expect(reconciled.tasks.active[1]).toBe(partialRoom)
    expect(reconciled.tasks.active[2]).not.toBe(unavailableFirst)
    expect(reconciled.tasks.active[2]).toMatchObject({ assignedAt: 10, progress: 0, seenKeys: [] })
    expect(reconciled.tasks.active[2].taskId).not.toBe('remember-first')
    expect(reconciled.random.sequences).toEqual({
      ...state.random.sequences,
      tasks: beforeSequence + 1,
    })
  })

  it('不通过替换不可达槽位掩盖 target 或进度 key 被篡改的任务', () => {
    const state = createInitialGameState({ now: 0, seed: 'do-not-mask-crafted-task' })
    state.tasks.active = [
      {
        instanceId: 'crafted-unavailable-first',
        taskId: 'remember-first',
        assignedAt: 0,
        progress: 1,
        target: 999,
        rewardApples: 2,
        seenKeys: ['not-in-catalog'],
      },
      {
        instanceId: 'valid-room',
        taskId: 'room-stroll',
        assignedAt: 0,
        progress: 0,
        target: 2,
        rewardApples: 2,
        seenKeys: [],
      },
      {
        instanceId: 'valid-backpack',
        taskId: 'open-backpack',
        assignedAt: 0,
        progress: 0,
        target: 1,
        rewardApples: 1,
        seenKeys: [],
      },
    ]

    const reconciled = reconcileGameStateWithCatalog(state, catalog)

    expect(reconciled).toBe(state)
    expect(validateImportedGameState(reconciled, catalog)).toMatchObject({
      ok: false,
      code: 'TASK_BOARD_INVALID',
    })

    const invalidReward = createInitialGameState({ now: 0, seed: 'do-not-mask-task-reward' })
    invalidReward.tasks.active = [
      {
        instanceId: 'crafted-reward-first',
        taskId: 'remember-first',
        assignedAt: 0,
        progress: 0,
        target: 1,
        rewardApples: -1,
        seenKeys: [],
      },
      {
        instanceId: 'valid-reward-room',
        taskId: 'room-stroll',
        assignedAt: 0,
        progress: 0,
        target: 2,
        rewardApples: 2,
        seenKeys: [],
      },
      {
        instanceId: 'valid-reward-backpack',
        taskId: 'open-backpack',
        assignedAt: 0,
        progress: 0,
        target: 1,
        rewardApples: 1,
        seenKeys: [],
      },
    ]
    const rewardReconciled = reconcileGameStateWithCatalog(invalidReward, catalog)
    expect(rewardReconciled).toBe(invalidReward)
    expect(validateImportedGameState(rewardReconciled, catalog)).toMatchObject({
      ok: false,
      code: 'TASK_BOARD_INVALID',
    })
  })

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
      status: 'focus',
      startedAt: 10,
      focusEndsAt: 1_010,
      cycleEndsAt: 1_010,
      focusDurationMs: 1_000,
      breakDurationMs: 0,
      completedAt: null,
      focusNotificationIssuedAt: null,
      completionNotificationIssuedAt: null,
      todoId: null,
      postcardId: 'postcard-new',
    }

    const reconciled = reconcileGameStateWithCatalog(state, catalog)

    expect(reconciled.reality.pomodoro.selectedPostcardId).toBeNull()
    expect(reconciled.reality.pomodoro.session).toMatchObject({
      startedAt: 10,
      focusEndsAt: 1_010,
      cycleEndsAt: 1_010,
      postcardId: null,
    })
    expect(state.reality.pomodoro.selectedPostcardId).toBe('postcard-new')
  })
})
