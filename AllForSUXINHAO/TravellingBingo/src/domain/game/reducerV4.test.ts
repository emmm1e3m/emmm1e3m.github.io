import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { BASE_ACTIVITY_DURATION_MS, ITEM_PRICES, PIANO_NOTE_IDS } from './constants'
import { reduceGame } from './reducer'
import { STARTER_WARDROBE_ASSET_IDS, WARDROBE_ASSET_IDS } from './wardrobe'
import type {
  ActivityKind,
  CollectionCatalog,
  GameState,
  GameTransition,
  LegacyItemId,
} from './types'

const catalog: CollectionCatalog = {
  postcard: ['postcard-1'],
  'million-shot': ['million-1'],
  'site-first': ['first-1'],
  siteFirstChronology: ['first-1'],
}

function successful(transition: GameTransition): Extract<GameTransition, { ok: true }> {
  if (!transition.ok) throw new Error(transition.error.message)
  return transition
}

function willing(state: GameState): GameState {
  return {
    ...state,
    pet: {
      ...state.pet,
      preferences: { travel: true, computer: true, music: true },
      tired: false,
    },
  }
}

function withActivitySupply(
  state: GameState,
  kind: ActivityKind,
): { state: GameState; supplyId?: LegacyItemId } {
  const supplyId =
    kind === 'travel'
      ? 'travel-basic'
      : kind === 'stream'
        ? 'signal-headphones'
        : kind === 'trend'
          ? 'trend-toolbox'
          : undefined
  return supplyId === undefined
    ? { state }
    : {
        state: {
          ...state,
          inventory: { ...state.inventory, [supplyId]: 1 },
        },
        supplyId,
      }
}

describe('V4 瓶装速度魔法', () => {
  it('单价为 2 个苹果，普通活动默认读条为 10 秒', () => {
    expect(ITEM_PRICES['bottled-speed-magic']).toBe(2)
    expect(BASE_ACTIVITY_DURATION_MS).toBe(10_000)
  })

  it.each<ActivityKind>(['travel', 'stream', 'trend', 'music', 'rest'])(
    '%s 活动可在 running 阶段消耗一瓶并立即 ready',
    (kind) => {
      const supplied = withActivitySupply(
        {
          ...willing(createInitialGameState({ now: 0, seed: `speed-${kind}` })),
          inventory: {
            ...willing(createInitialGameState({ now: 0, seed: `speed-${kind}` })).inventory,
            'bottled-speed-magic': 1,
          },
        },
        kind,
      )
      const started = successful(
        reduceGame(
          supplied.state,
          { type: 'activity/start', kind, now: 1_000, supplyId: supplied.supplyId },
          catalog,
        ),
      ).state
      const activityBefore = structuredClone(started.activeActivity!)
      expect(activityBefore.endsAt).toBe(1_000 + BASE_ACTIVITY_DURATION_MS)

      const accelerated = successful(
        reduceGame(
          started,
          { type: 'magic/speed-use', runId: activityBefore.runId, now: 2_000 },
          catalog,
        ),
      )

      expect(accelerated.state.inventory['bottled-speed-magic']).toBe(0)
      expect(accelerated.state.activeActivity).toEqual({ ...activityBefore, endsAt: 2_000 })
      expect(accelerated.effects).toEqual([
        {
          type: 'activity-accelerated',
          runId: activityBefore.runId,
          usedAt: 2_000,
          previousEndsAt: activityBefore.endsAt,
          endsAt: 2_000,
        },
      ])
    },
  )

  it('ready、错误 runId 与缺货均失败且不改变状态', () => {
    const initial = {
      ...willing(createInitialGameState({ now: 0, seed: 'speed-fail' })),
      inventory: {
        ...createInitialGameState({ now: 0, seed: 'speed-fail' }).inventory,
        'bottled-speed-magic': 1,
      },
    }
    const started = successful(
      reduceGame(initial, { type: 'activity/start', kind: 'music', now: 100 }, catalog),
    ).state
    const wrong = reduceGame(
      started,
      { type: 'magic/speed-use', runId: 'stale', now: 101 },
      catalog,
    )
    expect(wrong.ok).toBe(false)
    expect(wrong.state).toBe(started)

    const accelerated = successful(
      reduceGame(
        started,
        { type: 'magic/speed-use', runId: started.activeActivity!.runId, now: 101 },
        catalog,
      ),
    ).state
    const again = reduceGame(
      accelerated,
      { type: 'magic/speed-use', runId: accelerated.activeActivity!.runId, now: 101 },
      catalog,
    )
    expect(again).toMatchObject({ ok: false, error: { code: 'MAGIC_NOT_NEEDED' } })
    expect(again.state).toBe(accelerated)
  })

  it('加速后取消不返任何资源且不增加伴随日', () => {
    const initial = {
      ...willing(createInitialGameState({ now: 0, seed: 'speed-cancel' })),
      inventory: {
        ...createInitialGameState({ now: 0, seed: 'speed-cancel' }).inventory,
        'bottled-speed-magic': 1,
      },
    }
    const started = successful(
      reduceGame(initial, { type: 'activity/start', kind: 'travel', now: 100 }, catalog),
    ).state
    const accelerated = successful(
      reduceGame(
        started,
        { type: 'magic/speed-use', runId: started.activeActivity!.runId, now: 101 },
        catalog,
      ),
    ).state
    const cancelled = successful(
      reduceGame(
        accelerated,
        { type: 'activity/cancel', runId: accelerated.activeActivity!.runId, now: 101 },
        catalog,
      ),
    ).state

    expect(cancelled.profile.companionDays).toBe(0)
    expect(cancelled.inventory['travel-basic']).toBe(0)
    expect(cancelled.inventory['bottled-speed-magic']).toBe(0)
  })
})

describe('V4 四八度电子琴契约', () => {
  it('只从领域常量暴露 C3–B6 共 48 个互不重复琴键', () => {
    expect(PIANO_NOTE_IDS).toHaveLength(48)
    expect(PIANO_NOTE_IDS[0]).toBe('C3')
    expect(PIANO_NOTE_IDS[12]).toBe('C4')
    expect(PIANO_NOTE_IDS[24]).toBe('C5')
    expect(PIANO_NOTE_IDS[36]).toBe('C6')
    expect(PIANO_NOTE_IDS.at(-1)).toBe('B6')
    expect(new Set(PIANO_NOTE_IDS).size).toBe(48)
  })
})

describe('V4 瓶装活力魔法', () => {
  it('单价为 7 个苹果', () => {
    expect(ITEM_PRICES['bottled-vitality-magic']).toBe(7)
  })

  it('立即让全部意愿为真，并在第七次成功领取后精确过期', () => {
    let state: GameState = {
      ...createInitialGameState({ now: 0, seed: 'vitality-seven' }),
      inventory: {
        ...createInitialGameState({ now: 0, seed: 'vitality-seven' }).inventory,
        'bottled-vitality-magic': 1,
      },
      pet: {
        ...createInitialGameState({ now: 0, seed: 'vitality-seven' }).pet,
        preferences: { travel: false, computer: true, music: true },
        tired: false,
      },
      gameBalance: {
        ...createInitialGameState({ now: 0, seed: 'vitality-seven' }).gameBalance,
        activityDurationMs: 1,
      },
    }
    state = successful(reduceGame(state, { type: 'magic/vitality-use', now: 10 }, catalog)).state
    expect(state.pet.preferences).toEqual({ travel: true, computer: true, music: true })
    expect(state.player.effects.vitality?.expiresAfterCompanionDay).toBe(7)
    const preferenceSequence = state.random.sequences.preferences

    for (let day = 1; day <= 7; day += 1) {
      const started = successful(
        reduceGame(state, { type: 'activity/start', kind: 'rest', now: day * 10 + 10 }, catalog),
      ).state
      const claimed = successful(
        reduceGame(
          started,
          {
            type: 'activity/claim',
            runId: started.activeActivity!.runId,
            now: started.activeActivity!.endsAt,
          },
          catalog,
        ),
      )
      state = claimed.state
      expect(state.profile.companionDays).toBe(day)
      if (day < 7) {
        expect(state.player.effects.vitality).not.toBeNull()
        expect(state.pet.preferences).toEqual({ travel: true, computer: true, music: true })
        expect(state.random.sequences.preferences).toBe(preferenceSequence)
      } else {
        expect(state.player.effects.vitality).toBeNull()
        expect(state.random.sequences.preferences).toBe(preferenceSequence + 1)
        expect(claimed.effects).toContainEqual({
          type: 'player-effect-expired',
          effect: 'vitality',
          expiredAtCompanionDay: 7,
        })
      }
    }
  })

  it('没有被拒绝的兴趣、缺货与重复使用都不会误扣', () => {
    const allWilling = {
      ...willing(createInitialGameState({ now: 0, seed: 'vitality-fail' })),
      inventory: {
        ...createInitialGameState({ now: 0, seed: 'vitality-fail' }).inventory,
        'bottled-vitality-magic': 1,
      },
    }
    const unnecessary = reduceGame(allWilling, { type: 'magic/vitality-use', now: 1 }, catalog)
    expect(unnecessary).toMatchObject({ ok: false, error: { code: 'MAGIC_NOT_NEEDED' } })
    expect(unnecessary.state).toBe(allWilling)

    const reluctant = {
      ...allWilling,
      pet: {
        ...allWilling.pet,
        preferences: { ...allWilling.pet.preferences, travel: false },
      },
    }
    const used = successful(
      reduceGame(reluctant, { type: 'magic/vitality-use', now: 2 }, catalog),
    ).state
    const repeated = reduceGame(used, { type: 'magic/vitality-use', now: 3 }, catalog)
    expect(repeated).toMatchObject({ ok: false, error: { code: 'EFFECT_ALREADY_ACTIVE' } })
    expect(repeated.state).toBe(used)
  })

  it('取消活动不推进活力窗口，也不返还已经消耗的魔法', () => {
    const base = createInitialGameState({ now: 0, seed: 'vitality-cancel' })
    const reluctant: GameState = {
      ...base,
      inventory: { ...base.inventory, 'bottled-vitality-magic': 1 },
      pet: {
        ...base.pet,
        preferences: { ...base.pet.preferences, music: false },
      },
    }
    const used = successful(
      reduceGame(reluctant, { type: 'magic/vitality-use', now: 1 }, catalog),
    ).state
    const started = successful(
      reduceGame(used, { type: 'activity/start', kind: 'music', now: 2 }, catalog),
    ).state
    const cancelled = successful(
      reduceGame(
        started,
        { type: 'activity/cancel', runId: started.activeActivity!.runId, now: 3 },
        catalog,
      ),
    ).state

    expect(cancelled.profile.companionDays).toBe(0)
    expect(cancelled.player.effects.vitality).toEqual(used.player.effects.vitality)
    expect(cancelled.inventory['bottled-vitality-magic']).toBe(0)
  })
})

describe('V4 调试收集与用户播放列表', () => {
  it.each([
    {
      name: '移除最后一份对应收藏',
      action: {
        type: 'debug/collection-set' as const,
        collectionId: 'first-1',
        owned: false,
        now: 200,
      },
    },
    {
      name: '清空全部收集',
      action: { type: 'debug/clear-all' as const, now: 200 },
    },
  ])('$name 后立即替换失去先决条件的未完成任务', ({ action }) => {
    const state = createInitialGameState({ now: 0, seed: 'debug-task-reconcile', debug: true })
    state.collections['first-1'] = {
      id: 'first-1',
      firstObtainedAt: 10,
      duplicateCount: 0,
    }
    const unavailableFirst = {
      instanceId: 'replace-debug-first',
      taskId: 'remember-first' as const,
      assignedAt: 10,
      progress: 0,
      target: 1,
      rewardApples: 2,
      seenKeys: [],
    }
    const completedBackpack = {
      instanceId: 'keep-debug-backpack',
      taskId: 'open-backpack' as const,
      assignedAt: 10,
      progress: 1,
      target: 1,
      rewardApples: 1,
      seenKeys: ['opened'],
    }
    const partialRoom = {
      instanceId: 'keep-debug-room',
      taskId: 'room-stroll' as const,
      assignedAt: 10,
      progress: 1,
      target: 2,
      rewardApples: 2,
      seenKeys: ['bed'],
    }
    state.tasks.active = [unavailableFirst, completedBackpack, partialRoom]
    const originalSequence = state.random.sequences.tasks

    const reconciled = successful(reduceGame(state, action, catalog)).state

    expect(reconciled.collections).toEqual({})
    expect(reconciled.tasks.active[0]).not.toBe(unavailableFirst)
    expect(reconciled.tasks.active[0].taskId).not.toBe('remember-first')
    expect(reconciled.tasks.active[1]).toBe(completedBackpack)
    expect(reconciled.tasks.active[2]).toBe(partialRoom)
    expect(reconciled.random.sequences.tasks).toBe(originalSequence + 1)
  })

  it('清空收集时保留已经完成的收藏任务快照', () => {
    const state = createInitialGameState({ now: 0, seed: 'debug-keep-completed', debug: true })
    state.collections['first-1'] = {
      id: 'first-1',
      firstObtainedAt: 10,
      duplicateCount: 0,
    }
    const completedFirst = {
      instanceId: 'keep-completed-first',
      taskId: 'remember-first' as const,
      assignedAt: 10,
      progress: 1,
      target: 1,
      rewardApples: 2,
      seenKeys: ['first-1'],
    }
    state.tasks.active = [
      completedFirst,
      {
        instanceId: 'keep-incomplete-room',
        taskId: 'room-stroll',
        assignedAt: 10,
        progress: 0,
        target: 2,
        rewardApples: 2,
        seenKeys: [],
      },
      {
        instanceId: 'keep-incomplete-backpack',
        taskId: 'open-backpack',
        assignedAt: 10,
        progress: 0,
        target: 1,
        rewardApples: 1,
        seenKeys: [],
      },
    ]
    const originalSequence = state.random.sequences.tasks

    const cleared = successful(
      reduceGame(state, { type: 'debug/clear-all', now: 200 }, catalog),
    ).state

    expect(cleared.tasks.active[0]).toBe(completedFirst)
    expect(cleared.random.sequences.tasks).toBe(originalSequence)
  })

  it('一键全收集包含好友和全部服装，清空时恢复初始衣服并删除造型', () => {
    const debug = {
      ...createInitialGameState({ now: 0, seed: 'debug-all', debug: true }),
      friends: {
        'signal-dog': {
          id: 'signal-dog' as const,
          firstMetAt: 1,
          lastMetAt: 2,
          encounterCount: 3,
          totalGiftApples: 4,
        },
      },
      reality: {
        ...createInitialGameState({ now: 0, seed: 'debug-all', debug: true }).reality,
        nextStaySequence: 4,
      },
    }
    const collected = successful(
      reduceGame(debug, { type: 'debug/collect-all', now: 100 }, catalog),
    ).state
    expect(Object.keys(collected.collections)).toHaveLength(3)
    expect(Object.keys(collected.friends)).toHaveLength(5)
    expect(collected.friends['signal-dog']).toEqual(debug.friends['signal-dog'])
    expect(collected.wardrobe.ownedAssetIds).toEqual([...WARDROBE_ASSET_IDS])

    const withLook = successful(
      reduceGame(
        collected,
        {
          type: 'wardrobe/look-create',
          targetId: 'bingo',
          name: '调试造型',
          elements: [],
          now: 150,
        },
        catalog,
      ),
    ).state

    const cleared = successful(
      reduceGame(withLook, { type: 'debug/clear-all', now: 200 }, catalog),
    ).state
    expect(cleared.collections).toEqual({})
    expect(cleared.friends).toEqual({})
    expect(cleared.wardrobe.ownedAssetIds).toEqual([...STARTER_WARDROBE_ASSET_IDS])
    expect(cleared.wardrobe.looks).toEqual({})
    expect(cleared.reality.nextStaySequence).toBe(4)
  })

  it('活动进行中清空收集会提示先结束当前活动', () => {
    const debug = willing(createInitialGameState({ now: 0, seed: 'debug-clear-busy', debug: true }))
    const started = successful(
      reduceGame(debug, { type: 'activity/start', kind: 'music', now: 1 }, catalog),
    ).state

    expect(reduceGame(started, { type: 'debug/clear-all', now: 2 }, catalog)).toMatchObject({
      ok: false,
      error: {
        code: 'PET_BUSY',
        message: '请先完成或取消当前活动，再清空收集',
      },
    })
  })

  it('播放器只持久化当前曲目与循环模式，并校验曲目索引', () => {
    const initial = createInitialGameState({ now: 0, seed: 'player-state' })
    const track = successful(
      reduceGame(initial, { type: 'music/track-select', bvid: 'BV1yy411c7mE', index: 1 }, catalog),
    ).state
    expect(track.musicPlayer).toEqual({
      currentBvid: 'BV1yy411c7mE',
      currentIndex: 1,
      loopMode: 'list',
    })
    expect(track.musicPlayer).not.toHaveProperty('startAtSeconds')
    expect(track.musicPlayer).not.toHaveProperty('autoplay')
    expect(track.musicPlayer).not.toHaveProperty('playlists')

    const invalid = reduceGame(
      track,
      { type: 'music/track-select', bvid: 'BV1xx411c7mD', index: -1 },
      catalog,
    )
    expect(invalid.ok).toBe(false)
    expect(invalid.state).toBe(track)

    const single = successful(
      reduceGame(track, { type: 'music/loop-set', loopMode: 'single' }, catalog),
    ).state
    expect(single.musicPlayer.loopMode).toBe('single')
  })
})
