import { z } from 'zod'

import { BILIBILI_BVID_PATTERN, DEFAULT_STREAM_FAVORITE_ID, STREAM_FAVORITE_IDS } from './constants'
import {
  gameStateV9Schema,
  migrateStoredGameStateToV9,
  type StoredGameState as StoredGameStateThroughV9,
} from './migrateGameStateV8'
import type { MigrateGameStateV3Options } from './migrateGameStateV3'
import type { GameStateV9, GameStateV10, StreamSettings } from './types'

const streamFavoriteIdSchema = z.union([
  z.literal(STREAM_FAVORITE_IDS[0]),
  z.literal(STREAM_FAVORITE_IDS[1]),
])

const streamSettingsSchema: z.ZodType<StreamSettings> = z.strictObject({
  selfTestBvid: z.string().regex(BILIBILI_BVID_PATTERN).nullable(),
  favoriteId: streamFavoriteIdSchema,
})

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** V10 只替换刷播设置；V9 的现实租约与其余载荷继续由冻结 schema 校验。 */
function refineGameStateV10(value: unknown, context: z.RefinementCtx) {
  const state = asRecord(value)
  const reality = asRecord(state?.reality)
  const settings = asRecord(reality?.streamSettings)
  if (!state || !reality || !settings || state.schemaVersion !== 10) {
    context.addIssue({ code: 'custom', message: '不是严格的 V10 旅行饼狗存档' })
    return
  }

  const settingsResult = streamSettingsSchema.safeParse(settings)
  if (!settingsResult.success) {
    for (const issue of settingsResult.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'streamSettings', ...issue.path],
        message: issue.message,
      })
    }
  }

  const v9Compatible = {
    ...state,
    schemaVersion: 9,
    reality: {
      ...reality,
      streamSettings: {
        selfTestBvid: settings.selfTestBvid,
        dimensionPenetrationEnabled: false,
      },
    },
  }
  const baseResult = gameStateV9Schema.safeParse(v9Compatible)
  if (!baseResult.success) {
    for (const issue of baseResult.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    }
  }
}

export const gameStateV10Schema: z.ZodType<GameStateV10> = z
  .unknown()
  .superRefine(refineGameStateV10) as z.ZodType<GameStateV10>

export function isStrictGameStateV10(value: unknown): value is GameStateV10 {
  return gameStateV10Schema.safeParse(value).success
}

export function migrateGameStateV9ToV10(state: GameStateV9): GameStateV10 {
  const cloned = structuredClone(state)
  return {
    ...cloned,
    schemaVersion: 10,
    reality: {
      ...cloned.reality,
      streamSettings: {
        selfTestBvid: cloned.reality.streamSettings.selfTestBvid,
        favoriteId: DEFAULT_STREAM_FAVORITE_ID,
      },
    },
  }
}

export type StoredGameState = StoredGameStateThroughV9 | GameStateV10

export function migrateStoredGameStateToV10(
  state: StoredGameState,
  options: MigrateGameStateV3Options,
): GameStateV10 {
  if (state.schemaVersion === 10) return state
  return migrateGameStateV9ToV10(migrateStoredGameStateToV9(state, options))
}
