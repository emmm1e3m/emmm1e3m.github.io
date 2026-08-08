import { z } from 'zod'

import type { GameState } from '@/domain'

const timestamp = z.number().int().nonnegative().safe()
const itemId = z.enum([
  'travel-basic',
  'travel-apple',
  'signal-headphones',
  'trend-toolbox',
  'lucky-apple',
])
const activityKind = z.enum(['travel', 'stream', 'trend'])
const collectibleCategory = z.enum(['postcard', 'million-shot', 'site-first'])
const friendEventId = z.enum([
  'class-representative-bing',
  'san-hao-rabbit',
  'xin-hao-rabbit',
  'signal-dog',
  'bili-bing',
])

const rewardPlan = z.strictObject({
  baseApples: z.number().int().nonnegative().safe(),
  modifierApples: z.number().int().nonnegative().safe(),
  collection: z.strictObject({ id: z.string().min(1), category: collectibleCategory }).nullable(),
  friendEventId: friendEventId.nullable(),
  guaranteedByPity: z.boolean(),
  pityAfterClaim: z.number().int().nonnegative().safe().nullable(),
})

const counter = z.strictObject({
  travel: z.number().int().nonnegative().safe(),
  stream: z.number().int().nonnegative().safe(),
  trend: z.number().int().nonnegative().safe(),
})

/** `.bingo` 的业务载荷契约；未知字段一律拒绝，避免旧 UI 状态混入存档。 */
export const gameStateSchema: z.ZodType<GameState> = z.strictObject({
  schemaVersion: z.literal(1),
  profile: z.strictObject({ createdAt: timestamp, debug: z.boolean() }),
  economy: z.strictObject({ apples: z.number().int().nonnegative().max(9_999_999) }),
  inventory: z.strictObject({
    'travel-basic': z.number().int().nonnegative().max(9_999),
    'travel-apple': z.number().int().nonnegative().max(9_999),
    'signal-headphones': z.number().int().nonnegative().max(9_999),
    'trend-toolbox': z.number().int().nonnegative().max(9_999),
    'lucky-apple': z.number().int().nonnegative().max(9_999),
  }),
  collections: z.record(
    z.string().min(1),
    z.strictObject({
      id: z.string().min(1),
      firstObtainedAt: timestamp,
      duplicateCount: z.number().int().nonnegative().safe(),
    }),
  ),
  activeActivity: z
    .strictObject({
      runId: z.string().min(1),
      kind: activityKind,
      startedAt: timestamp,
      endsAt: timestamp,
      rewardSeed: z.string().min(1),
      rewardPlan,
      supplyId: itemId,
      usedLuckyApple: z.boolean(),
    })
    .nullable(),
  pity: z.strictObject({
    stream: z.number().int().nonnegative().safe(),
    trend: z.number().int().nonnegative().safe(),
  }),
  statistics: z.strictObject({
    started: counter,
    claimed: counter,
    applesEarned: z.number().int().nonnegative().safe(),
    duplicateRewards: z.number().int().nonnegative().safe(),
  }),
  random: z.strictObject({
    seed: z.string().min(1),
    sequence: z.number().int().nonnegative().safe(),
  }),
})
