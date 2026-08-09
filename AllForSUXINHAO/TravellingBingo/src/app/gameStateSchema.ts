import { z } from 'zod'

import {
  DEFAULT_GAME_BALANCE,
  gameStateV1Schema as frozenGameStateV1Schema,
  gameStateV2Schema as frozenGameStateV2Schema,
  gameStateV3Schema as frozenGameStateV3Schema,
  gameStateV4Schema as frozenGameStateV4Schema,
  gameStateV5LegacyMusicSchema,
  gameStateV5Schema as frozenGameStateV5Schema,
  gameStateV6Schema as currentGameStateV6Schema,
  type GameState,
  type GameStateV1,
  type GameStateV2,
  type GameStateV3,
  type GameStateV4,
  type GameStateV5LegacyMusic,
  type GameStateV5,
  type StoredGameState,
} from '@/domain'

/** Demo 0.1 的严格原始载荷；导入前不能添加默认值或 transform。 */
const gameStateV1Schema = frozenGameStateV1Schema

/** Demo 0.2 的严格原始载荷；旧 inventory 与概率字段保持冻结。 */
const gameStateV2ImportSchema: z.ZodType<GameStateV2> = frozenGameStateV2Schema

/** Demo 0.3 的严格原始载荷；不能被 V4 新物品与现实字段反向扩展。 */
const gameStateV3ImportSchema: z.ZodType<GameStateV3> = frozenGameStateV3Schema

/** V4 导入允许历史普通档规则；摘要校验后再显式规范未来活动的默认值。 */
const gameStateV4ImportSchema: z.ZodType<GameStateV4> = frozenGameStateV4Schema

/** 已发布 V5 严格载荷；工作与休息阶段均使用绝对截止时间。 */
const gameStateV5ImportSchema: z.ZodType<GameStateV5> = frozenGameStateV5Schema

/** V6 当前严格载荷；新增最近十轮刷播完成记录。 */
const gameStateV6ImportSchema: z.ZodType<GameState> = currentGameStateV6Schema

const gameStateV6ExportSchema = gameStateV6ImportSchema.superRefine((state, context) => {
  if (
    !state.profile.debug &&
    (state.gameBalance.activityDurationMs !== DEFAULT_GAME_BALANCE.activityDurationMs ||
      Object.entries(DEFAULT_GAME_BALANCE.probabilities).some(
        ([key, value]) =>
          state.gameBalance.probabilities[key as keyof typeof state.gameBalance.probabilities] !==
          value,
      ))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['gameBalance'],
      message: '普通存档不能包含 DEBUG 调节值',
    })
  }
})

/** 新导出只写 V6；目录总数、视频元数据与派生倒计时不属于存档。 */
export const gameStateSchema: z.ZodType<GameState> = gameStateV6ExportSchema

/**
 * 导入只严格解析原始 v1/v2/v3/v4/v5/v6：importBingoSave 必须先按文件原值验证摘要，
 * App 随后才能显式迁移、规范规则、reconcile 可安全修复的旧引用并完成语义校验。
 */
export const importableGameStateSchema: z.ZodType<StoredGameState> = z.union([
  gameStateV1Schema,
  gameStateV2ImportSchema,
  gameStateV3ImportSchema,
  gameStateV4ImportSchema,
  gameStateV5ImportSchema,
  gameStateV5LegacyMusicSchema,
  gameStateV6ImportSchema,
])

export type ImportableGameState =
  | GameStateV1
  | GameStateV2
  | GameStateV3
  | GameStateV4
  | GameStateV5
  | GameStateV5LegacyMusic
  | GameState
