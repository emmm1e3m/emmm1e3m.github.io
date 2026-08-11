import { z } from 'zod'

import {
  gameStateV10Schema,
  migrateStoredGameStateToV10,
  type StoredGameState as StoredGameStateThroughV10,
} from './migrateGameStateV9'
import type { MigrateGameStateV3Options } from './migrateGameStateV3'
import { MAX_DATE_TIMESTAMP_MS } from './time'
import type {
  GameStateV10,
  GameStateV11,
  SavedWardrobeLookV11,
  WardrobeElementV11,
  WardrobeAssetId,
  WardrobePhotoV11,
  WardrobePhotoParticipantV11,
  WardrobeStateV11,
  WardrobeTargetId,
  WardrobeTransformV11,
} from './types'

/** 已发布 V11 的衣柜目录与边界；不得随当前衣柜目录继续扩展。 */
const FRIEND_EVENT_IDS = [
  'class-representative-bing',
  'san-hao-rabbit',
  'xin-hao-rabbit',
  'signal-dog',
  'bili-bing',
] as const
export const WARDROBE_LAYOUT_VERSION_V11 = 1 as const
const WARDROBE_SHOP_SIZE = 3 as const
const MAX_WARDROBE_LOOK_ELEMENTS = 12
const MAX_WARDROBE_LOOKS_PER_TARGET = 8
const MAX_WARDROBE_LOOK_NAME_LENGTH = 20
const MAX_WARDROBE_PHOTOS = 40
const MAX_WARDROBE_PHOTO_PARTICIPANTS = 6
const WARDROBE_ASSET_IDS = [
  'green-sailor-top',
  'red-ruffle-dress',
  'monochrome-maid-dress',
  'black-stage-suit',
  'black-tie-uniform',
  'blue-street-jacket',
  'tan-bear-suit',
  'cream-apple-cape',
  'round-glasses',
  'square-glasses',
  'maid-headband',
  'black-beret',
  'cat-ears',
  'microphone',
  'signal-sign',
  'apple-cake',
  'paw-glove',
  'check-sign',
  'cross-sign',
  'dim-sum-basket',
  'apple-cuffs',
  'apple-badge',
  'black-fedora',
  'red-bead-trim',
] as const satisfies readonly WardrobeAssetId[]
const STARTER_WARDROBE_ASSET_IDS = ['cream-apple-cape'] as const
const WARDROBE_FOR_SALE_IDS = WARDROBE_ASSET_IDS.filter(
  (assetId) => assetId !== STARTER_WARDROBE_ASSET_IDS[0],
)

function hashWardrobeSeedV11(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function nextWardrobeRandomV11(state: number): { value: number; state: number } {
  const nextState = (state + 0x6d2b79f5) >>> 0
  let value = nextState
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  value = (value ^ (value >>> 14)) >>> 0
  return { value: value / 4_294_967_296, state: nextState }
}

function generateWardrobeShop(
  seed: string,
  companionDay: number,
  ownedAssetIds: readonly WardrobeAssetId[],
): WardrobeAssetId[] {
  if (seed.trim().length === 0) throw new TypeError('衣柜刷新种子不能为空')
  if (!Number.isSafeInteger(companionDay) || companionDay < 0) {
    throw new RangeError('衣柜刷新游戏日必须是非负安全整数')
  }
  const owned = new Set(ownedAssetIds)
  const shuffled = WARDROBE_FOR_SALE_IDS.filter((assetId) => !owned.has(assetId))
  let cursor = hashWardrobeSeedV11(`${seed}:wardrobe:${companionDay}`)
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = nextWardrobeRandomV11(cursor)
    cursor = random.state
    const swapIndex = Math.floor(random.value * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled.slice(0, WARDROBE_SHOP_SIZE)
}

export function createInitialWardrobeStateV11(
  seed: string,
  companionDay: number,
): WardrobeStateV11 {
  const ownedAssetIds = [...STARTER_WARDROBE_ASSET_IDS]
  return {
    layoutVersion: WARDROBE_LAYOUT_VERSION_V11,
    shop: {
      companionDay,
      assetIds: generateWardrobeShop(seed, companionDay, ownedAssetIds),
    },
    ownedAssetIds,
    nextLookSequence: 0,
    looks: {},
    nextPhotoSequence: 0,
    photos: {},
  }
}

const timestamp = z.number().int().nonnegative().max(MAX_DATE_TIMESTAMP_MS)
const safeCounter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const wardrobeAssetIdSchema = z.enum(WARDROBE_ASSET_IDS)
const wardrobeTargetIdSchema = z.enum(['bingo', ...FRIEND_EVENT_IDS])
const lookIdSchema = z.string().regex(/^look-[a-z0-9]{1,11}-[a-z0-9]{1,7}$/)
const photoIdSchema = z.string().regex(/^photo-[a-z0-9]{1,11}-[a-z0-9]{1,7}$/)
const postcardIdSchema = z.string().regex(/^postcard-[0-9]{4}-[0-9]{2}-[0-9]{4}$/)

const wardrobeTransformShape = {
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  scale: z.number().finite().min(0.05).max(5),
  rotation: z.number().finite().min(-180).max(180),
  z: z.number().int().min(-100).max(100),
}

const wardrobeTransformSchema: z.ZodType<WardrobeTransformV11> =
  z.strictObject(wardrobeTransformShape)

const wardrobeElementSchema: z.ZodType<WardrobeElementV11> = z.strictObject({
  placementId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  assetId: wardrobeAssetIdSchema,
  ...wardrobeTransformShape,
})

function addUniqueLayerIssues(
  elements: readonly WardrobeElementV11[],
  context: z.RefinementCtx,
  pathPrefix: PropertyKey[] = [],
) {
  const placementIds = new Set<string>()
  const zValues = new Set<number>()
  elements.forEach((element, index) => {
    if (placementIds.has(element.placementId)) {
      context.addIssue({
        code: 'custom',
        path: [...pathPrefix, index, 'placementId'],
        message: '同一个形象的放置元素 ID 必须唯一',
      })
    }
    if (zValues.has(element.z)) {
      context.addIssue({
        code: 'custom',
        path: [...pathPrefix, index, 'z'],
        message: '同一个形象的服装图层顺序必须唯一',
      })
    }
    placementIds.add(element.placementId)
    zValues.add(element.z)
  })
}

const wardrobeElementsSchema = z
  .array(wardrobeElementSchema)
  .max(MAX_WARDROBE_LOOK_ELEMENTS)
  .superRefine((elements, context) => addUniqueLayerIssues(elements, context))

const savedWardrobeLookSchema: z.ZodType<SavedWardrobeLookV11> = z
  .strictObject({
    lookId: lookIdSchema,
    targetId: wardrobeTargetIdSchema,
    name: z
      .string()
      .min(1)
      .max(MAX_WARDROBE_LOOK_NAME_LENGTH)
      .refine((name) => name === name.trim(), '造型名称不能包含首尾空格'),
    elements: wardrobeElementsSchema,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((look, context) => {
    if (look.updatedAt < look.createdAt) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: '造型更新时间不能早于创建时间',
      })
    }
  })

const wardrobePhotoParticipantSchema: z.ZodType<WardrobePhotoParticipantV11> = z.strictObject({
  targetId: wardrobeTargetIdSchema,
  sourceLookId: lookIdSchema.nullable(),
  ...wardrobeTransformShape,
  elements: wardrobeElementsSchema,
})

const wardrobePhotoSchema: z.ZodType<WardrobePhotoV11> = z
  .strictObject({
    photoId: photoIdSchema,
    postcardId: postcardIdSchema.nullable(),
    participants: z
      .array(wardrobePhotoParticipantSchema)
      .min(1)
      .max(MAX_WARDROBE_PHOTO_PARTICIPANTS),
    createdAt: timestamp,
  })
  .superRefine((photo, context) => {
    const targets = new Set<WardrobeTargetId>()
    const zValues = new Set<number>()
    photo.participants.forEach((participant, index) => {
      if (targets.has(participant.targetId)) {
        context.addIssue({
          code: 'custom',
          path: ['participants', index, 'targetId'],
          message: '同一张合拍中不能重复放置同一个角色',
        })
      }
      if (zValues.has(participant.z)) {
        context.addIssue({
          code: 'custom',
          path: ['participants', index, 'z'],
          message: '同一张合拍中角色的图层顺序必须唯一',
        })
      }
      targets.add(participant.targetId)
      zValues.add(participant.z)
    })
  })

const wardrobeStateSchema: z.ZodType<WardrobeStateV11> = z
  .strictObject({
    layoutVersion: z.literal(WARDROBE_LAYOUT_VERSION_V11),
    shop: z.strictObject({
      companionDay: safeCounter,
      assetIds: z.array(wardrobeAssetIdSchema).max(WARDROBE_SHOP_SIZE),
    }),
    ownedAssetIds: z.array(wardrobeAssetIdSchema).max(WARDROBE_ASSET_IDS.length),
    nextLookSequence: safeCounter,
    looks: z.record(lookIdSchema, savedWardrobeLookSchema),
    nextPhotoSequence: safeCounter,
    photos: z.record(photoIdSchema, wardrobePhotoSchema),
  })
  .superRefine((wardrobe, context) => {
    if (new Set(wardrobe.shop.assetIds).size !== wardrobe.shop.assetIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['shop', 'assetIds'],
        message: '每日衣柜商品不能重复',
      })
    }
    if (
      wardrobe.shop.assetIds.some((assetId) =>
        STARTER_WARDROBE_ASSET_IDS.includes(assetId as (typeof STARTER_WARDROBE_ASSET_IDS)[number]),
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['shop', 'assetIds'],
        message: '初始赠送服装不能占用每日衣柜商品位',
      })
    }
    if (new Set(wardrobe.ownedAssetIds).size !== wardrobe.ownedAssetIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['ownedAssetIds'],
        message: '已经收藏的服装 ID 不能重复',
      })
    }
    for (const starterId of STARTER_WARDROBE_ASSET_IDS) {
      if (!wardrobe.ownedAssetIds.includes(starterId)) {
        context.addIssue({
          code: 'custom',
          path: ['ownedAssetIds'],
          message: '奇迹饼狗存档缺少初始服装',
        })
      }
    }
    if (Object.keys(wardrobe.photos).length > MAX_WARDROBE_PHOTOS) {
      context.addIssue({
        code: 'custom',
        path: ['photos'],
        message: `相册最多保存 ${MAX_WARDROBE_PHOTOS} 张合拍`,
      })
    }
    const lookCounts = new Map<WardrobeTargetId, number>()
    for (const [lookId, look] of Object.entries(wardrobe.looks)) {
      if (look.lookId !== lookId) {
        context.addIssue({
          code: 'custom',
          path: ['looks', lookId, 'lookId'],
          message: '保存造型的索引必须与造型 ID 一致',
        })
      }
      const count = (lookCounts.get(look.targetId) ?? 0) + 1
      lookCounts.set(look.targetId, count)
      if (count > MAX_WARDROBE_LOOKS_PER_TARGET) {
        context.addIssue({
          code: 'custom',
          path: ['looks', lookId, 'targetId'],
          message: `每位角色最多保存 ${MAX_WARDROBE_LOOKS_PER_TARGET} 套造型`,
        })
      }
    }
    for (const [photoId, photo] of Object.entries(wardrobe.photos)) {
      if (photo.photoId !== photoId) {
        context.addIssue({
          code: 'custom',
          path: ['photos', photoId, 'photoId'],
          message: '相册索引必须与合拍 ID 一致',
        })
      }
    }
  })

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** V11 只新增奇迹饼狗持久状态；V10 其余载荷继续由冻结 schema 校验。 */
function refineGameStateV11(value: unknown, context: z.RefinementCtx) {
  const state = asRecord(value)
  if (!state || state.schemaVersion !== 11) {
    context.addIssue({ code: 'custom', message: '不是严格的 V11 旅行饼狗存档' })
    return
  }

  const wardrobeResult = wardrobeStateSchema.safeParse(state.wardrobe)
  if (!wardrobeResult.success) {
    for (const issue of wardrobeResult.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['wardrobe', ...issue.path],
        message: issue.message,
      })
    }
  }

  const { wardrobe: _wardrobe, ...withoutWardrobe } = state
  void _wardrobe
  const baseResult = gameStateV10Schema.safeParse({ ...withoutWardrobe, schemaVersion: 10 })
  if (!baseResult.success) {
    for (const issue of baseResult.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    }
  }

  if (!wardrobeResult.success || !baseResult.success) return
  const wardrobe = wardrobeResult.data
  const base = baseResult.data
  if (wardrobe.shop.companionDay !== base.profile.companionDays) {
    context.addIssue({
      code: 'custom',
      path: ['wardrobe', 'shop', 'companionDay'],
      message: '衣柜刷新游戏日必须与当前游戏日一致',
    })
  }
  const dayStartOwnedAssetIds = wardrobe.ownedAssetIds.filter(
    (assetId) => !wardrobe.shop.assetIds.includes(assetId),
  )
  const expectedShop = generateWardrobeShop(
    base.random.seed,
    base.profile.companionDays,
    dayStartOwnedAssetIds,
  )
  const storedShopIds = new Set(wardrobe.shop.assetIds)
  if (
    expectedShop.length !== wardrobe.shop.assetIds.length ||
    expectedShop.some((assetId) => !storedShopIds.has(assetId))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['wardrobe', 'shop', 'assetIds'],
      message: '每日衣柜商品无法由当前种子、游戏日与本日购买记录重建',
    })
  }
  const owned = new Set(wardrobe.ownedAssetIds)
  for (const [lookId, look] of Object.entries(wardrobe.looks)) {
    if (
      look.targetId !== 'bingo' &&
      base.friends[look.targetId as keyof typeof base.friends] === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['wardrobe', 'looks', lookId],
        message: '不能为尚未遇见的朋友保存造型',
      })
    }
    look.elements.forEach((element, index) => {
      if (!owned.has(element.assetId)) {
        context.addIssue({
          code: 'custom',
          path: ['wardrobe', 'looks', lookId, 'elements', index, 'assetId'],
          message: '保存造型只能引用已经收藏的服装',
        })
      }
    })
  }

  for (const [photoId, photo] of Object.entries(wardrobe.photos)) {
    if (photo.postcardId !== null && base.collections[photo.postcardId] === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['wardrobe', 'photos', photoId, 'postcardId'],
        message: '合拍背景必须引用已经收藏的明信片',
      })
    }
    photo.participants.forEach((participant, participantIndex) => {
      if (participant.sourceLookId === null && participant.elements.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['wardrobe', 'photos', photoId, 'participants', participantIndex, 'elements'],
          message: '未选择来源造型的合拍角色不能包含造型快照',
        })
      }
      if (participant.sourceLookId !== null) {
        const sourceLook = wardrobe.looks[participant.sourceLookId]
        if (sourceLook !== undefined && sourceLook.targetId !== participant.targetId) {
          context.addIssue({
            code: 'custom',
            path: ['wardrobe', 'photos', photoId, 'participants', participantIndex, 'sourceLookId'],
            message: '合拍来源造型必须属于对应角色',
          })
        }
      }
      if (
        !base.profile.debug &&
        participant.targetId !== 'bingo' &&
        base.friends[participant.targetId] === undefined
      ) {
        context.addIssue({
          code: 'custom',
          path: ['wardrobe', 'photos', photoId, 'participants', participantIndex, 'targetId'],
          message: '普通存档的合拍不能包含尚未遇见的朋友',
        })
      }
      participant.elements.forEach((element, elementIndex) => {
        if (!base.profile.debug && !owned.has(element.assetId)) {
          context.addIssue({
            code: 'custom',
            path: [
              'wardrobe',
              'photos',
              photoId,
              'participants',
              participantIndex,
              'elements',
              elementIndex,
              'assetId',
            ],
            message: '合拍快照只能引用已经收藏的服装',
          })
        }
      })
    })
  }
}

export const gameStateV11Schema: z.ZodType<GameStateV11> = z
  .unknown()
  .superRefine(refineGameStateV11) as z.ZodType<GameStateV11>

export function isStrictGameStateV11(value: unknown): value is GameStateV11 {
  return gameStateV11Schema.safeParse(value).success
}

export function migrateGameStateV10ToV11(state: GameStateV10): GameStateV11 {
  const cloned = structuredClone(state)
  return {
    ...cloned,
    schemaVersion: 11,
    activeActivity:
      cloned.activeActivity?.kind === 'rest'
        ? {
            ...cloned.activeActivity,
            rewardPlan: { ...cloned.activeActivity.rewardPlan, baseApples: 0 },
          }
        : cloned.activeActivity,
    wardrobe: createInitialWardrobeStateV11(cloned.random.seed, cloned.profile.companionDays),
  }
}

export type StoredGameState = StoredGameStateThroughV10 | GameStateV11

export function migrateStoredGameStateToV11(
  state: StoredGameState,
  options: MigrateGameStateV3Options,
): GameStateV11 {
  if (state.schemaVersion === 11) return state
  return migrateGameStateV10ToV11(migrateStoredGameStateToV10(state, options))
}

export { wardrobeStateSchema, wardrobeTransformSchema }
