import { createInitialGameState } from './createGameState'
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

  it('拒绝三条任务都已完成却没有自动刷新的停滞任务板', () => {
    const state = createInitialGameState({ now: 1_000, seed: 'stalled-task-board' })
    for (const task of state.tasks.active) task.progress = task.target

    expect(validateImportedGameState(state, catalog)).toMatchObject({
      ok: false,
      code: 'TASK_BOARD_STALLED',
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
    rest.activeActivity!.rewardPlan.baseApples = 1
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

  it('音乐只接受已认识朋友及其固定苹果，旅行仍兼容 legacy 双结果', () => {
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

    delete music.friends['signal-dog']
    expect(validateImportedGameState(music, catalog)).toMatchObject({
      ok: false,
      code: 'REWARD_PLAN_MISMATCH',
    })

    const legacyTravel = stateWithActivity({ id: 'postcard-1', category: 'postcard' }, 'travel')
    legacyTravel.activeActivity!.rewardPlan.friendId = 'signal-dog'
    legacyTravel.activeActivity!.rewardPlan.giftItemId = null
    expect(validateImportedGameState(legacyTravel, catalog)).toEqual({ ok: true })
  })
})
