import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { createInitialWardrobeStateV11, isStrictGameStateV11 } from './migrateGameStateV10'
import { isStrictGameStateV12, migrateGameStateV11ToV12 } from './migrateGameStateV11'
import type { GameStateV11, GameStateV12, WardrobePhotoDecoration } from './types'
import { MAX_WARDROBE_PHOTO_DECORATIONS, reduceWardrobe } from './wardrobe'

const POSTCARD_ID = 'postcard-2026-08-0001'
const LOOK_ID = 'look-0-x'
const PHOTO_ID = 'photo-0-x'

function v11Fixture(): GameStateV11 {
  const current = createInitialGameState({ now: 1_000, seed: 'strict-v11-to-v12' })
  const cloned = structuredClone(current)
  const { streamDailyReward: _streamDailyReward, ...realityWithoutReward } = cloned.reality
  void _streamDailyReward

  return {
    ...cloned,
    schemaVersion: 11,
    reality: {
      ...realityWithoutReward,
      pomodoro: {
        nextSessionSequence: 0,
        selectedPostcardId: null,
        session: null,
      },
    },
    wardrobe: createInitialWardrobeStateV11(cloned.random.seed, cloned.profile.companionDays),
  }
}

function legacyStateWithPhoto(): GameStateV11 {
  const state = v11Fixture()
  const focusDurationMs = 25 * 60 * 1_000
  const breakDurationMs = 5 * 60 * 1_000
  const startedAt = 2_000
  const focusEndsAt = startedAt + focusDurationMs

  state.collections[POSTCARD_ID] = {
    id: POSTCARD_ID,
    firstObtainedAt: 1_100,
    duplicateCount: 0,
  }
  state.reality.pomodoro = {
    nextSessionSequence: 1,
    selectedPostcardId: POSTCARD_ID,
    session: {
      sessionId: 'pomodoro-0',
      status: 'focus',
      startedAt,
      focusEndsAt,
      cycleEndsAt: focusEndsAt + breakDurationMs,
      focusDurationMs,
      breakDurationMs,
      completedAt: null,
      focusNotificationIssuedAt: null,
      completionNotificationIssuedAt: null,
      todoId: null,
      postcardId: POSTCARD_ID,
    },
  }
  state.wardrobe.nextLookSequence = 1
  state.wardrobe.looks[LOOK_ID] = {
    lookId: LOOK_ID,
    targetId: 'bingo',
    name: '苹果斗篷',
    elements: [
      {
        placementId: 'cape-high',
        assetId: 'cream-apple-cape',
        x: 0.52,
        y: 0.72,
        scale: 0.8,
        rotation: 5,
        z: 20,
      },
      {
        placementId: 'cape-low',
        assetId: 'cream-apple-cape',
        x: 0.48,
        y: 0.7,
        scale: 0.6,
        rotation: -5,
        z: 10,
      },
    ],
    createdAt: 1_200,
    updatedAt: 1_300,
  }
  state.wardrobe.nextPhotoSequence = 1
  state.wardrobe.photos[PHOTO_ID] = {
    photoId: PHOTO_ID,
    postcardId: POSTCARD_ID,
    participants: [
      {
        targetId: 'bingo',
        sourceLookId: LOOK_ID,
        x: 0.5,
        y: 0.55,
        scale: 1.25,
        rotation: 3,
        z: 0,
        elements: structuredClone(state.wardrobe.looks[LOOK_ID].elements),
      },
    ],
    createdAt: 1_400,
  }
  return state
}

function migratedStateWithPhoto(): GameStateV12 {
  return migrateGameStateV11ToV12(legacyStateWithPhoto())
}

function decoration(index: number, z = index + 1): WardrobePhotoDecoration {
  return {
    placementId: `decoration-${index}`,
    assetId: 'cream-apple-cape',
    x: 0.2 + index * 0.01,
    y: 0.25,
    scaleX: 0.4,
    scaleY: 0.4,
    rotation: 0,
    z,
  }
}

describe('schemaVersion 11 -> 12 显式迁移', () => {
  it('不修改冻结 V11，并迁移双轴、装饰数组、每日奖励与苹果钟背景', () => {
    const legacy = legacyStateWithPhoto()
    const before = structuredClone(legacy)
    expect(isStrictGameStateV11(legacy)).toBe(true)

    const migrated = migrateGameStateV11ToV12(legacy)

    expect(legacy).toEqual(before)
    expect(migrated.schemaVersion).toBe(12)
    expect(migrated.reality.streamDailyReward).toEqual({ lastRewardDateKey: null })
    expect(migrated.reality.pomodoro.selectedBackground).toEqual({
      kind: 'postcard',
      id: POSTCARD_ID,
    })
    expect(migrated.reality.pomodoro.session?.background).toEqual({
      kind: 'postcard',
      id: POSTCARD_ID,
    })
    expect(migrated.wardrobe.layoutVersion).toBe(2)
    expect(migrated.wardrobe.looks[LOOK_ID].elements).toMatchObject([
      { placementId: 'cape-low', scaleX: 0.6, scaleY: 0.6, z: 10 },
      { placementId: 'cape-high', scaleX: 0.8, scaleY: 0.8, z: 20 },
    ])
    expect(migrated.wardrobe.photos[PHOTO_ID]).toMatchObject({
      postcardId: POSTCARD_ID,
      decorations: [],
      participants: [
        {
          targetId: 'bingo',
          sourceLookId: LOOK_ID,
          scaleX: 1.25,
          scaleY: 1.25,
          z: 0,
          elements: [
            { placementId: 'cape-low', scaleX: 0.6, scaleY: 0.6, z: 10 },
            { placementId: 'cape-high', scaleX: 0.8, scaleY: 0.8, z: 20 },
          ],
        },
      ],
    })
    expect(isStrictGameStateV12(migrated)).toBe(true)
  })

  it('迁移会修复 V11 遗留的造型与合拍计数器，V12 严格拒绝回拨后的计数器', () => {
    const legacy = legacyStateWithPhoto()
    legacy.wardrobe.nextLookSequence = 0
    legacy.wardrobe.nextPhotoSequence = 0
    expect(isStrictGameStateV11(legacy)).toBe(true)

    const migrated = migrateGameStateV11ToV12(legacy)
    expect(migrated.wardrobe.nextLookSequence).toBe(1)
    expect(migrated.wardrobe.nextPhotoSequence).toBe(1)
    expect(isStrictGameStateV12(migrated)).toBe(true)

    migrated.wardrobe.nextLookSequence = 0
    expect(isStrictGameStateV12(migrated)).toBe(false)

    migrated.wardrobe.nextLookSequence = 1
    migrated.wardrobe.nextPhotoSequence = 0
    expect(isStrictGameStateV12(migrated)).toBe(false)
  })

  it('序号迁移覆盖安全整数边界，并保持冻结 V11 中不可生成 ID 的兼容性', () => {
    const edgeSequence = Number.MAX_SAFE_INTEGER - 1
    const edgeLookId = `look-${edgeSequence.toString(36)}-x`
    const legacy = v11Fixture()
    legacy.wardrobe.looks[edgeLookId] = {
      lookId: edgeLookId,
      targetId: 'bingo',
      name: '边界造型',
      elements: [],
      createdAt: 1_100,
      updatedAt: 1_100,
    }
    const migrated = migrateGameStateV11ToV12(legacy)
    expect(migrated.wardrobe.nextLookSequence).toBe(Number.MAX_SAFE_INTEGER)
    expect(isStrictGameStateV12(migrated)).toBe(true)
    const createAtLimit = reduceWardrobe(
      migrated,
      {
        type: 'wardrobe/look-create',
        targetId: 'bingo',
        name: '不会覆盖',
        elements: [],
        now: 1_200,
      },
      { postcard: [], 'million-shot': [], 'site-first': [], siteFirstChronology: [] },
    )
    expect(createAtLimit).toMatchObject({ ok: false, error: { code: 'INVALID_AMOUNT' } })
    expect(createAtLimit.state).toBe(migrated)

    const opaqueLegacy = v11Fixture()
    for (const lookId of ['look-2gosa7pa2gv-x', 'look-zzzzzzzzzzz-y']) {
      opaqueLegacy.wardrobe.looks[lookId] = {
        lookId,
        targetId: 'bingo',
        name: '旧格式边界',
        elements: [],
        createdAt: 1_100,
        updatedAt: 1_100,
      }
    }
    expect(isStrictGameStateV11(opaqueLegacy)).toBe(true)
    const migratedOpaque = migrateGameStateV11ToV12(opaqueLegacy)
    expect(migratedOpaque.wardrobe.nextLookSequence).toBe(0)
    expect(isStrictGameStateV12(migratedOpaque)).toBe(true)

    const paddedLegacy = v11Fixture()
    const paddedLookId = 'look-00000000001-x'
    paddedLegacy.wardrobe.looks[paddedLookId] = {
      lookId: paddedLookId,
      targetId: 'bingo',
      name: '前导零',
      elements: [],
      createdAt: 1_100,
      updatedAt: 1_100,
    }
    expect(migrateGameStateV11ToV12(paddedLegacy).wardrobe.nextLookSequence).toBe(2)
  })

  it('V12 按 base36 序号而非记录数量校验计数器，并允许删除后的序号空洞', () => {
    const state = migratedStateWithPhoto()
    const base36LookId = 'look-z-x'
    state.wardrobe.looks[base36LookId] = {
      ...state.wardrobe.looks[LOOK_ID],
      lookId: base36LookId,
    }
    delete state.wardrobe.looks[LOOK_ID]
    state.wardrobe.photos[PHOTO_ID].participants[0].sourceLookId = base36LookId
    state.wardrobe.nextLookSequence = 35
    expect(isStrictGameStateV12(state)).toBe(false)

    state.wardrobe.nextLookSequence = 36
    expect(isStrictGameStateV12(state)).toBe(true)

    delete state.wardrobe.looks[base36LookId]
    delete state.wardrobe.photos[PHOTO_ID]
    expect(isStrictGameStateV12(state)).toBe(true)
  })

  it('严格 V12 要求 decorations 存在、不过量且每项没有额外字段', () => {
    const missing = migratedStateWithPhoto()
    delete (missing.wardrobe.photos[PHOTO_ID] as unknown as Record<string, unknown>).decorations
    expect(isStrictGameStateV12(missing)).toBe(false)

    const overflow = migratedStateWithPhoto()
    overflow.wardrobe.photos[PHOTO_ID].decorations = Array.from(
      { length: MAX_WARDROBE_PHOTO_DECORATIONS + 1 },
      (_, index) => decoration(index),
    )
    expect(isStrictGameStateV12(overflow)).toBe(false)

    const unexpected = migratedStateWithPhoto()
    unexpected.wardrobe.photos[PHOTO_ID].decorations = [decoration(0)]
    ;(
      unexpected.wardrobe.photos[PHOTO_ID].decorations[0] as unknown as Record<string, unknown>
    ).unexpected = true
    expect(isStrictGameStateV12(unexpected)).toBe(false)
  })

  it('严格 V12 拒绝旧 scale 额外字段与两个轴上的非法缩放', () => {
    const extraTransform = migratedStateWithPhoto()
    ;(
      extraTransform.wardrobe.photos[PHOTO_ID].participants[0] as unknown as Record<string, unknown>
    ).scale = 1
    expect(isStrictGameStateV12(extraTransform)).toBe(false)

    const invalidScaleX = migratedStateWithPhoto()
    invalidScaleX.wardrobe.looks[LOOK_ID].elements[0].scaleX = 0
    expect(isStrictGameStateV12(invalidScaleX)).toBe(false)

    const invalidScaleY = migratedStateWithPhoto()
    invalidScaleY.wardrobe.photos[PHOTO_ID].participants[0].scaleY = Number.POSITIVE_INFINITY
    expect(isStrictGameStateV12(invalidScaleY)).toBe(false)
  })

  it('严格 V12 拒绝角色与独立装饰共用全局 z', () => {
    const state = migratedStateWithPhoto()
    state.wardrobe.photos[PHOTO_ID].decorations = [
      decoration(0, state.wardrobe.photos[PHOTO_ID].participants[0].z),
    ]

    expect(isStrictGameStateV12(state)).toBe(false)
  })

  it('苹果钟可以引用现有合拍，但所选或会话背景不能引用不存在的合拍', () => {
    const existing = migratedStateWithPhoto()
    existing.reality.pomodoro.selectedBackground = { kind: 'wardrobe-photo', id: PHOTO_ID }
    expect(isStrictGameStateV12(existing)).toBe(true)

    const missingSelected = migratedStateWithPhoto()
    missingSelected.reality.pomodoro.selectedBackground = {
      kind: 'wardrobe-photo',
      id: 'photo-9-gone',
    }
    expect(isStrictGameStateV12(missingSelected)).toBe(false)

    const missingSession = migratedStateWithPhoto()
    missingSession.reality.pomodoro.session!.background = {
      kind: 'wardrobe-photo',
      id: 'photo-9-gone',
    }
    expect(isStrictGameStateV12(missingSession)).toBe(false)
  })

  it('保留冻结 V11 的任意非空明信片 ID，并严格拒绝苹果钟旧键与非法引用形状', () => {
    const legacy = v11Fixture()
    legacy.reality.pomodoro.selectedPostcardId = 'postcard-custom'
    legacy.collections['postcard-custom'] = {
      id: 'postcard-custom',
      firstObtainedAt: 1_100,
      duplicateCount: 0,
    }
    const migrated = migrateGameStateV11ToV12(legacy)
    expect(migrated.reality.pomodoro.selectedBackground).toEqual({
      kind: 'postcard',
      id: 'postcard-custom',
    })
    expect(isStrictGameStateV12(migrated)).toBe(true)

    const oldSelectedKey = structuredClone(migrated)
    ;(oldSelectedKey.reality.pomodoro as unknown as Record<string, unknown>).selectedPostcardId =
      'postcard-custom'
    expect(isStrictGameStateV12(oldSelectedKey)).toBe(false)

    const oldSessionKey = migratedStateWithPhoto()
    ;(oldSessionKey.reality.pomodoro.session as unknown as Record<string, unknown>).postcardId =
      POSTCARD_ID
    expect(isStrictGameStateV12(oldSessionKey)).toBe(false)

    const invalidKind = structuredClone(migrated)
    invalidKind.reality.pomodoro.selectedBackground = {
      kind: 'postcard',
      id: '',
    }
    expect(isStrictGameStateV12(invalidKind)).toBe(false)
  })

  it('严格 V12 拒绝语法正确但并不存在的本地日期', () => {
    const state = migratedStateWithPhoto()
    state.reality.streamDailyReward.lastRewardDateKey = '2026-02-30'

    expect(isStrictGameStateV12(state)).toBe(false)
  })

  it('造型删除后仍接受合拍中的历史 sourceLookId 与冻结快照', () => {
    const state = migratedStateWithPhoto()
    delete state.wardrobe.looks[LOOK_ID]

    expect(state.wardrobe.photos[PHOTO_ID].participants[0]).toMatchObject({
      sourceLookId: LOOK_ID,
      elements: [{ placementId: 'cape-low' }, { placementId: 'cape-high' }],
    })
    expect(isStrictGameStateV12(state)).toBe(true)
  })

  it('V12 投影到冻结 V11 校验时不会吞掉导入对象的额外字段', () => {
    const state = migratedStateWithPhoto()
    ;(state.profile as unknown as Record<string, unknown>).unexpectedImportedField = true

    expect(isStrictGameStateV12(state)).toBe(false)
  })
})
