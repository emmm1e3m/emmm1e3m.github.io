import { z } from 'zod'

import { BILIBILI_BVID_PATTERN } from './constants'
import {
  gameStateV7Schema,
  migrateStoredGameStateToV7,
  type StoredGameStateThroughV7,
} from './migrateGameStateV6'
import type { MigrateGameStateV3Options } from './migrateGameStateV3'
import type { GameStateV7, GameStateV8, StreamSettings } from './types'

const bvid = z.string().regex(BILIBILI_BVID_PATTERN)

const streamSettingsSchema: z.ZodType<StreamSettings> = z.strictObject({
  selfTestBvid: bvid.nullable(),
  dimensionPenetrationEnabled: z.boolean(),
})

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** V8 只增加持久刷播设置；V7 的任务历史与其余载荷继续由冻结 schema 校验。 */
function refineGameStateV8(value: unknown, context: z.RefinementCtx) {
  const state = asRecord(value)
  const reality = asRecord(state?.reality)
  if (!state || !reality || state.schemaVersion !== 8) {
    context.addIssue({ code: 'custom', message: '不是严格的 V8 旅行饼狗存档' })
    return
  }

  const settingsResult = streamSettingsSchema.safeParse(reality.streamSettings)
  if (!settingsResult.success) {
    for (const issue of settingsResult.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'streamSettings', ...issue.path],
        message: issue.message,
      })
    }
  }

  const v7Compatible = {
    ...state,
    schemaVersion: 7,
    reality: Object.fromEntries(
      Object.entries(reality).filter(([key]) => key !== 'streamSettings'),
    ),
  }
  const baseResult = gameStateV7Schema.safeParse(v7Compatible)
  if (!baseResult.success) {
    for (const issue of baseResult.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    }
  }
}

export const gameStateV8Schema: z.ZodType<GameStateV8> = z
  .unknown()
  .superRefine(refineGameStateV8) as z.ZodType<GameStateV8>

export function isStrictGameStateV8(value: unknown): value is GameStateV8 {
  return gameStateV8Schema.safeParse(value).success
}

export function migrateGameStateV7ToV8(state: GameStateV7): GameStateV8 {
  const cloned = structuredClone(state)
  return {
    ...cloned,
    schemaVersion: 8,
    reality: {
      ...cloned.reality,
      streamSettings: {
        selfTestBvid: null,
        dimensionPenetrationEnabled: false,
      },
    },
  }
}

export type StoredGameState = StoredGameStateThroughV7 | GameStateV8

export function migrateStoredGameStateToV8(
  state: StoredGameState,
  options: MigrateGameStateV3Options,
): GameStateV8 {
  if (state.schemaVersion === 8) return state
  return migrateGameStateV7ToV8(migrateStoredGameStateToV7(state, options))
}
