import { describe, expect, it } from 'vitest'

import {
  MAX_ITEM_STACK,
  MAX_PLAYLISTS,
  MAX_POMODORO_DURATION_MS,
  MAX_TODOS,
  MIN_POMODORO_DURATION_MS,
} from './constants'
import { createInitialGameState } from './createGameState'
import { gameStateV4Schema, isStrictGameStateV4 } from './migrateGameStateV3'
import type {
  GameStateV4,
  MusicPlaylist,
  PomodoroSessionV4,
  RealityStateV4,
  TodoItem,
} from './types'
import { MAX_DATE_TIMESTAMP_MS } from './time'

const FIRST_BVID = 'BV1234567890'
const SECOND_BVID = 'BVabcdefghij'

function initialState(): GameStateV4 {
  const current = createInitialGameState({
    now: 1_000,
    seed: 'v4-schema',
    displayName: '测试玩家',
  })
  const tasks = {
    active: current.tasks.active,
    completedCount: current.tasks.completedCount,
    recentTemplateIds: current.tasks.recentTemplateIds,
    oneOffCompleted: current.tasks.oneOffCompleted,
  }
  const reality: RealityStateV4 = {
    nextStaySequence: current.reality.nextStaySequence,
    activeStay: current.reality.activeStay,
    pendingSettlement: current.reality.pendingSettlement,
    todos: current.reality.todos,
    pomodoro: { ...current.reality.pomodoro, session: null },
  }
  const { wardrobe: _wardrobe, ...withoutWardrobe } = current
  void _wardrobe
  return {
    ...withoutWardrobe,
    schemaVersion: 4,
    tasks,
    reality,
    musicPlayer: {
      ...current.musicPlayer,
      playlists: {},
      order: [],
      activePlaylistId: null,
      startAtSeconds: 0,
      autoplay: true,
    },
  }
}

function todo(id = 'todo-1'): TodoItem {
  return {
    id,
    title: '完成一件现实小事',
    createdAt: 2_000,
    updatedAt: 2_500,
    dueAt: 10_000,
    completedAt: null,
    notificationIssuedAt: null,
  }
}

function runningPomodoro(
  durationMs = MIN_POMODORO_DURATION_MS,
  todoId: string | null = 'todo-1',
): PomodoroSessionV4 {
  const startedAt = 3_000
  return {
    sessionId: 'pomodoro-1',
    status: 'running',
    startedAt,
    endsAt: startedAt + durationMs,
    durationMs,
    completedAt: null,
    notificationIssuedAt: null,
    todoId,
    postcardId: 'postcard-1',
  }
}

function completedPomodoro(): PomodoroSessionV4 {
  const session = runningPomodoro()
  return {
    ...session,
    status: 'completed',
    completedAt: session.endsAt,
    notificationIssuedAt: session.endsAt,
  }
}

function playlist(id: string, name: string, bvids: string[]): MusicPlaylist {
  return { id, name, bvids, createdAt: 2_000, updatedAt: 3_000 }
}

describe('GameState V4 严格 schema', () => {
  it('接受新游戏默认状态并拒绝顶层或嵌套派生字段', () => {
    const state = initialState()
    expect(gameStateV4Schema.parse(state)).toEqual(state)
    expect(isStrictGameStateV4(state)).toBe(true)
    expect(isStrictGameStateV4({ ...state, remainingMs: 0 })).toBe(false)

    state.reality.todos['todo-1'] = todo()
    state.reality.pomodoro.session = runningPomodoro()
    const sessionWithDerivedPhase = {
      ...state.reality.pomodoro.session,
      phase: 'running',
    }
    state.reality.pomodoro.session = sessionWithDerivedPhase as PomodoroSessionV4
    expect(isStrictGameStateV4(state)).toBe(false)
  })

  it('所有持久时间戳受 Date 可展示范围约束', () => {
    const boundary = initialState()
    boundary.profile.createdAt = MAX_DATE_TIMESTAMP_MS
    expect(isStrictGameStateV4(boundary)).toBe(true)

    const overflow = structuredClone(boundary)
    overflow.profile.createdAt = MAX_DATE_TIMESTAMP_MS + 1
    expect(isStrictGameStateV4(overflow)).toBe(false)
  })

  it('魔法数量只接受库存范围内的整数', () => {
    for (const quantity of [0, MAX_ITEM_STACK]) {
      const state = initialState()
      state.inventory['bottled-speed-magic'] = quantity
      state.inventory['bottled-vitality-magic'] = quantity
      expect(isStrictGameStateV4(state)).toBe(true)
    }

    for (const quantity of [-1, 0.5, MAX_ITEM_STACK + 1]) {
      const state = initialState()
      state.inventory['bottled-speed-magic'] = quantity
      expect(isStrictGameStateV4(state)).toBe(false)
    }
  })
})

describe('玩家效果与现实世界不变量', () => {
  it('活力结束日为 exclusive，当前伴随日到达边界即拒绝过期效果', () => {
    const active = initialState()
    active.profile.companionDays = 10
    active.player.effects.vitality = {
      activatedAt: 5_000,
      activatedOnCompanionDay: 10,
      expiresAfterCompanionDay: 17,
    }
    expect(isStrictGameStateV4(active)).toBe(true)

    const expired = structuredClone(active)
    expired.profile.companionDays = 17
    expect(isStrictGameStateV4(expired)).toBe(false)

    const reversed = structuredClone(active)
    reversed.player.effects.vitality!.expiresAfterCompanionDay = 10
    expect(isStrictGameStateV4(reversed)).toBe(false)
  })

  it('world 与 activeStay 必须一致，现实停留和待决结算不能并存', () => {
    const inReality = initialState()
    inReality.world = 'reality'
    inReality.reality.activeStay = { stayId: 'stay-1', enteredAt: 10_000 }
    expect(isStrictGameStateV4(inReality)).toBe(true)

    const worldWithoutStay = structuredClone(inReality)
    worldWithoutStay.reality.activeStay = null
    expect(isStrictGameStateV4(worldWithoutStay)).toBe(false)

    const gameWithStay = structuredClone(inReality)
    gameWithStay.world = 'game'
    expect(isStrictGameStateV4(gameWithStay)).toBe(false)

    const activeAndPending = structuredClone(inReality)
    activeAndPending.reality.pendingSettlement = {
      stayId: 'stay-0',
      enteredAt: 1_000,
      leftAt: 2_000,
      fullRewardApples: 1,
    }
    expect(isStrictGameStateV4(activeAndPending)).toBe(false)
  })

  it('游戏世界允许一个时间有序的待决结算，但拒绝倒置时间', () => {
    const pending = initialState()
    pending.reality.pendingSettlement = {
      stayId: 'stay-1',
      enteredAt: 10_000,
      leftAt: 20_000,
      fullRewardApples: 0,
    }
    expect(isStrictGameStateV4(pending)).toBe(true)

    const reversed = structuredClone(pending)
    reversed.reality.pendingSettlement!.leftAt = 9_999
    expect(isStrictGameStateV4(reversed)).toBe(false)
  })
})

describe('现实待办与苹果钟不变量', () => {
  it('接受键值一致的待办，并拒绝时间、标题、通知与数量异常', () => {
    const valid = initialState()
    valid.reality.todos['todo-1'] = todo()
    expect(isStrictGameStateV4(valid)).toBe(true)

    const keyMismatch = structuredClone(valid)
    keyMismatch.reality.todos['todo-1']!.id = 'todo-2'
    expect(isStrictGameStateV4(keyMismatch)).toBe(false)

    const untrimmed = structuredClone(valid)
    untrimmed.reality.todos['todo-1']!.title = ' 未去空白 '
    expect(isStrictGameStateV4(untrimmed)).toBe(false)

    const updatedBeforeCreation = structuredClone(valid)
    updatedBeforeCreation.reality.todos['todo-1']!.updatedAt = 1_999
    expect(isStrictGameStateV4(updatedBeforeCreation)).toBe(false)

    const completedBeforeCreation = structuredClone(valid)
    completedBeforeCreation.reality.todos['todo-1']!.completedAt = 1_999
    expect(isStrictGameStateV4(completedBeforeCreation)).toBe(false)

    const notifiedWithoutDueAt = structuredClone(valid)
    notifiedWithoutDueAt.reality.todos['todo-1']!.dueAt = null
    notifiedWithoutDueAt.reality.todos['todo-1']!.notificationIssuedAt = 4_000
    expect(isStrictGameStateV4(notifiedWithoutDueAt)).toBe(false)

    const tooMany = initialState()
    for (let index = 0; index <= MAX_TODOS; index += 1) {
      const id = `todo-${index}`
      tooMany.reality.todos[id] = todo(id)
    }
    expect(isStrictGameStateV4(tooMany)).toBe(false)
  })

  it('运行中苹果钟保存绝对时间快照并要求关联待办存在', () => {
    const state = initialState()
    state.reality.todos['todo-1'] = todo()
    state.reality.pomodoro.selectedPostcardId = 'postcard-1'
    state.reality.pomodoro.session = runningPomodoro()
    expect(isStrictGameStateV4(state)).toBe(true)

    const mismatchedEnd = structuredClone(state)
    mismatchedEnd.reality.pomodoro.session!.endsAt += 1
    expect(isStrictGameStateV4(mismatchedEnd)).toBe(false)

    const danglingTodo = structuredClone(state)
    danglingTodo.reality.pomodoro.session!.todoId = 'missing-todo'
    expect(isStrictGameStateV4(danglingTodo)).toBe(false)

    const runningButCompleted = structuredClone(state)
    runningButCompleted.reality.pomodoro.session!.completedAt =
      runningButCompleted.reality.pomodoro.session!.endsAt
    expect(isStrictGameStateV4(runningButCompleted)).toBe(false)
  })

  it('苹果钟时长严格限制在专用最小值和最大值', () => {
    for (const durationMs of [MIN_POMODORO_DURATION_MS, MAX_POMODORO_DURATION_MS]) {
      const state = initialState()
      state.reality.pomodoro.session = runningPomodoro(durationMs, null)
      expect(isStrictGameStateV4(state)).toBe(true)
    }

    for (const durationMs of [MIN_POMODORO_DURATION_MS - 1, MAX_POMODORO_DURATION_MS + 1]) {
      const state = initialState()
      state.reality.pomodoro.session = runningPomodoro(durationMs, null)
      expect(isStrictGameStateV4(state)).toBe(false)
    }
  })

  it('完成的苹果钟必须在 endsAt 后记录完成和通知，运行态不能提前携带这些字段', () => {
    const completed = initialState()
    completed.reality.todos['todo-1'] = todo()
    completed.reality.pomodoro.session = completedPomodoro()
    expect(isStrictGameStateV4(completed)).toBe(true)

    const missingNotification = structuredClone(completed)
    missingNotification.reality.pomodoro.session!.notificationIssuedAt = null
    expect(isStrictGameStateV4(missingNotification)).toBe(false)

    const completedTooEarly = structuredClone(completed)
    completedTooEarly.reality.pomodoro.session!.completedAt =
      completedTooEarly.reality.pomodoro.session!.endsAt - 1
    expect(isStrictGameStateV4(completedTooEarly)).toBe(false)
  })
})

describe('用户播放列表不变量', () => {
  function stateWithPlaylists(): GameStateV4 {
    const state = initialState()
    state.musicPlayer.playlists = {
      calm: playlist('calm', '安静听歌', [FIRST_BVID, SECOND_BVID]),
      empty: playlist('empty', '稍后再听', []),
    }
    state.musicPlayer.order = ['calm', 'empty']
    state.musicPlayer.activePlaylistId = 'calm'
    state.musicPlayer.currentBvid = SECOND_BVID
    state.musicPlayer.currentIndex = 1
    return state
  }

  it('接受完整无重复顺序和与索引一致的当前曲目', () => {
    expect(isStrictGameStateV4(stateWithPlaylists())).toBe(true)
  })

  it('未选择曲目时仍可持久保存下一次请求的起播位置', () => {
    const state = initialState()
    state.musicPlayer.startAtSeconds = 12
    expect(state.musicPlayer.currentBvid).toBeNull()
    expect(isStrictGameStateV4(state)).toBe(true)
  })

  it('拒绝重复或非法 BV、键值错配以及倒置更新时间', () => {
    const duplicateTrack = stateWithPlaylists()
    duplicateTrack.musicPlayer.playlists.calm!.bvids = [FIRST_BVID, FIRST_BVID]
    expect(isStrictGameStateV4(duplicateTrack)).toBe(false)

    const invalidBvid = stateWithPlaylists()
    invalidBvid.musicPlayer.playlists.calm!.bvids[0] = 'av123'
    expect(isStrictGameStateV4(invalidBvid)).toBe(false)

    const keyMismatch = stateWithPlaylists()
    keyMismatch.musicPlayer.playlists.calm!.id = 'other'
    expect(isStrictGameStateV4(keyMismatch)).toBe(false)

    const updatedBeforeCreation = stateWithPlaylists()
    updatedBeforeCreation.musicPlayer.playlists.calm!.updatedAt = 1_999
    expect(isStrictGameStateV4(updatedBeforeCreation)).toBe(false)
  })

  it('播放列表 order 必须完整且无重复', () => {
    for (const order of [['calm'], ['calm', 'calm'], ['calm', 'missing']]) {
      const state = stateWithPlaylists()
      state.musicPlayer.order = order
      expect(isStrictGameStateV4(state)).toBe(false)
    }

    const tooMany = initialState()
    for (let index = 0; index <= MAX_PLAYLISTS; index += 1) {
      const id = `playlist-${index}`
      tooMany.musicPlayer.playlists[id] = playlist(id, `列表 ${index}`, [])
      tooMany.musicPlayer.order.push(id)
    }
    expect(isStrictGameStateV4(tooMany)).toBe(false)
  })

  it('当前播放列表必须存在，非空列表的 BV 与索引必须一致', () => {
    const missingActive = stateWithPlaylists()
    missingActive.musicPlayer.activePlaylistId = 'missing'
    expect(isStrictGameStateV4(missingActive)).toBe(false)

    const mismatchedTrack = stateWithPlaylists()
    mismatchedTrack.musicPlayer.currentBvid = FIRST_BVID
    expect(isStrictGameStateV4(mismatchedTrack)).toBe(false)

    const emptyWithSelection = stateWithPlaylists()
    emptyWithSelection.musicPlayer.activePlaylistId = 'empty'
    emptyWithSelection.musicPlayer.currentBvid = FIRST_BVID
    emptyWithSelection.musicPlayer.currentIndex = 0
    expect(isStrictGameStateV4(emptyWithSelection)).toBe(false)
  })
})

describe('V4 纯 JSON 往返', () => {
  it('完整保留玩家、现实停留、待办、苹果钟与用户播放列表', () => {
    const state = initialState()
    state.inventory['bottled-speed-magic'] = 2
    state.inventory['bottled-vitality-magic'] = 3
    state.profile.companionDays = 4
    state.player.effects.vitality = {
      activatedAt: 2_000,
      activatedOnCompanionDay: 4,
      expiresAfterCompanionDay: 11,
    }
    state.world = 'reality'
    state.reality.nextStaySequence = 2
    state.reality.activeStay = { stayId: 'stay-1', enteredAt: 20_000 }
    state.reality.todos['todo-1'] = todo()
    state.reality.pomodoro.nextSessionSequence = 3
    state.reality.pomodoro.selectedPostcardId = 'postcard-1'
    state.reality.pomodoro.session = runningPomodoro()
    state.musicPlayer.playlists.calm = playlist('calm', '安静听歌', [FIRST_BVID])
    state.musicPlayer.order = ['calm']
    state.musicPlayer.activePlaylistId = 'calm'
    state.musicPlayer.currentBvid = FIRST_BVID
    state.musicPlayer.currentIndex = 0
    state.musicPlayer.loopMode = 'single'
    state.musicPlayer.startAtSeconds = 42
    state.musicPlayer.autoplay = true

    const roundTripped = gameStateV4Schema.parse(JSON.parse(JSON.stringify(state)))
    expect(roundTripped).toEqual(state)
  })
})
