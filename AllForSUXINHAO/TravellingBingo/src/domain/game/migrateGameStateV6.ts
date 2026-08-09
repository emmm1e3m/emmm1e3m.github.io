import { z } from 'zod'

import { gameStateV5Schema } from './migrateGameStateV4'
import { migrateStoredGameStateToV6, type StoredGameStateThroughV6 } from './migrateGameStateV5'
import type { MigrateGameStateV3Options } from './migrateGameStateV3'
import { MAX_DATE_TIMESTAMP_MS } from './time'
import type { GameStateV6, GameStateV7, StreamHistory, StreamSessionRecord } from './types'

const timestamp = z.number().int().nonnegative().max(MAX_DATE_TIMESTAMP_MS)
const safeCounter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const streamSessionRecordSchema: z.ZodType<StreamSessionRecord> = z
  .strictObject({
    sessionId: z.string().min(1).max(128),
    startedAt: timestamp,
    endedAt: timestamp,
    roundsCompleted: safeCounter,
    outcome: z.enum(['completed', 'stopped']),
  })
  .superRefine((session, context) => {
    if (session.endedAt < session.startedAt) {
      context.addIssue({
        code: 'custom',
        path: ['endedAt'],
        message: '刷播任务结束时间不能早于开始时间',
      })
    }
  })

const streamHistorySchema: z.ZodType<StreamHistory> = z
  .strictObject({
    completedRounds: safeCounter,
    recentSessions: z.array(streamSessionRecordSchema).max(10),
  })
  .superRefine((history, context) => {
    const sessionIds = new Set<string>()
    let recordedRounds = 0

    history.recentSessions.forEach((session, index) => {
      if (sessionIds.has(session.sessionId)) {
        context.addIssue({
          code: 'custom',
          path: ['recentSessions', index, 'sessionId'],
          message: '同一次刷播任务只能保留一条记录',
        })
      }
      sessionIds.add(session.sessionId)

      recordedRounds += session.roundsCompleted
    })

    if (recordedRounds > history.completedRounds) {
      context.addIssue({
        code: 'custom',
        path: ['recentSessions'],
        message: '最近刷播任务的完成轮次不能超过累计轮次',
      })
    }
  })

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** V7 只替换刷播历史形状；其余字段继续复用冻结的 V5 严格校验。 */
function refineGameStateV7(value: unknown, context: z.RefinementCtx) {
  const state = asRecord(value)
  const reality = asRecord(state?.reality)
  if (!state || !reality || state.schemaVersion !== 7) {
    context.addIssue({ code: 'custom', message: '不是严格的 V7 旅行饼狗存档' })
    return
  }

  const historyResult = streamHistorySchema.safeParse(reality.streamHistory)
  if (!historyResult.success) {
    for (const issue of historyResult.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'streamHistory', ...issue.path],
        message: issue.message,
      })
    }
  } else {
    const profile = asRecord(state.profile)
    const createdAt = profile?.createdAt
    historyResult.data.recentSessions.forEach((session, index) => {
      if (typeof createdAt === 'number' && session.startedAt < createdAt) {
        context.addIssue({
          code: 'custom',
          path: ['reality', 'streamHistory', 'recentSessions', index, 'startedAt'],
          message: '刷播任务开始时间不能早于建档时间',
        })
      }
    })
  }

  const v5Compatible = {
    ...state,
    schemaVersion: 5,
    reality: Object.fromEntries(Object.entries(reality).filter(([key]) => key !== 'streamHistory')),
  }
  const baseResult = gameStateV5Schema.safeParse(v5Compatible)
  if (!baseResult.success) {
    for (const issue of baseResult.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    }
  }
}

/** 当前 V7 严格载荷；最近记录以一次启动的刷播任务为单位。 */
export const gameStateV7Schema: z.ZodType<GameStateV7> = z
  .unknown()
  .superRefine(refineGameStateV7) as z.ZodType<GameStateV7>

export function isStrictGameStateV7(value: unknown): value is GameStateV7 {
  return gameStateV7Schema.safeParse(value).success
}

export function migrateGameStateV6ToV7(state: GameStateV6): GameStateV7 {
  const cloned = structuredClone(state)
  return {
    ...cloned,
    schemaVersion: 7,
    reality: {
      ...cloned.reality,
      streamHistory: {
        completedRounds: cloned.reality.streamHistory.completedRounds,
        recentSessions: cloned.reality.streamHistory.recentRounds.map((record) => ({
          sessionId: `legacy-v6-round-${record.round}`,
          startedAt: record.completedAt,
          endedAt: record.completedAt,
          roundsCompleted: 1,
          outcome: 'completed',
        })),
      },
    },
  }
}

export type StoredGameState = StoredGameStateThroughV6 | GameStateV7

export function migrateStoredGameStateToV7(
  state: StoredGameState,
  options: MigrateGameStateV3Options,
): GameStateV7 {
  if (state.schemaVersion === 7) return state
  return migrateGameStateV6ToV7(migrateStoredGameStateToV6(state, options))
}
