import { z } from 'zod'

import { REALITY_REWARD_INTERVAL_MS } from './constants'
import {
  gameStateV8Schema,
  migrateStoredGameStateToV8,
  type StoredGameState as StoredGameStateThroughV8,
} from './migrateGameStateV7'
import type { MigrateGameStateV3Options } from './migrateGameStateV3'
import { MAX_DATE_TIMESTAMP_MS } from './time'
import type { GameStateV8, GameStateV9, RealitySettlement, RealityStay } from './types'

const timestamp = z.number().int().nonnegative().max(MAX_DATE_TIMESTAMP_MS)
const safeCounter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const realityStaySchema: z.ZodType<RealityStay> = z
  .strictObject({
    stayId: z.string().min(1),
    enteredAt: timestamp,
    activeDurationMs: timestamp,
    leaseStartedAt: timestamp.nullable(),
  })
  .superRefine((stay, context) => {
    if (stay.leaseStartedAt !== null && stay.leaseStartedAt < stay.enteredAt) {
      context.addIssue({
        code: 'custom',
        path: ['leaseStartedAt'],
        message: '现实计时租约不能早于进入现实的时间',
      })
    }
  })

const realitySettlementSchema: z.ZodType<RealitySettlement> = z
  .strictObject({
    stayId: z.string().min(1),
    enteredAt: timestamp,
    leftAt: timestamp,
    activeDurationMs: timestamp,
    fullRewardApples: safeCounter,
  })
  .superRefine((settlement, context) => {
    if (settlement.leftAt < settlement.enteredAt) {
      context.addIssue({
        code: 'custom',
        path: ['leftAt'],
        message: '现实停留的离开时间不能早于进入时间',
      })
    }
    if (settlement.activeDurationMs > settlement.leftAt - settlement.enteredAt) {
      context.addIssue({
        code: 'custom',
        path: ['activeDurationMs'],
        message: '现实有效计时不能超过停留的墙钟时间',
      })
    }
    if (
      settlement.fullRewardApples !==
      Math.floor(settlement.activeDurationMs / REALITY_REWARD_INTERVAL_MS)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['fullRewardApples'],
        message: '现实奖励必须等于有效计时中的完整十分钟数',
      })
    }
  })

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** V9 只替换现实停留与待结算的计时形状；V8 其余载荷继续由冻结 schema 校验。 */
function refineGameStateV9(value: unknown, context: z.RefinementCtx) {
  const state = asRecord(value)
  const reality = asRecord(state?.reality)
  if (!state || !reality || state.schemaVersion !== 9) {
    context.addIssue({ code: 'custom', message: '不是严格的 V9 旅行饼狗存档' })
    return
  }

  const stayResult = z.union([realityStaySchema, z.null()]).safeParse(reality.activeStay)
  if (!stayResult.success) {
    for (const issue of stayResult.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'activeStay', ...issue.path],
        message: issue.message,
      })
    }
  }

  const settlementResult = z
    .union([realitySettlementSchema, z.null()])
    .safeParse(reality.pendingSettlement)
  if (!settlementResult.success) {
    for (const issue of settlementResult.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'pendingSettlement', ...issue.path],
        message: issue.message,
      })
    }
  }

  const activeStay =
    stayResult.success && stayResult.data !== null
      ? { stayId: stayResult.data.stayId, enteredAt: stayResult.data.enteredAt }
      : reality.activeStay
  const pendingSettlement =
    settlementResult.success && settlementResult.data !== null
      ? {
          stayId: settlementResult.data.stayId,
          enteredAt: settlementResult.data.enteredAt,
          leftAt: settlementResult.data.enteredAt + settlementResult.data.activeDurationMs,
          fullRewardApples: settlementResult.data.fullRewardApples,
        }
      : reality.pendingSettlement
  const v8Compatible = {
    ...state,
    schemaVersion: 8,
    reality: { ...reality, activeStay, pendingSettlement },
  }
  const baseResult = gameStateV8Schema.safeParse(v8Compatible)
  if (!baseResult.success) {
    for (const issue of baseResult.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    }
  }
}

export const gameStateV9Schema: z.ZodType<GameStateV9> = z
  .unknown()
  .superRefine(refineGameStateV9) as z.ZodType<GameStateV9>

export function isStrictGameStateV9(value: unknown): value is GameStateV9 {
  return gameStateV9Schema.safeParse(value).success
}

/**
 * V8 没有页面租约或心跳证据，迁移时不能把导入前的墙钟间隔当作在线时长。
 * 活跃停留保留身份与原始进入时间，但从零开始记录可证明的在线时长。
 */
export function migrateGameStateV8ToV9(state: GameStateV8): GameStateV9 {
  const cloned = structuredClone(state)
  return {
    ...cloned,
    schemaVersion: 9,
    reality: {
      ...cloned.reality,
      activeStay:
        cloned.reality.activeStay === null
          ? null
          : {
              ...cloned.reality.activeStay,
              activeDurationMs: 0,
              leaseStartedAt: null,
            },
      pendingSettlement:
        cloned.reality.pendingSettlement === null
          ? null
          : {
              ...cloned.reality.pendingSettlement,
              activeDurationMs:
                cloned.reality.pendingSettlement.leftAt -
                cloned.reality.pendingSettlement.enteredAt,
            },
    },
  }
}

export type StoredGameState = StoredGameStateThroughV8 | GameStateV9

export function migrateStoredGameStateToV9(
  state: StoredGameState,
  options: MigrateGameStateV3Options,
): GameStateV9 {
  if (state.schemaVersion === 9) return state
  return migrateGameStateV8ToV9(migrateStoredGameStateToV8(state, options))
}
