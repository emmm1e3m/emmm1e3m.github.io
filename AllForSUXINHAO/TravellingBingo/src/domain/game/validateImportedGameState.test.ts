import { createInitialGameState } from './createGameState'
import { gameStateV11Schema } from './migrateGameStateV10'
import type { ActivityRun, CollectionCatalog, GameState } from './types'
import { validateImportedGameState } from './validateImportedGameState'

const catalog: CollectionCatalog = {
  postcard: ['postcard-1'],
  'million-shot': ['million-shot-1'],
  'site-first': ['site-first-1'],
  siteFirstChronology: ['site-first-1'],
}

function stateWithActivity(
  collection: ActivityRun['rewardPlan']['collection'],
  kind: ActivityRun['kind'] = 'stream',
): GameState {
  const state = createInitialGameState({ now: 1_000, seed: 'import-validation' })
  return {
    ...state,
    activeActivity: {
      runId: 'run-import-validation',
      kind,
      startedAt: 1_000,
      endsAt: 2_000,
      rewardSeed: 'reward-import-validation',
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection,
        friendId: null,
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId:
        kind === 'travel'
          ? 'travel-basic'
          : kind === 'stream'
            ? 'signal-headphones'
            : kind === 'trend'
              ? 'trend-toolbox'
              : null,
      usedLuckyApple: false,
    },
  }
}

describe('导入存档与当前收藏目录的一致性', () => {
  it('接受键值一致且任务奖励属于正确类别的状态', () => {
    const state = stateWithActivity({ id: 'million-shot-1', category: 'million-shot' })
    state.collections['postcard-1'] = {
      id: 'postcard-1',
      firstObtainedAt: 1_000,
      duplicateCount: 0,
    }

    expect(validateImportedGameState(state, catalog)).toEqual({ ok: true })
  })

  it('拒绝收藏记录键与条目 ID 不一致', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'key-mismatch' })
    state.collections['postcard-1'] = {
      id: 'million-shot-1',
      firstObtainedAt: 1_000,
      duplicateCount: 0,
    }

    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'COLLECTION_KEY_MISMATCH',
    })
  })

  it('拒绝当前目录中不存在的已收藏 ID', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'unknown-collection' })
    state.collections['removed-collection'] = {
      id: 'removed-collection',
      firstObtainedAt: 1_000,
      duplicateCount: 0,
    }

    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'UNKNOWN_COLLECTION',
    })
  })

  it('拒绝与活动种类不符的奖励类别', () => {
    const state = stateWithActivity({ id: 'site-first-1', category: 'site-first' }, 'stream')

    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_CATEGORY_MISMATCH',
    })
  })

  it('拒绝目录中不存在的计划奖励 ID', () => {
    const state = stateWithActivity({ id: 'removed-million-shot', category: 'million-shot' })

    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'UNKNOWN_REWARD_COLLECTION',
    })
  })

  it('拒绝实际目录类别与奖励计划类别不一致', () => {
    const state = stateWithActivity({ id: 'postcard-1', category: 'million-shot' }, 'stream')

    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_CATALOG_CATEGORY_MISMATCH',
    })
  })

  it('旧存档只保存拥有项，目录扩充后仍然有效', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'expanded-catalog' })
    state.collections['postcard-1'] = {
      id: 'postcard-1',
      firstObtainedAt: 1_000,
      duplicateCount: 0,
    }
    const expandedCatalog: CollectionCatalog = {
      ...catalog,
      postcard: [...catalog.postcard, 'postcard-added-later'],
    }

    expect(validateImportedGameState(state, expandedCatalog)).toEqual({ ok: true })
  })

  it('拒绝不完整或重复的全站第一 chronology', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'bad-chronology' })
    const invalidCatalog: CollectionCatalog = {
      ...catalog,
      'site-first': ['site-first-1', 'site-first-2'],
      siteFirstChronology: ['site-first-1', 'site-first-1'],
    }

    expect(validateImportedGameState(state, invalidCatalog)).toMatchObject({
      ok: false,
      code: 'INVALID_CATALOG',
    })
  })

  it('接受同日保留并记录完成时间的全完成任务板', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'completed-task-board' })
    state.tasks.active = [
      {
        instanceId: 'completed-backpack',
        taskId: 'open-backpack',
        assignedAt: 1_000,
        progress: 1,
        target: 1,
        rewardApples: 1,
        seenKeys: ['opened'],
      },
      {
        instanceId: 'completed-room',
        taskId: 'room-stroll',
        assignedAt: 1_000,
        progress: 3,
        target: 3,
        rewardApples: 2,
        seenKeys: ['bed', 'computer', 'wardrobe'],
      },
      {
        instanceId: 'completed-stage-test',
        taskId: 'stage-test',
        assignedAt: 1_000,
        progress: 1,
        target: 1,
        rewardApples: 3,
        seenKeys: ['opened'],
      },
    ]
    state.tasks.completedAt = 2_000
    state.tasks.oneOffCompleted = ['stage-test']

    expect(validateImportedGameState(state, catalog)).toEqual({ ok: true })

    const missingOneOffRecord = structuredClone(state)
    missingOneOffRecord.tasks.oneOffCompleted = []
    expect(validateImportedGameState(missingOneOffRecord, catalog)).toMatchObject({
      ok: false,
      code: 'TASK_BOARD_INVALID',
    })

    const missingCompletionTime = structuredClone(state)
    missingCompletionTime.tasks.completedAt = null
    expect(validateImportedGameState(missingCompletionTime, catalog)).toMatchObject({
      ok: false,
      code: 'TASK_BOARD_INVALID',
    })

    const earlyCompletionTime = structuredClone(state)
    earlyCompletionTime.tasks.completedAt = 999
    expect(validateImportedGameState(earlyCompletionTime, catalog)).toMatchObject({
      ok: false,
      code: 'TASK_BOARD_INVALID',
    })
  })

  it('接受跨日后仍保留原进度且 completedAt 为 null 的未完成任务板', () => {
    const state = createInitialGameState({
      now: new Date(2026, 7, 1, 12).getTime(),
      seed: 'unfinished-imported-task-board',
    })
    state.tasks.active = [
      {
        instanceId: 'inherited-backpack',
        taskId: 'open-backpack',
        assignedAt: new Date(2026, 7, 1, 12).getTime(),
        progress: 1,
        target: 1,
        rewardApples: 1,
        seenKeys: ['opened'],
      },
      {
        instanceId: 'inherited-room',
        taskId: 'room-stroll',
        assignedAt: new Date(2026, 7, 1, 12).getTime(),
        progress: 1,
        target: 2,
        rewardApples: 2,
        seenKeys: ['bed'],
      },
      {
        instanceId: 'inherited-piano',
        taskId: 'piano-time',
        assignedAt: new Date(2026, 7, 1, 12).getTime(),
        progress: 0,
        target: 1,
        rewardApples: 1,
        seenKeys: [],
      },
    ]
    state.tasks.completedAt = null

    expect(validateImportedGameState(state, catalog)).toEqual({ ok: true })
  })

  it('拒绝尚未协调且当前缺少收藏先决条件的未完成任务', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'unavailable-imported-task' })
    state.tasks.active = [
      {
        instanceId: 'unavailable-first',
        taskId: 'remember-first',
        assignedAt: 1_000,
        progress: 0,
        target: 1,
        rewardApples: 2,
        seenKeys: [],
      },
      {
        instanceId: 'reachable-room',
        taskId: 'room-stroll',
        assignedAt: 1_000,
        progress: 0,
        target: 2,
        rewardApples: 2,
        seenKeys: [],
      },
      {
        instanceId: 'reachable-backpack',
        taskId: 'open-backpack',
        assignedAt: 1_000,
        progress: 0,
        target: 1,
        rewardApples: 1,
        seenKeys: [],
      },
    ]

    expect(gameStateV11Schema.safeParse(state).success).toBe(true)
    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'TASK_BOARD_INVALID',
    })
  })

  it('拒绝形状合法但进度与 seenKeys 不一致的 crafted V4 任务板', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'crafted-task-progress' })
    const task = state.tasks.active.find((entry) => entry.target === 1)
    if (task === undefined) throw new Error('测试任务板至少应包含一项目标为 1 的任务')
    task.progress = 0
    task.seenKeys = ['opened']

    expect(gameStateV11Schema.safeParse(state).success).toBe(true)
    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'TASK_BOARD_INVALID',
    })
  })

  it('拒绝唯一 key 已耗尽却仍未达到历史 target 的 crafted V4 任务板', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'crafted-exhausted-task' })
    state.tasks.active = [
      {
        instanceId: 'crafted-open-backpack',
        taskId: 'open-backpack',
        assignedAt: 1_000,
        progress: 1,
        target: 2,
        rewardApples: 1,
        seenKeys: ['opened'],
      },
      {
        instanceId: 'crafted-room-stroll',
        taskId: 'room-stroll',
        assignedAt: 1_000,
        progress: 0,
        target: 3,
        rewardApples: 2,
        seenKeys: [],
      },
      {
        instanceId: 'crafted-piano-time',
        taskId: 'piano-time',
        assignedAt: 1_000,
        progress: 0,
        target: 1,
        rewardApples: 1,
        seenKeys: [],
      },
    ]

    expect(gameStateV11Schema.safeParse(state).success).toBe(true)
    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'TASK_BOARD_INVALID',
    })
  })

  it('逐项拒绝被伪造的任务计数、实例与触发组，同时保留历史目标奖励快照', () => {
    const mutateCases: Array<(state: GameState) => void> = [
      (state) => {
        state.tasks.active[0].progress = state.tasks.active[0].target + 1
      },
      (state) => {
        state.tasks.active[0].progress = 1
        state.tasks.active[0].seenKeys = ['same', 'same']
      },
      (state) => {
        state.tasks.active[1].instanceId = state.tasks.active[0].instanceId
      },
      (state) => {
        state.tasks.active[1] = {
          ...structuredClone(state.tasks.active[0]),
          instanceId: state.tasks.active[1].instanceId,
        }
      },
    ]

    for (const [index, mutate] of mutateCases.entries()) {
      const state = createInitialGameState({ now: 1_000, seed: `crafted-task-${index}` })
      mutate(state)
      expect(validateImportedGameState(state, catalog)).toMatchObject({
        ok: false,
        code: 'TASK_BOARD_INVALID',
      })
    }

    const historicalSnapshot = createInitialGameState({ now: 1_000, seed: 'historical-task' })
    historicalSnapshot.tasks.active = [
      {
        instanceId: 'historical-room',
        taskId: 'room-stroll',
        assignedAt: 1_000,
        progress: 1,
        target: 3,
        rewardApples: 9,
        seenKeys: ['bed'],
      },
      {
        instanceId: 'historical-backpack',
        taskId: 'open-backpack',
        assignedAt: 1_000,
        progress: 0,
        target: 1,
        rewardApples: 7,
        seenKeys: [],
      },
      {
        instanceId: 'historical-piano',
        taskId: 'piano-time',
        assignedAt: 1_000,
        progress: 0,
        target: 1,
        rewardApples: 5,
        seenKeys: [],
      },
    ]
    expect(validateImportedGameState(historicalSnapshot, catalog)).toEqual({ ok: true })
  })

  it('拒绝 V4 任务板中已经退役且无法继续完成的任务', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'crafted-retired-task' })
    state.tasks.active[0] = {
      instanceId: 'retired-greeting',
      taskId: 'greet-bingo',
      assignedAt: 1_000,
      progress: 0,
      target: 1,
      rewardApples: 1,
      seenKeys: [],
    }

    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'TASK_BOARD_INVALID',
    })
  })

  it('拒绝疲劳标记与活动意愿互相矛盾的存档', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'fatigue-mismatch' })
    state.pet.tired = true

    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'PET_FATIGUE_MISMATCH',
    })
  })

  it('好友图鉴只保存已认识条目，并校验记录键与 ID 一致', () => {
    const state = createInitialGameState({ now: 0, seed: 'friend-validation' })
    const valid: GameState = {
      ...state,
      friends: {
        'signal-dog': {
          id: 'signal-dog',
          firstMetAt: 1,
          lastMetAt: 2,
          encounterCount: 2,
          totalGiftApples: 3,
        },
      },
    }
    expect(validateImportedGameState(valid, catalog)).toEqual({ ok: true })

    const mismatch = structuredClone(valid)
    mismatch.friends['signal-dog']!.id = 'bili-bing'
    expect(validateImportedGameState(mismatch, catalog)).toMatchObject({
      ok: false,
      code: 'FRIEND_KEY_MISMATCH',
    })

    const unknown = structuredClone(state) as GameState & {
      friends: Record<string, (typeof valid.friends)['signal-dog']>
    }
    unknown.friends['unknown-friend'] = valid.friends['signal-dog']
    expect(validateImportedGameState(unknown, catalog)).toMatchObject({
      ok: false,
      code: 'UNKNOWN_FRIEND',
    })
  })

  it('按活动类型拒绝伪造的苹果、好友或礼物奖励组合', () => {
    const rest = stateWithActivity(null, 'rest')
    rest.activeActivity!.rewardPlan.baseApples = 0
    expect(validateImportedGameState(rest, catalog)).toEqual({ ok: true })
    rest.activeActivity!.rewardPlan.friendId = 'signal-dog'
    expect(validateImportedGameState(rest, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_PLAN_MISMATCH',
    })

    const stream = stateWithActivity(null, 'stream')
    stream.activeActivity!.rewardPlan.modifierApples = 4
    expect(validateImportedGameState(stream, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_PLAN_MISMATCH',
    })

    stream.activeActivity!.rewardPlan.modifierApples = 0
    stream.activeActivity!.rewardPlan.friendId = 'signal-dog'
    expect(validateImportedGameState(stream, catalog)).toEqual({ ok: true })
    stream.activeActivity!.rewardPlan.giftItemId = 'travel-basic'
    expect(validateImportedGameState(stream, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_PLAN_MISMATCH',
    })

    const travel = stateWithActivity(null, 'travel')
    travel.activeActivity!.rewardPlan.friendId = 'signal-dog'
    travel.activeActivity!.rewardPlan.giftItemId = 'travel-basic'
    expect(validateImportedGameState(travel, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_PLAN_MISMATCH',
    })

    const reversed = stateWithActivity(null, 'stream')
    reversed.activeActivity!.endsAt = reversed.activeActivity!.startedAt - 1
    expect(validateImportedGameState(reversed, catalog)).toMatchObject({
      ok: false,
      code: 'ACTIVITY_TIME_INVALID',
    })
  })

  it('音乐兼容旧赠礼快照并接受新赠礼，旅行兼容旧快照且校验新赠礼', () => {
    const music = stateWithActivity(null, 'music')
    music.friends['signal-dog'] = {
      id: 'signal-dog',
      firstMetAt: 1,
      lastMetAt: 1,
      encounterCount: 1,
      totalGiftApples: 0,
    }
    music.activeActivity!.rewardPlan.friendId = 'signal-dog'
    music.activeActivity!.rewardPlan.modifierApples = 3
    expect(validateImportedGameState(music, catalog)).toEqual({ ok: true })

    music.activeActivity!.rewardPlan.modifierApples = 6
    expect(validateImportedGameState(music, catalog)).toEqual({ ok: true })

    music.activeActivity!.rewardPlan.modifierApples = 5
    expect(validateImportedGameState(music, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_PLAN_MISMATCH',
    })
    music.activeActivity!.rewardPlan.modifierApples = 6

    delete music.friends['signal-dog']
    expect(validateImportedGameState(music, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_PLAN_MISMATCH',
    })

    const legacyTravel = stateWithActivity({ id: 'postcard-1', category: 'postcard' }, 'travel')
    legacyTravel.activeActivity!.rewardPlan.friendId = 'signal-dog'
    legacyTravel.activeActivity!.rewardPlan.giftItemId = null
    expect(validateImportedGameState(legacyTravel, catalog)).toEqual({ ok: true })

    const previousTravel = stateWithActivity(null, 'travel')
    previousTravel.activeActivity!.rewardPlan.friendId = 'signal-dog'
    previousTravel.activeActivity!.rewardPlan.giftItemId = 'signal-headphones'
    expect(validateImportedGameState(previousTravel, catalog)).toEqual({ ok: true })

    const currentTravel = structuredClone(previousTravel)
    currentTravel.activeActivity!.rewardPlan.modifierApples = 1
    expect(validateImportedGameState(currentTravel, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_PLAN_MISMATCH',
    })

    currentTravel.activeActivity!.rewardPlan.modifierApples = 3
    expect(validateImportedGameState(currentTravel, catalog)).toEqual({ ok: true })

    currentTravel.activeActivity!.rewardPlan.modifierApples = 2
    expect(validateImportedGameState(currentTravel, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_PLAN_MISMATCH',
    })
  })
})
