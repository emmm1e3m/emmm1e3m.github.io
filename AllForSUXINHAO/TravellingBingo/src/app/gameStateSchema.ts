import { z } from 'zod'

import {
  DEFAULT_GAME_BALANCE,
  gameStateV1Schema as frozenGameStateV1Schema,
  gameStateV2Schema as frozenGameStateV2Schema,
  gameStateV3Schema as frozenGameStateV3Schema,
  gameStateV4Schema as frozenGameStateV4Schema,
  gameStateV5LegacyMusicSchema,
  gameStateV5Schema as frozenGameStateV5Schema,
  gameStateV6Schema as frozenGameStateV6Schema,
  gameStateV7Schema as frozenGameStateV7Schema,
  gameStateV8Schema as frozenGameStateV8Schema,
  gameStateV9Schema as frozenGameStateV9Schema,
  gameStateV10Schema as frozenGameStateV10Schema,
  gameStateV11Schema as currentGameStateV11Schema,
  type GameState,
  type GameStateV1,
  type GameStateV2,
  type GameStateV3,
  type GameStateV4,
  type GameStateV5LegacyMusic,
  type GameStateV5,
  type GameStateV6,
  type GameStateV7,
  type GameStateV8,
  type GameStateV9,
  type GameStateV10,
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

/** 已发布 V6 严格载荷；保留按轮记录的旧刷播历史。 */
const gameStateV6ImportSchema: z.ZodType<GameStateV6> = frozenGameStateV6Schema

/** 已发布 V7 严格载荷；刷播历史按一次启动的任务记录。 */
const gameStateV7ImportSchema: z.ZodType<GameStateV7> = frozenGameStateV7Schema

/** 已发布 V8 严格载荷；新增自测 BV 与维度穿透开关。 */
const gameStateV8ImportSchema: z.ZodType<GameStateV8> = frozenGameStateV8Schema

/** 已发布 V9 严格载荷；现实停留改用可暂停的页面租约。 */
const gameStateV9ImportSchema: z.ZodType<GameStateV9> = frozenGameStateV9Schema

/** 已发布 V10 严格载荷；刷播设置改用本地收藏夹 ID。 */
const gameStateV10ImportSchema: z.ZodType<GameStateV10> = frozenGameStateV10Schema

/** V11 当前严格载荷；新增奇迹饼狗的服装、保存形象与合拍相册。 */
const gameStateV11ImportSchema: z.ZodType<GameState> = currentGameStateV11Schema

const gameStateV11ExportSchema = gameStateV11ImportSchema.superRefine((state, context) => {
  const candidate: unknown = state
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return
  const record = candidate as Record<string, unknown>
  const profile = record.profile
  const gameBalance = record.gameBalance
  if (
    typeof profile !== 'object' ||
    profile === null ||
    Array.isArray(profile) ||
    typeof gameBalance !== 'object' ||
    gameBalance === null ||
    Array.isArray(gameBalance)
  ) {
    return
  }
  const debug = (profile as Record<string, unknown>).debug
  const activityDurationMs = (gameBalance as Record<string, unknown>).activityDurationMs
  const probabilities = (gameBalance as Record<string, unknown>).probabilities
  if (
    typeof debug !== 'boolean' ||
    typeof activityDurationMs !== 'number' ||
    typeof probabilities !== 'object' ||
    probabilities === null ||
    Array.isArray(probabilities)
  ) {
    return
  }
  const probabilityRecord = probabilities as Record<string, unknown>
  if (
    !debug &&
    (activityDurationMs !== DEFAULT_GAME_BALANCE.activityDurationMs ||
      Object.entries(DEFAULT_GAME_BALANCE.probabilities).some(
        ([key, value]) => probabilityRecord[key] !== value,
      ))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['gameBalance'],
      message: '普通存档不能包含 DEBUG 调节值',
    })
  }
})

/** 新导出只写 V11；目录元数据、图片与派生倒计时不属于存档。 */
export const gameStateSchema: z.ZodType<GameState> = gameStateV11ExportSchema

/**
 * 导入只严格解析原始 v1/v2/v3/v4/v5/v6/v7/v8/v9/v10/v11：importBingoSave 必须先按文件原值验证摘要，
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
  gameStateV7ImportSchema,
  gameStateV8ImportSchema,
  gameStateV9ImportSchema,
  gameStateV10ImportSchema,
  gameStateV11ImportSchema,
])

export type ImportableGameState =
  | GameStateV1
  | GameStateV2
  | GameStateV3
  | GameStateV4
  | GameStateV5
  | GameStateV5LegacyMusic
  | GameStateV6
  | GameStateV7
  | GameStateV8
  | GameStateV9
  | GameStateV10
  | GameState
