import { z } from 'zod'

import {
  gameStateV5Schema,
  migrateStoredGameStateToV5,
  type StoredGameStateThroughV5,
} from './migrateGameStateV4'
import type { MigrateGameStateV3Options } from './migrateGameStateV3'
import { MAX_DATE_TIMESTAMP_MS } from './time'
import type { GameStateV5, GameStateV6, StreamHistoryV6 } from './types'

const timestamp = z.number().int().nonnegative().max(MAX_DATE_TIMESTAMP_MS)
const safeCounter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const streamRoundRecordSchema = z.strictObject({
  round: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  completedAt: timestamp,
})

const streamHistorySchema: z.ZodType<StreamHistoryV6> = z
  .strictObject({
    completedRounds: safeCounter,
    recentRounds: z.array(streamRoundRecordSchema).max(10),
  })
  .superRefine((history, context) => {
    const expectedLength = Math.min(history.completedRounds, 10)
    if (history.recentRounds.length !== expectedLength) {
      context.addIssue({
        code: 'custom',
        path: ['recentRounds'],
        message: '刷播记录必须保留最近十轮，轮次不足十轮时不得缺失',
      })
      return
    }

    history.recentRounds.forEach((record, index) => {
      const expectedRound = history.completedRounds - index
      if (record.round !== expectedRound) {
        context.addIssue({
          code: 'custom',
          path: ['recentRounds', index, 'round'],
          message: '刷播记录轮次必须按最新到最旧连续排列',
        })
      }

      const olderRecord = history.recentRounds[index + 1]
      if (olderRecord && record.completedAt <= olderRecord.completedAt) {
        context.addIssue({
          code: 'custom',
          path: ['recentRounds', index, 'completedAt'],
          message: '刷播完成时间必须按轮次严格递增',
        })
      }
    })
  })

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** V6 只新增刷播历史；其余字段继续由冻结的 V5 schema 原值校验。 */
function refineGameStateV6(value: unknown, context: z.RefinementCtx) {
  const state = asRecord(value)
  const reality = asRecord(state?.reality)
  if (!state || !reality || state.schemaVersion !== 6) {
    context.addIssue({ code: 'custom', message: '不是严格的 V6 旅行饼狗存档' })
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
    historyResult.data.recentRounds.forEach((record, index) => {
      if (typeof createdAt === 'number' && record.completedAt < createdAt) {
        context.addIssue({
          code: 'custom',
          path: ['reality', 'streamHistory', 'recentRounds', index, 'completedAt'],
          message: '刷播完成时间不能早于建档时间',
        })
      }
    })
  }

  const v5Reality = Object.fromEntries(
    Object.entries(reality).filter(([key]) => key !== 'streamHistory'),
  )
  const v5Compatible = {
    ...state,
    schemaVersion: 5,
    reality: v5Reality,
  }
  const baseResult = gameStateV5Schema.safeParse(v5Compatible)
  if (!baseResult.success) {
    for (const issue of baseResult.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    }
  }
}

/** 当前 V6 严格载荷；刷播历史按最新到最旧保存最近十轮。 */
export const gameStateV6Schema: z.ZodType<GameStateV6> = z
  .unknown()
  .superRefine(refineGameStateV6) as z.ZodType<GameStateV6>

export function isStrictGameStateV6(value: unknown): value is GameStateV6 {
  return gameStateV6Schema.safeParse(value).success
}

export function migrateGameStateV5ToV6(state: GameStateV5): GameStateV6 {
  const cloned = structuredClone(state)
  return {
    ...cloned,
    schemaVersion: 6,
    reality: {
      ...cloned.reality,
      streamHistory: {
        completedRounds: 0,
        recentRounds: [],
      },
    },
  }
}

export type StoredGameStateThroughV6 = StoredGameStateThroughV5 | GameStateV6

export function migrateStoredGameStateToV6(
  state: StoredGameStateThroughV6,
  options: MigrateGameStateV3Options,
): GameStateV6 {
  if (state.schemaVersion === 6) return state
  return migrateGameStateV5ToV6(migrateStoredGameStateToV5(state, options))
}
