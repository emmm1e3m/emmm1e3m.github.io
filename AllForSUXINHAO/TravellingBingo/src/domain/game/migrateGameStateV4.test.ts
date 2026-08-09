import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { gameStateV4Schema } from './migrateGameStateV3'
import {
  gameStateV5Schema,
  migrateGameStateV4ToV5,
  migrateStoredGameStateToV5,
} from './migrateGameStateV4'
import type { GameStateV4, PomodoroSessionV4, TaskBoardV4 } from './types'

function initialV4(): GameStateV4 {
  const current = createInitialGameState({ now: 0, seed: 'v4-to-v5-tests' })
  const tasks: TaskBoardV4 = {
    active: current.tasks.active,
    completedCount: current.tasks.completedCount,
    recentTemplateIds: current.tasks.recentTemplateIds,
    oneOffCompleted: current.tasks.oneOffCompleted,
  }
  const state: GameStateV4 = {
    ...current,
    schemaVersion: 4,
    tasks,
    reality: {
      ...current.reality,
      pomodoro: { ...current.reality.pomodoro, session: null },
    },
    musicPlayer: {
      ...current.musicPlayer,
      startAtSeconds: 12,
      autoplay: false,
    },
  }
  expect(gameStateV4Schema.safeParse(state).success).toBe(true)
  return state
}

function withSession(state: GameStateV4, session: PomodoroSessionV4): GameStateV4 {
  return {
    ...state,
    reality: {
      ...state.reality,
      pomodoro: { ...state.reality.pomodoro, nextSessionSequence: 1, session },
    },
  }
}

describe('V4 → V5 苹果钟迁移', () => {
  it('把 V4 running 严格迁为零休息 focus，并保留同一个绝对截止点', () => {
    const v4 = withSession(initialV4(), {
      sessionId: 'pomodoro-1',
      status: 'running',
      startedAt: 100,
      endsAt: 1_100,
      durationMs: 1_000,
      completedAt: null,
      notificationIssuedAt: null,
      todoId: null,
      postcardId: null,
    })

    const migrated = migrateGameStateV4ToV5(v4)
    expect(migrated.reality.pomodoro.session).toEqual({
      sessionId: 'pomodoro-1',
      status: 'focus',
      startedAt: 100,
      focusEndsAt: 1_100,
      cycleEndsAt: 1_100,
      focusDurationMs: 1_000,
      breakDurationMs: 0,
      completedAt: null,
      focusNotificationIssuedAt: null,
      completionNotificationIssuedAt: null,
      todoId: null,
      postcardId: null,
    })
    expect(gameStateV5Schema.safeParse(migrated).success).toBe(true)
  })

  it('把 V4 completed 的完成与通知记录映射到两类幂等标记', () => {
    const v4 = withSession(initialV4(), {
      sessionId: 'pomodoro-1',
      status: 'completed',
      startedAt: 100,
      endsAt: 1_100,
      durationMs: 1_000,
      completedAt: 1_100,
      notificationIssuedAt: 1_200,
      todoId: null,
      postcardId: null,
    })

    const migrated = migrateStoredGameStateToV5(v4, {
      now: 2_000,
      catalog: {
        postcard: [],
        'million-shot': [],
        'site-first': [],
        siteFirstChronology: [],
      },
    })
    expect(migrated.reality.pomodoro.session).toMatchObject({
      status: 'completed',
      focusEndsAt: 1_100,
      cycleEndsAt: 1_100,
      breakDurationMs: 0,
      completedAt: 1_100,
      focusNotificationIssuedAt: 1_200,
      completionNotificationIssuedAt: 1_200,
    })
    expect(gameStateV5Schema.safeParse(migrated).success).toBe(true)
  })
})

describe('V5 今日 Bingo 完成时间迁移', () => {
  it('未完成的 V4 任务板迁为 completedAt null', () => {
    const migrated = migrateGameStateV4ToV5(initialV4())

    expect(migrated.tasks.completedAt).toBeNull()
    expect(migrated.musicPlayer).not.toHaveProperty('startAtSeconds')
    expect(migrated.musicPlayer).not.toHaveProperty('autoplay')
    expect(gameStateV5Schema.safeParse(migrated).success).toBe(true)
  })

  it('V4 三项全完成时迁为最晚 assignedAt，且通过严格 V5 schema', () => {
    const v4 = initialV4()
    const active = v4.tasks.active.map((task, index) => ({
      ...task,
      assignedAt: 10 + index,
      progress: task.target,
    })) as TaskBoardV4['active']
    const completedV4: GameStateV4 = { ...v4, tasks: { ...v4.tasks, active } }

    const migrated = migrateGameStateV4ToV5(completedV4)
    expect(migrated.tasks.completedAt).toBe(12)
    expect(gameStateV5Schema.safeParse(migrated).success).toBe(true)
  })

  it('严格 schema 拒绝完成状态与 completedAt 不一致的 V5 载荷', () => {
    const migrated = migrateGameStateV4ToV5(initialV4())
    const invalid = { ...migrated, tasks: { ...migrated.tasks, completedAt: 99 } }

    expect(gameStateV5Schema.safeParse(invalid).success).toBe(false)
  })

  it('严格 V5 schema 拒绝重新混入已退役的播放器字段', () => {
    const migrated = migrateGameStateV4ToV5(initialV4())
    const invalid = {
      ...migrated,
      musicPlayer: { ...migrated.musicPlayer, startAtSeconds: 0, autoplay: true },
    }

    expect(gameStateV5Schema.safeParse(invalid).success).toBe(false)
  })

  it('一次深拷贝仍让迁移结果与 V4 可变分支完全隔离', () => {
    const v4 = initialV4()
    const migrated = migrateGameStateV4ToV5(v4)

    expect(migrated.tasks).not.toBe(v4.tasks)
    expect(migrated.reality).not.toBe(v4.reality)
    expect(migrated.musicPlayer.playlists).not.toBe(v4.musicPlayer.playlists)
    expect(migrated.musicPlayer.order).not.toBe(v4.musicPlayer.order)
  })
})
