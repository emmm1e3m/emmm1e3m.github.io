import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { PIANO_NOTE_IDS } from './constants'
import { reduceGame } from './reducer'
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
      expect(activityBefore.endsAt).toBe(73_000)

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

describe('V4 三八度电子琴契约', () => {
  it('固定暴露 C4–B6 共三排 36 个互不重复琴键', () => {
    expect(PIANO_NOTE_IDS).toHaveLength(36)
    expect(PIANO_NOTE_IDS[0]).toBe('C4')
    expect(PIANO_NOTE_IDS[12]).toBe('C5')
    expect(PIANO_NOTE_IDS[24]).toBe('C6')
    expect(PIANO_NOTE_IDS.at(-1)).toBe('B6')
    expect(new Set(PIANO_NOTE_IDS).size).toBe(36)
  })
})

describe('V4 瓶装活力魔法', () => {
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
  it('一键全收集包含好友，一键撤销同时清空且保持其他长期状态', () => {
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

    const cleared = successful(
      reduceGame(collected, { type: 'debug/clear-all', now: 200 }, catalog),
    ).state
    expect(cleared.collections).toEqual({})
    expect(cleared.friends).toEqual({})
    expect(cleared.reality.nextStaySequence).toBe(4)
  })

  it('播放列表动作校验 BV、顺序与当前曲目，并在删除当前列表后回到内置列表', () => {
    const initial = createInitialGameState({ now: 0, seed: 'playlist' })
    const created = successful(
      reduceGame(
        initial,
        {
          type: 'music/playlist-create',
          playlistId: 'my-list',
          name: '我的歌单',
          bvids: ['BV1xx411c7mD', 'BV1yy411c7mE'],
          now: 1,
        },
        catalog,
      ),
    ).state
    const configured = successful(
      reduceGame(created, { type: 'music/seek-set', startAtSeconds: 12 }, catalog),
    ).state
    const selected = successful(
      reduceGame(configured, { type: 'music/playlist-select', playlistId: 'my-list' }, catalog),
    ).state
    const track = successful(
      reduceGame(selected, { type: 'music/track-select', bvid: 'BV1yy411c7mE', index: 1 }, catalog),
    ).state
    expect(track.musicPlayer).toMatchObject({
      activePlaylistId: 'my-list',
      currentBvid: 'BV1yy411c7mE',
      currentIndex: 1,
      startAtSeconds: 12,
    })

    const invalid = reduceGame(
      track,
      { type: 'music/track-select', bvid: 'BV1xx411c7mD', index: 1 },
      catalog,
    )
    expect(invalid.ok).toBe(false)
    expect(invalid.state).toBe(track)

    const deleted = successful(
      reduceGame(track, { type: 'music/playlist-delete', playlistId: 'my-list', now: 2 }, catalog),
    ).state
    expect(deleted.musicPlayer).toMatchObject({
      activePlaylistId: null,
      currentBvid: null,
      currentIndex: 0,
      startAtSeconds: 12,
    })

    const autoplay = successful(
      reduceGame(deleted, { type: 'music/autoplay-set', autoplay: false }, catalog),
    ).state
    expect(autoplay.musicPlayer.autoplay).toBe(true)
  })
})
