import { z } from 'zod'

import { FRIEND_EVENT_IDS } from './constants'
import {
  gameStateV11Schema,
  migrateStoredGameStateToV11,
  type StoredGameState as StoredGameStateThroughV11,
} from './migrateGameStateV10'
import type { MigrateGameStateV3Options } from './migrateGameStateV3'
import { isValidLocalDateKey } from './streamDailyReward'
import { MAX_DATE_TIMESTAMP_MS } from './time'
import type {
  GameStateV11,
  GameStateV12,
  PomodoroBackgroundRef,
  SavedWardrobeLook,
  WardrobeElement,
  WardrobeElementV11,
  WardrobePhoto,
  WardrobePhotoDecoration,
  WardrobePhotoParticipant,
  WardrobePhotoParticipantV11,
  WardrobeState,
  WardrobeTargetId,
  WardrobeTransform,
  WardrobeTransformV11,
} from './types'
import {
  generateWardrobeShop,
  MAX_WARDROBE_LOOK_ELEMENTS,
  MAX_WARDROBE_LOOK_NAME_LENGTH,
  MAX_WARDROBE_LOOKS_PER_TARGET,
  MAX_WARDROBE_PHOTO_DECORATIONS,
  MAX_WARDROBE_PHOTOS,
  MAX_WARDROBE_PHOTO_PARTICIPANTS,
  STARTER_WARDROBE_ASSET_IDS,
  WARDROBE_ASSET_IDS,
  WARDROBE_LAYOUT_VERSION,
  WARDROBE_SHOP_SIZE,
} from './wardrobe'

const timestamp = z.number().int().nonnegative().max(MAX_DATE_TIMESTAMP_MS)
const safeCounter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const wardrobeAssetIdSchema = z.enum(WARDROBE_ASSET_IDS)
const wardrobeTargetIdSchema = z.enum(['bingo', ...FRIEND_EVENT_IDS])
const LOOK_ID_PATTERN = /^look-([a-z0-9]{1,11})-[a-z0-9]{1,7}$/
const PHOTO_ID_PATTERN = /^photo-([a-z0-9]{1,11})-[a-z0-9]{1,7}$/
const lookIdSchema = z.string().regex(LOOK_ID_PATTERN)
const photoIdSchema = z.string().regex(PHOTO_ID_PATTERN)
const postcardIdSchema = z.string().regex(/^postcard-[0-9]{4}-[0-9]{2}-[0-9]{4}$/)

function maximumPersistedSequence(ids: readonly string[], pattern: RegExp): number {
  let maximum = -1
  for (const id of ids) {
    const sequenceToken = pattern.exec(id)?.[1]
    if (sequenceToken === undefined) continue
    const sequence = Number.parseInt(sequenceToken, 36)
    // 已发布 V11 的正则也接受超出 JS 安全整数范围的 token；它们不是生成器可恢复的序号。
    if (!Number.isSafeInteger(sequence) || sequence >= Number.MAX_SAFE_INTEGER) continue
    maximum = Math.max(maximum, sequence)
  }
  return maximum
}

function repairNextSequence(current: number, ids: readonly string[], pattern: RegExp): number {
  const maximum = maximumPersistedSequence(ids, pattern)
  return Math.max(current, maximum + 1)
}

const pomodoroBackgroundSchema: z.ZodType<PomodoroBackgroundRef> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('postcard'), id: z.string().min(1) }),
  z.strictObject({ kind: z.literal('wardrobe-photo'), id: photoIdSchema }),
])

const pomodoroSessionV12Schema = z.strictObject({
  sessionId: z.string().min(1).max(128),
  status: z.enum(['focus', 'break', 'completed']),
  startedAt: timestamp,
  focusEndsAt: timestamp,
  cycleEndsAt: timestamp,
  focusDurationMs: safeCounter,
  breakDurationMs: safeCounter,
  completedAt: timestamp.nullable(),
  focusNotificationIssuedAt: timestamp.nullable(),
  completionNotificationIssuedAt: timestamp.nullable(),
  todoId: z.string().min(1).max(64).nullable(),
  background: pomodoroBackgroundSchema.nullable(),
})

const pomodoroStateV12Schema = z.strictObject({
  nextSessionSequence: safeCounter,
  selectedBackground: pomodoroBackgroundSchema.nullable(),
  session: pomodoroSessionV12Schema.nullable(),
})

const wardrobeTransformShape = {
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  scaleX: z.number().finite().min(0.05).max(5),
  scaleY: z.number().finite().min(0.05).max(5),
  rotation: z.number().finite().min(-180).max(180),
  z: z.number().int().min(-100).max(100),
}

export const wardrobeTransformV12Schema: z.ZodType<WardrobeTransform> =
  z.strictObject(wardrobeTransformShape)

const wardrobeElementSchema: z.ZodType<WardrobeElement> = z.strictObject({
  placementId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  assetId: wardrobeAssetIdSchema,
  ...wardrobeTransformShape,
})

function addUniqueCanonicalLayerIssues(
  elements: readonly WardrobeElement[],
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
        message: '同一个组合中的放置元素 ID 必须唯一',
      })
    }
    if (zValues.has(element.z)) {
      context.addIssue({
        code: 'custom',
        path: [...pathPrefix, index, 'z'],
        message: '同一个组合中的图层顺序必须唯一',
      })
    }
    if (index > 0 && elements[index - 1].z >= element.z) {
      context.addIssue({
        code: 'custom',
        path: [...pathPrefix, index, 'z'],
        message: '持久化图层必须按 z 从小到大排列',
      })
    }
    placementIds.add(element.placementId)
    zValues.add(element.z)
  })
}

const wardrobeElementsSchema = z
  .array(wardrobeElementSchema)
  .max(MAX_WARDROBE_LOOK_ELEMENTS)
  .superRefine((elements, context) => addUniqueCanonicalLayerIssues(elements, context))

const savedWardrobeLookSchema: z.ZodType<SavedWardrobeLook> = z
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

const wardrobePhotoParticipantSchema: z.ZodType<WardrobePhotoParticipant> = z.strictObject({
  targetId: wardrobeTargetIdSchema,
  sourceLookId: lookIdSchema.nullable(),
  ...wardrobeTransformShape,
  elements: wardrobeElementsSchema,
})

const wardrobePhotoDecorationSchema: z.ZodType<WardrobePhotoDecoration> = wardrobeElementSchema

const wardrobePhotoSchema: z.ZodType<WardrobePhoto> = z
  .strictObject({
    photoId: photoIdSchema,
    postcardId: postcardIdSchema.nullable(),
    participants: z
      .array(wardrobePhotoParticipantSchema)
      .min(1)
      .max(MAX_WARDROBE_PHOTO_PARTICIPANTS),
    decorations: z
      .array(wardrobePhotoDecorationSchema)
      .max(MAX_WARDROBE_PHOTO_DECORATIONS)
      .superRefine((decorations, context) => addUniqueCanonicalLayerIssues(decorations, context)),
    createdAt: timestamp,
  })
  .superRefine((photo, context) => {
    const targets = new Set<WardrobeTargetId>()
    const globalZ = new Set<number>()
    photo.participants.forEach((participant, index) => {
      if (targets.has(participant.targetId)) {
        context.addIssue({
          code: 'custom',
          path: ['participants', index, 'targetId'],
          message: '同一张合拍中不能重复放置同一个角色',
        })
      }
      if (globalZ.has(participant.z)) {
        context.addIssue({
          code: 'custom',
          path: ['participants', index, 'z'],
          message: '合拍角色与独立装饰的全局图层顺序必须唯一',
        })
      }
      if (index > 0 && photo.participants[index - 1].z >= participant.z) {
        context.addIssue({
          code: 'custom',
          path: ['participants', index, 'z'],
          message: '持久化角色必须按 z 从小到大排列',
        })
      }
      targets.add(participant.targetId)
      globalZ.add(participant.z)
    })
    photo.decorations.forEach((decoration, index) => {
      if (globalZ.has(decoration.z)) {
        context.addIssue({
          code: 'custom',
          path: ['decorations', index, 'z'],
          message: '合拍角色与独立装饰的全局图层顺序必须唯一',
        })
      }
      globalZ.add(decoration.z)
    })
  })

export const wardrobeStateV12Schema: z.ZodType<WardrobeState> = z
  .strictObject({
    layoutVersion: z.literal(WARDROBE_LAYOUT_VERSION),
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
      context.addIssue({ code: 'custom', path: ['shop', 'assetIds'], message: '每日商品不能重复' })
    }
    if (
      wardrobe.shop.assetIds.some((assetId) =>
        STARTER_WARDROBE_ASSET_IDS.includes(assetId as (typeof STARTER_WARDROBE_ASSET_IDS)[number]),
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['shop', 'assetIds'],
        message: '初始赠送服装不能进入每日商店',
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
    if (
      wardrobe.nextLookSequence <=
      maximumPersistedSequence(Object.keys(wardrobe.looks), LOOK_ID_PATTERN)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['nextLookSequence'],
        message: '下一造型序号必须大于所有已保存造型的序号',
      })
    }
    if (
      wardrobe.nextPhotoSequence <=
      maximumPersistedSequence(Object.keys(wardrobe.photos), PHOTO_ID_PATTERN)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['nextPhotoSequence'],
        message: '下一合拍序号必须大于所有已保存合拍的序号',
      })
    }
  })

const streamDailyRewardSchema = z.strictObject({
  lastRewardDateKey: z
    .string()
    .refine(isValidLocalDateKey, '刷播奖励日期必须是有效的 YYYY-MM-DD')
    .nullable(),
})

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function projectTransformV12ToV11(value: unknown): unknown {
  const record = asRecord(value)
  if (record === null) return value
  const { scaleX, scaleY: _scaleY, ...rest } = record
  void _scaleY
  return { ...rest, scale: scaleX }
}

function projectLookV12ToV11(value: unknown): unknown {
  const look = asRecord(value)
  if (look === null) return value
  return {
    ...look,
    elements: Array.isArray(look.elements)
      ? look.elements.map(projectTransformV12ToV11)
      : look.elements,
  }
}

function projectParticipantV12ToV11(value: unknown): unknown {
  const participant = asRecord(value)
  if (participant === null) return value
  const projected = asRecord(projectTransformV12ToV11(participant))
  if (projected === null) return value
  return {
    ...projected,
    elements: Array.isArray(participant.elements)
      ? participant.elements.map(projectTransformV12ToV11)
      : participant.elements,
  }
}

function projectPhotoV12ToV11(value: unknown): unknown {
  const photo = asRecord(value)
  if (photo === null) return value
  const { decorations: _decorations, ...withoutDecorations } = photo
  void _decorations
  return {
    ...withoutDecorations,
    participants: Array.isArray(photo.participants)
      ? photo.participants.map(projectParticipantV12ToV11)
      : photo.participants,
  }
}

function projectWardrobeV12ToV11(value: unknown): unknown {
  const wardrobe = asRecord(value)
  if (wardrobe === null) return value
  const looks = asRecord(wardrobe.looks)
  const photos = asRecord(wardrobe.photos)
  return {
    ...wardrobe,
    layoutVersion: 1,
    looks:
      looks === null
        ? wardrobe.looks
        : Object.fromEntries(
            Object.entries(looks).map(([lookId, look]) => [lookId, projectLookV12ToV11(look)]),
          ),
    photos:
      photos === null
        ? wardrobe.photos
        : Object.fromEntries(
            Object.entries(photos).map(([photoId, photo]) => [
              photoId,
              projectPhotoV12ToV11(photo),
            ]),
          ),
  }
}

function projectBackgroundV12ToPostcardId(value: unknown): unknown {
  const background = asRecord(value)
  if (background === null) return value
  return background.kind === 'postcard' ? background.id : null
}

function projectPomodoroV12ToV11(value: unknown): unknown {
  const pomodoro = asRecord(value)
  if (pomodoro === null) return value
  const { selectedBackground, session, ...pomodoroRest } = pomodoro
  const sessionRecord = asRecord(session)
  let projectedSession: unknown = session
  if (sessionRecord !== null) {
    const { background, ...sessionRest } = sessionRecord
    projectedSession = {
      ...sessionRest,
      postcardId: projectBackgroundV12ToPostcardId(background),
    }
  }
  return {
    ...pomodoroRest,
    selectedPostcardId: projectBackgroundV12ToPostcardId(selectedBackground),
    session: projectedSession,
  }
}

function refineGameStateV12(value: unknown, context: z.RefinementCtx) {
  const state = asRecord(value)
  const reality = asRecord(state?.reality)
  if (!state || !reality || state.schemaVersion !== 12) {
    context.addIssue({ code: 'custom', message: '不是严格的 V12 旅行饼狗存档' })
    return
  }

  const wardrobeResult = wardrobeStateV12Schema.safeParse(state.wardrobe)
  if (!wardrobeResult.success) {
    for (const issue of wardrobeResult.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['wardrobe', ...issue.path],
        message: issue.message,
      })
    }
  }
  const rewardResult = streamDailyRewardSchema.safeParse(reality.streamDailyReward)
  if (!rewardResult.success) {
    for (const issue of rewardResult.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'streamDailyReward', ...issue.path],
        message: issue.message,
      })
    }
  }

  const pomodoroResult = pomodoroStateV12Schema.safeParse(reality.pomodoro)
  if (!pomodoroResult.success) {
    for (const issue of pomodoroResult.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['reality', 'pomodoro', ...issue.path],
        message: issue.message,
      })
    }
  }

  const { streamDailyReward: _streamDailyReward, ...realityV11 } = reality
  void _streamDailyReward
  const v11Compatible = {
    ...state,
    schemaVersion: 11,
    reality: {
      ...realityV11,
      pomodoro: projectPomodoroV12ToV11(reality.pomodoro),
    },
    wardrobe: projectWardrobeV12ToV11(state.wardrobe),
  }
  const baseResult = gameStateV11Schema.safeParse(v11Compatible)
  if (!baseResult.success) {
    for (const issue of baseResult.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    }
  }

  if (
    !wardrobeResult.success ||
    !rewardResult.success ||
    !pomodoroResult.success ||
    !baseResult.success
  ) {
    return
  }
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
  for (const [photoId, photo] of Object.entries(wardrobe.photos)) {
    photo.decorations.forEach((decoration, index) => {
      if (!base.profile.debug && !owned.has(decoration.assetId)) {
        context.addIssue({
          code: 'custom',
          path: ['wardrobe', 'photos', photoId, 'decorations', index, 'assetId'],
          message: '合拍独立装饰只能引用已经收藏的服装',
        })
      }
    })
  }
  const photoBackgrounds = [
    pomodoroResult.data.selectedBackground,
    pomodoroResult.data.session?.background ?? null,
  ]
  for (const [index, background] of photoBackgrounds.entries()) {
    if (background?.kind === 'wardrobe-photo' && wardrobe.photos[background.id] === undefined) {
      context.addIssue({
        code: 'custom',
        path:
          index === 0
            ? ['reality', 'pomodoro', 'selectedBackground', 'id']
            : ['reality', 'pomodoro', 'session', 'background', 'id'],
        message: '苹果钟背景引用的合拍必须存在于当前相册',
      })
    }
  }
}

export const gameStateV12Schema: z.ZodType<GameStateV12> = z
  .unknown()
  .superRefine(refineGameStateV12) as z.ZodType<GameStateV12>

export function isStrictGameStateV12(value: unknown): value is GameStateV12 {
  return gameStateV12Schema.safeParse(value).success
}

function migrateTransform(transform: WardrobeTransformV11): WardrobeTransform {
  return {
    x: transform.x,
    y: transform.y,
    scaleX: transform.scale,
    scaleY: transform.scale,
    rotation: transform.rotation,
    z: transform.z,
  }
}

function migrateElement(element: WardrobeElementV11): WardrobeElement {
  return {
    placementId: element.placementId,
    assetId: element.assetId,
    ...migrateTransform(element),
  }
}

function migrateParticipant(participant: WardrobePhotoParticipantV11): WardrobePhotoParticipant {
  return {
    targetId: participant.targetId,
    sourceLookId: participant.sourceLookId,
    ...migrateTransform(participant),
    elements: participant.elements.map(migrateElement).sort((left, right) => left.z - right.z),
  }
}

export function migrateGameStateV11ToV12(state: GameStateV11): GameStateV12 {
  const cloned = structuredClone(state)
  const selectedPostcardId = cloned.reality.pomodoro.selectedPostcardId
  const previousSession = cloned.reality.pomodoro.session
  const nextLookSequence = repairNextSequence(
    cloned.wardrobe.nextLookSequence,
    Object.keys(cloned.wardrobe.looks),
    LOOK_ID_PATTERN,
  )
  const nextPhotoSequence = repairNextSequence(
    cloned.wardrobe.nextPhotoSequence,
    Object.keys(cloned.wardrobe.photos),
    PHOTO_ID_PATTERN,
  )
  return {
    ...cloned,
    schemaVersion: 12,
    reality: {
      ...cloned.reality,
      pomodoro: {
        nextSessionSequence: cloned.reality.pomodoro.nextSessionSequence,
        selectedBackground:
          selectedPostcardId === null ? null : { kind: 'postcard', id: selectedPostcardId },
        session:
          previousSession === null
            ? null
            : {
                sessionId: previousSession.sessionId,
                status: previousSession.status,
                startedAt: previousSession.startedAt,
                focusEndsAt: previousSession.focusEndsAt,
                cycleEndsAt: previousSession.cycleEndsAt,
                focusDurationMs: previousSession.focusDurationMs,
                breakDurationMs: previousSession.breakDurationMs,
                completedAt: previousSession.completedAt,
                focusNotificationIssuedAt: previousSession.focusNotificationIssuedAt,
                completionNotificationIssuedAt: previousSession.completionNotificationIssuedAt,
                todoId: previousSession.todoId,
                background:
                  previousSession.postcardId === null
                    ? null
                    : { kind: 'postcard', id: previousSession.postcardId },
              },
      },
      streamDailyReward: { lastRewardDateKey: null },
    },
    wardrobe: {
      ...cloned.wardrobe,
      layoutVersion: WARDROBE_LAYOUT_VERSION,
      nextLookSequence,
      looks: Object.fromEntries(
        Object.entries(cloned.wardrobe.looks).map(([lookId, look]) => [
          lookId,
          {
            ...look,
            elements: look.elements.map(migrateElement).sort((left, right) => left.z - right.z),
          },
        ]),
      ),
      photos: Object.fromEntries(
        Object.entries(cloned.wardrobe.photos).map(([photoId, photo]) => [
          photoId,
          {
            ...photo,
            participants: photo.participants
              .map(migrateParticipant)
              .sort((left, right) => left.z - right.z),
            decorations: [],
          },
        ]),
      ),
      nextPhotoSequence,
    },
  }
}

export type StoredGameState = StoredGameStateThroughV11 | GameStateV12

export function migrateStoredGameStateToV12(
  state: StoredGameState,
  options: MigrateGameStateV3Options,
): GameStateV12 {
  if (state.schemaVersion === 12) return state
  return migrateGameStateV11ToV12(migrateStoredGameStateToV11(state, options))
}
