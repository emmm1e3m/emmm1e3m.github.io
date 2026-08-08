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
        friendEventId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId:
        kind === 'travel'
          ? 'travel-basic'
          : kind === 'stream'
            ? 'signal-headphones'
            : 'trend-toolbox',
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
})
