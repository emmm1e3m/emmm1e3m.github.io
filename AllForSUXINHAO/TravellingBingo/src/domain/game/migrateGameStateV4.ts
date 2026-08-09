import { z } from 'zod'

import { MAX_POMODORO_DURATION_MS, MIN_POMODORO_DURATION_MS, POMODORO_PRESETS } from './constants'
import {
  gameStateV4Schema,
  migrateStoredGameStateToV4,
  type MigrateGameStateV3Options,
  type StoredGameStateThroughV4,
} from './migrateGameStateV3'
import { MAX_DATE_TIMESTAMP_MS } from './time'
import type {
  GameState,
  GameStateV4,
  GameStateV5LegacyMusic,
  MusicPlayerState,
  PomodoroSession,
  PomodoroSessionV4,
} from './types'

const timestamp = z.number().int().nonnegative().max(MAX_DATE_TIMESTAMP_MS)
function isAllowedPomodoroPair(focusDurationMs: number, breakDurationMs: number): boolean {
  if (breakDurationMs === 0) {
    return (
      focusDurationMs >= MIN_POMODORO_DURATION_MS && focusDurationMs <= MAX_POMODORO_DURATION_MS
    )
  }
  return POMODORO_PRESETS.some(
    (preset) =>
      preset.focusDurationMs === focusDurationMs && preset.breakDurationMs === breakDurationMs,
  )
}

const pomodoroSessionV5Schema = z
  .strictObject({
    sessionId: z.string().min(1).max(128),
    status: z.enum(['focus', 'break', 'completed']),
    startedAt: timestamp,
    focusEndsAt: timestamp,
    cycleEndsAt: timestamp,
    focusDurationMs: z.number().int().positive().max(MAX_POMODORO_DURATION_MS),
    breakDurationMs: z.number().int().nonnegative().max(MAX_POMODORO_DURATION_MS),
    completedAt: timestamp.nullable(),
    focusNotificationIssuedAt: timestamp.nullable(),
    completionNotificationIssuedAt: timestamp.nullable(),
    todoId: z.string().min(1).max(64).nullable(),
    postcardId: z.string().min(1).nullable(),
  })
  .superRefine((session, context) => {
    if (!isAllowedPomodoroPair(session.focusDurationMs, session.breakDurationMs)) {
      context.addIssue({
        code: 'custom',
        path: ['breakDurationMs'],
        message: 'V5 苹果钟必须使用固定专注与休息组合；旧 V4 会话只能使用零休息迁移',
      })
    }
    if (session.focusEndsAt !== session.startedAt + session.focusDurationMs) {
      context.addIssue({
        code: 'custom',
        path: ['focusEndsAt'],
        message: '专注结束时间与专注时长不一致',
      })
    }
    if (session.cycleEndsAt !== session.focusEndsAt + session.breakDurationMs) {
      context.addIssue({
        code: 'custom',
        path: ['cycleEndsAt'],
        message: '整轮结束时间与休息时长不一致',
      })
    }

    if (session.status === 'focus') {
      if (
        session.completedAt !== null ||
        session.focusNotificationIssuedAt !== null ||
        session.completionNotificationIssuedAt !== null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: '专注阶段不能提前完成或签发阶段通知',
        })
      }
      return
    }

    if (
      session.focusNotificationIssuedAt === null ||
      session.focusNotificationIssuedAt < session.focusEndsAt
    ) {
      context.addIssue({
        code: 'custom',
        path: ['focusNotificationIssuedAt'],
        message: '休息或完成阶段必须记录合法的专注结束通知时间',
      })
    }

    if (session.status === 'break') {
      if (
        session.breakDurationMs === 0 ||
        session.completedAt !== null ||
        session.completionNotificationIssuedAt !== null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: '休息阶段必须有休息时长，且不能提前完成或签发整轮通知',
        })
      }
      return
    }

    if (
      session.completedAt !== session.cycleEndsAt ||
      session.completionNotificationIssuedAt === null ||
      session.completionNotificationIssuedAt < session.cycleEndsAt
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: '完成阶段必须记录整轮截止时间和合法的完成通知时间',
      })
    }
  })

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** V5 复用冻结 V4 对非苹果钟字段的严格校验；兼容副本只用于校验。 */
function refineGameStateV5(value: unknown, context: z.RefinementCtx, legacyMusic: boolean) {
  const state = asRecord(value)
  const reality = asRecord(state?.reality)
  const pomodoro = asRecord(reality?.pomodoro)
  const tasks = asRecord(state?.tasks)
  const musicPlayer = asRecord(state?.musicPlayer)
  if (!state || !reality || !pomodoro || !tasks || !musicPlayer || state.schemaVersion !== 5) {
    context.addIssue({ code: 'custom', message: '不是严格的 V5 旅行饼狗存档' })
    return
  }

  const retiredFields = legacyMusic
    ? (['startAtSeconds', 'autoplay'] as const)
    : (['playlists', 'order', 'activePlaylistId', 'startAtSeconds', 'autoplay'] as const)
  for (const legacyField of retiredFields) {
    if (legacyField in musicPlayer) {
      context.addIssue({
        code: 'custom',
        path: ['musicPlayer', legacyField],
        message: `V5 播放器不再保存 ${legacyField}`,
      })
    }
  }

  const sessionResult = pomodoroSessionV5Schema.nullable().safeParse(pomodoro.session)
  if (!sessionResult.success) {
    for (const issue of sessionResult.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'pomodoro', 'session', ...issue.path],
        message: issue.message,
      })
    }
  }

  const v4Compatible = {
    ...state,
    schemaVersion: 4,
    tasks: Object.fromEntries(Object.entries(tasks).filter(([key]) => key !== 'completedAt')),
    musicPlayer: {
      ...musicPlayer,
      ...(legacyMusic ? {} : { playlists: {}, order: [], activePlaylistId: null }),
      startAtSeconds: 0,
      autoplay: true,
    },
    reality: {
      ...reality,
      pomodoro: {
        ...pomodoro,
        session: null,
      },
    },
  }
  const baseResult = gameStateV4Schema.safeParse(v4Compatible)
  if (!baseResult.success) {
    for (const issue of baseResult.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    }
  }

  if (sessionResult.success && sessionResult.data?.todoId) {
    const todos = asRecord(reality.todos)
    if (!todos || todos[sessionResult.data.todoId] === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'pomodoro', 'session', 'todoId'],
        message: '苹果钟关联了不存在的待办',
      })
    }
  }

  const completedAtResult = timestamp.nullable().safeParse(tasks.completedAt)
  if (!completedAtResult.success) {
    context.addIssue({
      code: 'custom',
      path: ['tasks', 'completedAt'],
      message: '今日 Bingo 完成时间必须是合法时间戳或 null',
    })
  } else {
    const active = Array.isArray(tasks.active) ? tasks.active : []
    const allCompleted =
      active.length === 3 &&
      active.every((entry) => {
        const task = asRecord(entry)
        return (
          task !== null &&
          typeof task.progress === 'number' &&
          typeof task.target === 'number' &&
          task.progress >= task.target
        )
      })
    if (allCompleted !== (completedAtResult.data !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['tasks', 'completedAt'],
        message: '今日 Bingo 完成状态与完成时间不一致',
      })
    }
    if (completedAtResult.data !== null) {
      const latestAssignedAt = Math.max(
        ...active.map((entry) => Number(asRecord(entry)?.assignedAt ?? 0)),
      )
      if (completedAtResult.data < latestAssignedAt) {
        context.addIssue({
          code: 'custom',
          path: ['tasks', 'completedAt'],
          message: '今日 Bingo 完成时间不能早于任务分配时间',
        })
      }
    }
  }
}

/** 当前 V5 严格载荷，不再持久化自定义播放列表。 */
export const gameStateV5Schema: z.ZodType<GameState> = z
  .unknown()
  .superRefine((value, context) => refineGameStateV5(value, context, false)) as z.ZodType<GameState>

/** 仅供读取已发布过的旧 V5 缓存；采用前必须显式移除自定义列表字段。 */
export const gameStateV5LegacyMusicSchema: z.ZodType<GameStateV5LegacyMusic> = z
  .unknown()
  .superRefine((value, context) =>
    refineGameStateV5(value, context, true),
  ) as z.ZodType<GameStateV5LegacyMusic>

export function isStrictGameStateV5(value: unknown): value is GameState {
  return gameStateV5Schema.safeParse(value).success
}

function migratePomodoroSession(session: PomodoroSessionV4 | null): PomodoroSession | null {
  if (session === null) return null
  const issuedAt = session.notificationIssuedAt
  return {
    sessionId: session.sessionId,
    status: session.status === 'running' ? 'focus' : 'completed',
    startedAt: session.startedAt,
    focusEndsAt: session.endsAt,
    cycleEndsAt: session.endsAt,
    focusDurationMs: session.durationMs,
    breakDurationMs: 0,
    completedAt: session.completedAt,
    focusNotificationIssuedAt: issuedAt,
    completionNotificationIssuedAt: issuedAt,
    todoId: session.todoId,
    postcardId: session.postcardId,
  }
}

function migrateMusicPlayerState(
  player: Pick<GameStateV4['musicPlayer'], 'currentBvid' | 'currentIndex' | 'loopMode'>,
): MusicPlayerState {
  return {
    currentBvid: player.currentBvid,
    currentIndex: player.currentIndex,
    loopMode: player.loopMode,
  }
}

export function migrateGameStateV4ToV5(state: GameStateV4): GameState {
  const cloned = structuredClone(state)
  const tasksCompleted = cloned.tasks.active.every((task) => task.progress >= task.target)
  return {
    ...cloned,
    schemaVersion: 5,
    tasks: {
      ...cloned.tasks,
      completedAt: tasksCompleted
        ? Math.max(...cloned.tasks.active.map((task) => task.assignedAt))
        : null,
    },
    reality: {
      ...cloned.reality,
      pomodoro: {
        ...cloned.reality.pomodoro,
        session: migratePomodoroSession(cloned.reality.pomodoro.session),
      },
    },
    musicPlayer: migrateMusicPlayerState(cloned.musicPlayer),
  }
}

export type StoredGameState = StoredGameStateThroughV4 | GameStateV5LegacyMusic | GameState

export function migrateStoredGameStateToV5(
  state: StoredGameState,
  options: MigrateGameStateV3Options,
): GameState {
  if (state.schemaVersion === 5) {
    if (!('playlists' in state.musicPlayer)) return state
    return { ...state, musicPlayer: migrateMusicPlayerState(state.musicPlayer) }
  }
  return migrateGameStateV4ToV5(migrateStoredGameStateToV4(state, options))
}
