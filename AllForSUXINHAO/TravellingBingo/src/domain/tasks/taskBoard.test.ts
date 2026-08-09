import { describe, expect, it } from 'vitest'

import { MAX_APPLES } from '../game/constants'
import { createInitialGameState } from '../game/createGameState'
import { gameStateV4Schema } from '../game/migrateGameStateV3'
import { reduceGame } from '../game/reducer'
import type {
  CollectionCatalog,
  GameState,
  GameTransition,
  TaskId,
  TaskInstance,
} from '../game/types'
import {
  generateTaskBoard,
  getTaskPresentation,
  getTaskProgressLabel,
  hasRetiredTask,
  isTaskCompleted,
  replaceRetiredTaskBoard,
  TASK_LIBRARY,
  validateTaskInstanceReachability,
} from './taskBoard'

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

function task(taskId: TaskId, progress = 0, suffix: string = taskId): TaskInstance {
  const template = TASK_LIBRARY[taskId]
  return {
    instanceId: `instance-${suffix}`,
    taskId,
    assignedAt: 1,
    progress,
    target: template.target,
    rewardApples: template.rewardApples,
    seenKeys: progress > 0 ? Array.from({ length: progress }, (_, index) => `seen-${index}`) : [],
  }
}

function withTasks(
  state: GameState,
  active: [TaskInstance, TaskInstance, TaskInstance],
): GameState {
  return {
    ...state,
    tasks: { ...state.tasks, active },
  }
}

describe('三任务自动刷新板', () => {
  it('每板恰好三条，模板与触发组均不重复', () => {
    for (let sequence = 0; sequence < 40; sequence += 1) {
      const generated = generateTaskBoard({ seed: 'board-shape', sequence, now: 100 })
      const ids = generated.board.active.map((entry) => entry.taskId)
      const groups = ids.map((id) => TASK_LIBRARY[id].triggerGroup)

      expect(new Set(ids).size).toBe(3)
      expect(new Set(groups).size).toBe(3)
      expect(ids).not.toContain('greet-bingo')
      expect(generated.nextSequence).toBe(sequence + 1)
    }
  })

  it('任务序列、完成总数与苹果收入到安全上限后保持可导出', () => {
    const generated = generateTaskBoard({
      seed: 'task-counter-cap',
      sequence: Number.MAX_SAFE_INTEGER,
      now: 100,
    })
    expect(generated.nextSequence).toBe(Number.MAX_SAFE_INTEGER)

    const base = createInitialGameState({ now: 0, seed: 'task-counter-cap' })
    const state = withTasks(
      {
        ...base,
        tasks: { ...base.tasks, completedCount: Number.MAX_SAFE_INTEGER },
        statistics: { ...base.statistics, applesEarned: Number.MAX_SAFE_INTEGER },
        random: {
          ...base.random,
          sequences: { ...base.random.sequences, tasks: Number.MAX_SAFE_INTEGER },
        },
      },
      [task('open-backpack', 1), task('wardrobe-choice', 1), task('stage-test')],
    )
    const completed = successful(
      reduceGame(
        state,
        { type: 'task/event', event: { type: 'stage-test-opened' }, now: 1_000 },
        catalog,
      ),
    )

    expect(completed.state.tasks.completedCount).toBe(Number.MAX_SAFE_INTEGER)
    expect(completed.state.statistics.applesEarned).toBe(Number.MAX_SAFE_INTEGER)
    expect(completed.state.random.sequences.tasks).toBe(Number.MAX_SAFE_INTEGER)
    expect(completed.effects[0]).toMatchObject({ completed: true, boardRefreshed: true })
    expect(gameStateV4Schema.safeParse(completed.state).success).toBe(true)
  })

  it('最近六项会优先避开，直到候选触发组不足', () => {
    const first = generateTaskBoard({ seed: 'recent-six', sequence: 0, now: 100 })
    const second = generateTaskBoard({
      seed: 'recent-six',
      sequence: 1,
      now: 200,
      recentTemplateIds: first.board.recentTemplateIds,
    })

    const firstIds = new Set(first.board.active.map((entry) => entry.taskId))
    const freshCount = second.board.active.filter((entry) => !firstIds.has(entry.taskId)).length
    expect(freshCount).toBeGreaterThanOrEqual(2)
    expect(second.board.recentTemplateIds).toHaveLength(6)
  })

  it('退役任务仅保留旧模板兼容，并使用 tasks 序列确定性替换旧槽位', () => {
    const base = createInitialGameState({ now: 0, seed: 'retired-board' })
    const retainedRoomTask = {
      ...task('room-stroll', 1),
      seenKeys: ['bed'],
    }
    const retainedMusicTask = task('piano-time')
    const legacyBoard = {
      ...base.tasks,
      active: [task('greet-bingo'), retainedRoomTask, retainedMusicTask] as [
        TaskInstance,
        TaskInstance,
        TaskInstance,
      ],
      recentTemplateIds: ['greet-bingo', 'open-backpack'] as TaskId[],
    }
    const before = structuredClone(legacyBoard)
    const sequences = { reward: 19, tasks: 7, preferences: 3 }
    const input = {
      board: legacyBoard,
      seed: 'retired-board',
      sequence: sequences.tasks,
      now: 5_000,
      catalog,
      collections: { 'postcard-1': {} },
    }

    const first = replaceRetiredTaskBoard(input)
    const repeated = replaceRetiredTaskBoard(input)
    const nextSequences = { ...sequences, tasks: first.nextSequence }

    expect(hasRetiredTask(legacyBoard)).toBe(true)
    expect(first).toEqual(repeated)
    expect(legacyBoard).toEqual(before)
    expect(first.nextSequence).toBe(sequences.tasks + 1)
    expect(nextSequences).toEqual({ reward: 19, tasks: 8, preferences: 3 })
    expect(hasRetiredTask(first.board)).toBe(false)
    expect(first.board.active[0]).toMatchObject({
      assignedAt: 5_000,
      progress: 0,
      seenKeys: [],
    })
    expect(first.board.active[1]).toBe(retainedRoomTask)
    expect(first.board.active[2]).toBe(retainedMusicTask)
    expect(
      new Set(first.board.active.map((entry) => TASK_LIBRARY[entry.taskId].triggerGroup)).size,
    ).toBe(3)

    const unchanged = replaceRetiredTaskBoard({
      ...input,
      board: first.board,
      sequence: first.nextSequence,
    })
    expect(unchanged.board).toBe(first.board)
    expect(unchanged.nextSequence).toBe(first.nextSequence)
  })

  it('退役任务在 tasks 序列上限仍可确定性替换且序列饱和', () => {
    const base = createInitialGameState({ now: 0, seed: 'retired-cap' })
    const board = {
      ...base.tasks,
      active: [task('greet-bingo'), task('room-stroll'), task('piano-time')] as [
        TaskInstance,
        TaskInstance,
        TaskInstance,
      ],
    }
    const replaced = replaceRetiredTaskBoard({
      board,
      seed: 'retired-cap',
      sequence: Number.MAX_SAFE_INTEGER,
      now: 100,
      catalog,
    })

    expect(hasRetiredTask(replaced.board)).toBe(false)
    expect(replaced.nextSequence).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('保留可达的历史目标快照，并拒绝已经耗尽唯一 key 的任务', () => {
    const historicalRoom: TaskInstance = {
      ...task('room-stroll'),
      target: 3,
      rewardApples: 2,
      progress: 1,
      seenKeys: ['bed'],
    }
    expect(validateTaskInstanceReachability(historicalRoom, catalog)).toEqual({
      ok: true,
    })

    for (const taskId of [
      'open-backpack',
      'wardrobe-choice',
      'open-memories',
      'stage-test',
    ] as const) {
      const exhausted: TaskInstance = {
        ...task(taskId),
        target: 2,
        progress: 1,
        seenKeys: [
          taskId === 'wardrobe-choice'
            ? 'wardrobe'
            : taskId === 'open-memories'
              ? 'wall'
              : 'opened',
        ],
      }
      expect(validateTaskInstanceReachability(exhausted, catalog)).toMatchObject({ ok: false })
    }
  })

  it('按房间、琴键、视频和收藏命名空间验证历史 seenKeys 与可达上限', () => {
    const invalidTasks: TaskInstance[] = [
      { ...task('room-stroll'), target: 10 },
      { ...task('room-stroll', 1), seenKeys: ['not-a-room'] },
      { ...task('piano-time'), target: 37 },
      { ...task('piano-time', 1), seenKeys: ['piano:C3'] },
      { ...task('record-time', 1), seenKeys: ['video:not-a-bvid'] },
      { ...task('two-melodies', 1), seenKeys: ['audio:C4'] },
      { ...task('revisit-two', 1), seenKeys: ['removed-collection'] },
      { ...task('remember-postcard', 1), seenKeys: ['million-1'] },
      { ...task('remember-postcard'), target: 2 },
    ]

    for (const instance of invalidTasks) {
      expect(validateTaskInstanceReachability(instance, catalog)).toMatchObject({ ok: false })
    }

    expect(
      validateTaskInstanceReachability(
        { ...task('record-time', 1), seenKeys: ['video:BV1xx411c7mD'] },
        catalog,
      ),
    ).toEqual({ ok: true })
    expect(
      validateTaskInstanceReachability(
        { ...task('two-melodies', 2), seenKeys: ['piano:C4', 'video:BV1xx411c7mD'] },
        catalog,
      ),
    ).toEqual({ ok: true })

    for (const legacy of [
      { ...task('piano-time', 1), seenKeys: ['piano'] },
      { ...task('record-time', 1), seenKeys: ['record-player'] },
      { ...task('two-melodies', 2), seenKeys: ['piano', 'record-player'] },
    ]) {
      expect(validateTaskInstanceReachability(legacy, catalog)).toEqual({
        ok: true,
      })
    }
  })

  it('只有一份收藏时不会抽到需要查看两份不同收藏的任务', () => {
    for (let sequence = 0; sequence < 40; sequence += 1) {
      const generated = generateTaskBoard({
        seed: 'only-completable',
        sequence,
        now: 100,
        catalog,
        collections: { 'postcard-1': {} },
      })
      expect(generated.board.active.some((entry) => entry.taskId === 'revisit-two')).toBe(false)
    }
  })

  it('同一事件最多推进一条任务，且需要不同对象的任务不会重复计数', () => {
    const initial = withTasks(createInitialGameState({ now: 0, seed: 'one-event' }), [
      task('two-melodies'),
      task('piano-time'),
      task('wardrobe-choice'),
    ])
    const once = successful(
      reduceGame(
        initial,
        { type: 'task/event', event: { type: 'piano-note-played', noteId: 'C4' }, now: 100 },
        catalog,
      ),
    ).state

    expect(once.tasks.active[0].progress).toBe(1)
    expect(once.tasks.active[1].progress).toBe(0)

    const repeated = successful(
      reduceGame(
        once,
        { type: 'task/event', event: { type: 'piano-note-played', noteId: 'C4' }, now: 101 },
        catalog,
      ),
    ).state
    expect(repeated.tasks.active[0].progress).toBe(1)
    // 第一条无法再吃同一个 key 后，同一事件仍只允许推进后面的第一条匹配任务。
    expect(repeated.tasks.active[1].progress).toBe(1)
  })

  it('音乐任务只认真实琴键或用户主动打开的播放器，不把走到设施当成观看', () => {
    const pianoState = withTasks(createInitialGameState({ now: 0, seed: 'music-events' }), [
      task('piano-time'),
      task('wardrobe-choice'),
      task('greet-bingo'),
    ])
    const merelyVisited = successful(
      reduceGame(
        pianoState,
        { type: 'task/event', event: { type: 'room-visited', area: 'piano' }, now: 100 },
        catalog,
      ),
    ).state
    expect(merelyVisited.tasks.active[0].progress).toBe(0)
    const notePlayed = successful(
      reduceGame(
        merelyVisited,
        { type: 'task/event', event: { type: 'piano-note-played', noteId: 'C4' }, now: 101 },
        catalog,
      ),
    ).state
    expect(notePlayed.tasks.active[0].progress).toBe(1)

    const recordState = withTasks(createInitialGameState({ now: 0, seed: 'record-events' }), [
      task('record-time'),
      task('wardrobe-choice'),
      task('greet-bingo'),
    ])
    const opened = successful(
      reduceGame(
        recordState,
        {
          type: 'task/event',
          event: { type: 'record-player-opened', bvid: 'BV-demo' },
          now: 102,
        },
        catalog,
      ),
    ).state
    expect(opened.tasks.active[0].progress).toBe(1)
    expect(opened.tasks.active[0].seenKeys).toEqual(['video:BV-demo'])
  })

  it('唱片与收藏入口中的同一 BV 统一去重，只计一次', () => {
    let state = withTasks(createInitialGameState({ now: 0, seed: 'two-sounds' }), [
      task('two-melodies'),
      task('wardrobe-choice'),
      task('greet-bingo'),
    ])
    for (const [index, event] of [
      { type: 'record-player-opened', bvid: 'BV-same' } as const,
      {
        type: 'collection-player-opened',
        collectionId: 'million-1',
        bvid: 'BV-same',
      } as const,
    ].entries()) {
      state = successful(
        reduceGame(state, { type: 'task/event', event, now: 200 + index }, catalog),
      ).state
    }

    expect(state.tasks.active[0].progress).toBe(1)
    expect(state.tasks.active[0].seenKeys).toEqual(['video:BV-same'])
  })

  it('不同 BV 可以分别计入视频任务', () => {
    let state = withTasks(createInitialGameState({ now: 0, seed: 'two-videos' }), [
      task('two-melodies'),
      task('wardrobe-choice'),
      task('greet-bingo'),
    ])
    for (const [index, event] of [
      { type: 'record-player-opened', bvid: 'BV-one' } as const,
      {
        type: 'collection-player-opened',
        collectionId: 'million-1',
        bvid: 'BV-two',
      } as const,
    ].entries()) {
      state = successful(
        reduceGame(state, { type: 'task/event', event, now: 300 + index }, catalog),
      ).state
    }

    expect(state.tasks.active[0].progress).toBe(2)
    expect(state.tasks.active[0].seenKeys).toEqual(['video:BV-one', 'video:BV-two'])
  })

  it('钢琴仍按 piano:noteId 去重', () => {
    let state = withTasks(createInitialGameState({ now: 0, seed: 'piano-keys' }), [
      task('two-melodies'),
      task('wardrobe-choice'),
      task('greet-bingo'),
    ])
    for (const [index, event] of [
      { type: 'piano-note-played', noteId: 'C4' } as const,
      { type: 'piano-note-played', noteId: 'C4' } as const,
      { type: 'piano-note-played', noteId: 'D4' } as const,
    ].entries()) {
      state = successful(
        reduceGame(state, { type: 'task/event', event, now: 400 + index }, catalog),
      ).state
    }

    expect(state.tasks.active[0].progress).toBe(2)
    expect(state.tasks.active[0].seenKeys).toEqual(['piano:C4', 'piano:D4'])
  })

  it('每条完成即时奖励苹果，第三条完成后原子刷新全新三条', () => {
    const base = createInitialGameState({ now: 0, seed: 'refresh-board' })
    const state = withTasks(base, [
      task('greet-bingo', 1),
      task('wardrobe-choice', 1),
      task('stage-test'),
    ])
    const sequenceBefore = state.random.sequences.tasks
    const applesBefore = state.economy.apples
    const result = successful(
      reduceGame(
        state,
        { type: 'task/event', event: { type: 'stage-test-opened' }, now: 1_000 },
        catalog,
      ),
    )

    expect(result.state.economy.apples).toBe(applesBefore + 3)
    expect(result.state.statistics.applesEarned).toBe(3)
    expect(result.state.tasks.completedCount).toBe(state.tasks.completedCount + 1)
    expect(result.state.tasks.oneOffCompleted).toContain('stage-test')
    expect(result.state.tasks.active.every((entry) => entry.progress === 0)).toBe(true)
    expect(result.state.tasks.active.some((entry) => entry.taskId === 'stage-test')).toBe(false)
    expect(result.state.tasks.active.some((entry) => entry.taskId === 'greet-bingo')).toBe(false)
    expect(result.state.random.sequences.tasks).toBe(sequenceBefore + 1)
    expect(result.effects).toMatchObject([
      {
        type: 'task-progressed',
        taskId: 'stage-test',
        completed: true,
        applesAwarded: 3,
        boardRefreshed: true,
      },
    ])
  })

  it('第三条之前保留原板，完成项不会再次领奖', () => {
    const base = withTasks(createInitialGameState({ now: 0, seed: 'keep-board' }), [
      task('greet-bingo'),
      task('wardrobe-choice'),
      task('record-time'),
    ])
    const first = successful(
      reduceGame(base, { type: 'task/event', event: { type: 'pet-greeted' }, now: 10 }, catalog),
    )
    expect(first.state.tasks.active[0].taskId).toBe('greet-bingo')
    expect(isTaskCompleted(first.state.tasks.active[0])).toBe(true)
    expect(first.effects).toMatchObject([
      { type: 'task-progressed', completed: true, applesAwarded: 1, boardRefreshed: false },
    ])

    const repeated = successful(
      reduceGame(
        first.state,
        { type: 'task/event', event: { type: 'pet-greeted' }, now: 11 },
        catalog,
      ),
    )
    expect(repeated.state).toBe(first.state)
    expect(repeated.effects).toEqual([])
  })

  it('苹果已满时任务仍可完成，不会因奖励溢出卡住', () => {
    const base = createInitialGameState({ now: 0, seed: 'apple-cap' })
    const state = withTasks({ ...base, economy: { apples: MAX_APPLES } }, [
      task('greet-bingo'),
      task('wardrobe-choice'),
      task('record-time'),
    ])
    const result = successful(
      reduceGame(state, { type: 'task/event', event: { type: 'pet-greeted' }, now: 100 }, catalog),
    )

    expect(result.state.economy.apples).toBe(MAX_APPLES)
    expect(result.state.tasks.active[0].progress).toBe(1)
    expect(result.effects).toMatchObject([{ applesAwarded: 0, completed: true }])
  })

  it('房间原子互动同时移动饼狗，并仍只推进一条任务', () => {
    const state = withTasks(createInitialGameState({ now: 0, seed: 'room-atomic' }), [
      task('room-stroll'),
      task('piano-time'),
      task('wardrobe-choice'),
    ])
    const result = successful(
      reduceGame(state, { type: 'room/interact', area: 'piano', now: 100 }, catalog),
    )

    expect(result.state.pet.location).toBe('piano')
    expect(result.state.tasks.active.map((entry) => entry.progress)).toEqual([1, 0, 0])
    expect(result.effects.map((effect) => effect.type)).toEqual(['pet-moved', 'task-progressed'])
  })

  it('展示 helper 从任务库取稳定文案与进度', () => {
    const entry = task('revisit-two', 1)
    expect(getTaskPresentation('greet-bingo')).toEqual({
      title: '看看饼狗的小背包',
      description: '打开一次饼狗菜单',
    })
    expect(getTaskPresentation('record-time')).toEqual({
      title: '看看一张唱片',
      description: '主动打开唱片播放器看看',
    })
    expect(getTaskPresentation('two-melodies')).toEqual({
      title: '逛逛音乐角落',
      description: '弹响不同琴键，或打开不同视频看看',
    })
    expect(getTaskPresentation(entry.taskId)).toEqual({
      title: '重温两份回忆',
      description: '查看两份不同的收藏',
    })
    expect(getTaskProgressLabel(entry)).toBe('1 / 2')
    expect(getTaskProgressLabel({ ...entry, progress: 2 })).toBe('已完成')
  })
})
