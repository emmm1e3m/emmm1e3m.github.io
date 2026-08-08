import { describe, expect, it } from 'vitest'

import { MAX_APPLES } from '../game/constants'
import { createInitialGameState } from '../game/createGameState'
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
  isTaskCompleted,
  TASK_LIBRARY,
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

function task(taskId: TaskId, progress = 0, suffix = taskId): TaskInstance {
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
    for (let sequence = 0; sequence < 20; sequence += 1) {
      const generated = generateTaskBoard({ seed: 'board-shape', sequence, now: 100 })
      const ids = generated.board.active.map((entry) => entry.taskId)
      const groups = ids.map((id) => TASK_LIBRARY[id].triggerGroup)

      expect(new Set(ids).size).toBe(3)
      expect(new Set(groups).size).toBe(3)
      expect(generated.nextSequence).toBe(sequence + 1)
    }
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
