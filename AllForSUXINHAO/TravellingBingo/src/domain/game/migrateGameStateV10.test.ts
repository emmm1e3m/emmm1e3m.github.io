import { describe, expect, it } from 'vitest'

import { gameStateSchema } from '@/app/gameStateSchema'

import { createInitialGameState } from './createGameState'
import {
  gameStateV11Schema,
  isStrictGameStateV11,
  migrateGameStateV10ToV11,
  migrateStoredGameStateToV11,
} from './migrateGameStateV10'
import { gameStateV10Schema, isStrictGameStateV10 } from './migrateGameStateV9'
import type { CollectionCatalog, GameStateV10, PomodoroState, PomodoroStateV12 } from './types'
import {
  generateWardrobeShop,
  MAX_WARDROBE_LOOKS_PER_TARGET,
  STARTER_WARDROBE_ASSET_IDS,
  WARDROBE_ASSET_IDS,
} from './wardrobe'

const catalog: CollectionCatalog = {
  postcard: ['postcard-2026-08-0001'],
  'million-shot': ['million-v11'],
  'site-first': ['first-v11'],
  siteFirstChronology: ['first-v11'],
}

function projectPomodoroV12ToLegacy(pomodoro: PomodoroStateV12): PomodoroState {
  const session =
    pomodoro.session === null
      ? null
      : (() => {
          const { background, ...legacySession } = pomodoro.session
          return {
            ...legacySession,
            postcardId: background?.kind === 'postcard' ? background.id : null,
          }
        })()
  return {
    nextSessionSequence: pomodoro.nextSessionSequence,
    selectedPostcardId:
      pomodoro.selectedBackground?.kind === 'postcard' ? pomodoro.selectedBackground.id : null,
    session,
  }
}

function v10Fixture(): GameStateV10 {
  const current = createInitialGameState({ now: 1_000, seed: 'strict-v10-to-v11' })
  const { wardrobe: _wardrobe, ...v10 } = structuredClone(current)
  void _wardrobe
  return {
    ...v10,
    schemaVersion: 10,
    reality: {
      nextStaySequence: current.reality.nextStaySequence,
      activeStay: structuredClone(current.reality.activeStay),
      pendingSettlement: structuredClone(current.reality.pendingSettlement),
      todos: structuredClone(current.reality.todos),
      pomodoro: projectPomodoroV12ToLegacy(current.reality.pomodoro),
      streamHistory: structuredClone(current.reality.streamHistory),
      streamSettings: structuredClone(current.reality.streamSettings),
    },
  }
}

describe('schemaVersion 10 -> 11 显式迁移', () => {
  it('不修改冻结的 V10 输入，并按种子与当前游戏日生成初始衣柜', () => {
    const v10 = v10Fixture()
    v10.profile.companionDays = 7
    const before = structuredClone(v10)
    const migrated = migrateGameStateV10ToV11(v10)

    expect(v10).toEqual(before)
    expect(migrated).toMatchObject({
      schemaVersion: 11,
      wardrobe: {
        layoutVersion: 1,
        shop: {
          companionDay: 7,
          assetIds: generateWardrobeShop(v10.random.seed, 7, STARTER_WARDROBE_ASSET_IDS),
        },
        ownedAssetIds: [...STARTER_WARDROBE_ASSET_IDS],
        nextLookSequence: 0,
        looks: {},
        nextPhotoSequence: 0,
        photos: {},
      },
    })
    expect(gameStateV11Schema.safeParse(migrated).success).toBe(true)
    expect(isStrictGameStateV10(migrated)).toBe(false)
  })

  it('V1-V10 先收敛到 V10 再迁移，严格 V11 原引用返回', () => {
    const migrated = migrateStoredGameStateToV11(v10Fixture(), { now: 2_000, catalog })
    expect(migrated.schemaVersion).toBe(11)
    expect(migrateStoredGameStateToV11(migrated, { now: 3_000, catalog })).toBe(migrated)
  })

  it('迁移尚未领取的旧睡觉活动时移除已冻结的苹果奖励', () => {
    const v10 = v10Fixture()
    v10.activeActivity = {
      runId: 'rest-before-v11',
      kind: 'rest',
      startedAt: 1_500,
      endsAt: 2_500,
      rewardSeed: 'legacy-rest-reward',
      rewardPlan: {
        baseApples: 1,
        modifierApples: 0,
        collection: null,
        friendId: null,
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: null,
      usedLuckyApple: false,
    }

    const migrated = migrateGameStateV10ToV11(v10)
    expect(v10.activeActivity.rewardPlan.baseApples).toBe(1)
    expect(migrated.activeActivity?.rewardPlan.baseApples).toBe(0)
    expect(isStrictGameStateV11(migrated)).toBe(true)
  })

  it('冻结 V10 继续拒绝 wardrobe，新 V11 拒绝缺失与多余字段', () => {
    const current = migrateGameStateV10ToV11(v10Fixture())
    expect(isStrictGameStateV11(current)).toBe(true)
    expect(gameStateV10Schema.safeParse(current).success).toBe(false)
    expect(isStrictGameStateV11({ ...current, unexpected: true })).toBe(false)

    const missing = structuredClone(current) as unknown as Record<string, unknown>
    delete missing.wardrobe
    expect(isStrictGameStateV11(missing)).toBe(false)

    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: { ...current.wardrobe, unexpected: true },
      }),
    ).toBe(false)
  })

  it('当前导出 schema 面对非对象输入时只返回校验失败', () => {
    expect(() => gameStateSchema.safeParse(null)).not.toThrow()
    expect(gameStateSchema.safeParse(null).success).toBe(false)
  })

  it('严格拒绝未知服装、重复、超量或不可由本日购买记录重建的商店', () => {
    const current = migrateGameStateV10ToV11(v10Fixture())
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          shop: {
            ...current.wardrobe.shop,
            companionDay: current.wardrobe.shop.companionDay + 1,
          },
        },
      }),
    ).toBe(false)
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          shop: {
            ...current.wardrobe.shop,
            assetIds: [
              current.wardrobe.shop.assetIds[0],
              current.wardrobe.shop.assetIds[0],
              current.wardrobe.shop.assetIds[2],
            ],
          },
        },
      }),
    ).toBe(false)
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          shop: {
            ...current.wardrobe.shop,
            assetIds: WARDROBE_ASSET_IDS.filter((assetId) => assetId !== 'cream-apple-cape').slice(
              0,
              4,
            ),
          },
        },
      }),
    ).toBe(false)
    const replacement = WARDROBE_ASSET_IDS.find(
      (assetId) =>
        assetId !== 'cream-apple-cape' && !current.wardrobe.shop.assetIds.includes(assetId),
    )!
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          shop: {
            ...current.wardrobe.shop,
            assetIds: [
              replacement,
              current.wardrobe.shop.assetIds[1],
              current.wardrobe.shop.assetIds[2],
            ],
          },
        },
      }),
    ).toBe(false)
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          shop: {
            ...current.wardrobe.shop,
            assetIds: [
              current.wardrobe.shop.assetIds[1],
              current.wardrobe.shop.assetIds[0],
              current.wardrobe.shop.assetIds[2],
            ],
          },
        },
      }),
    ).toBe(true)
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          shop: {
            ...current.wardrobe.shop,
            assetIds: [
              'cream-apple-cape',
              current.wardrobe.shop.assetIds[1],
              current.wardrobe.shop.assetIds[2],
            ],
          },
        },
      }),
    ).toBe(false)
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          ownedAssetIds: [...current.wardrobe.ownedAssetIds, 'unknown-clothing'],
        },
      }),
    ).toBe(false)
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          looks: {
            'look-0-x': {
              lookId: 'look-0-x',
              targetId: 'bingo',
              name: '越界造型',
              createdAt: 2_000,
              updatedAt: 2_000,
              elements: [
                {
                  placementId: 'cape-0',
                  assetId: 'cream-apple-cape',
                  x: 1.5,
                  y: 0.5,
                  scale: 1,
                  rotation: 0,
                  z: 0,
                },
              ],
            },
          },
        },
      }),
    ).toBe(false)
  })

  it('严格接受当天购买一至三件后的冻结商店，以及余量不足三件的刷新结果', () => {
    const current = migrateGameStateV10ToV11(v10Fixture())
    for (let purchasedCount = 1; purchasedCount <= 3; purchasedCount += 1) {
      expect(
        isStrictGameStateV11({
          ...current,
          wardrobe: {
            ...current.wardrobe,
            ownedAssetIds: [
              ...current.wardrobe.ownedAssetIds,
              ...current.wardrobe.shop.assetIds.slice(0, purchasedCount),
            ],
          },
        }),
      ).toBe(true)
    }

    const remaining: (typeof WARDROBE_ASSET_IDS)[number][] = [
      'green-sailor-top',
      'red-ruffle-dress',
    ]
    const nearlyCompleteOwned = WARDROBE_ASSET_IDS.filter((assetId) => !remaining.includes(assetId))
    const shortShop = generateWardrobeShop(
      current.random.seed,
      current.profile.companionDays,
      nearlyCompleteOwned,
    )
    expect(shortShop).toHaveLength(2)
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          ownedAssetIds: nearlyCompleteOwned,
          shop: { ...current.wardrobe.shop, assetIds: shortShop },
        },
      }),
    ).toBe(true)
  })

  it('普通存档拒绝未遇见好友合拍与超长照片 ID，DEBUG 历史合拍可以保留', () => {
    const current = migrateGameStateV10ToV11(v10Fixture())
    const photo = {
      photoId: 'photo-0-x',
      postcardId: null,
      createdAt: 2_000,
      participants: [
        {
          targetId: 'bingo',
          sourceLookId: null,
          x: 0.4,
          y: 0.5,
          scale: 1,
          rotation: 0,
          z: 0,
          elements: [],
        },
        {
          targetId: 'bili-bing',
          sourceLookId: null,
          x: 0.6,
          y: 0.5,
          scale: 1,
          rotation: 0,
          z: 1,
          elements: [],
        },
      ],
    } as const
    const withUnknownFriendPhoto = {
      ...current,
      wardrobe: {
        ...current.wardrobe,
        nextPhotoSequence: 1,
        photos: { [photo.photoId]: photo },
      },
    }
    expect(isStrictGameStateV11(withUnknownFriendPhoto)).toBe(false)
    expect(
      isStrictGameStateV11({
        ...withUnknownFriendPhoto,
        profile: { ...withUnknownFriendPhoto.profile, debug: true },
      }),
    ).toBe(true)

    const longPhotoId = `photo-${'a'.repeat(12)}-x`
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          photos: {
            [longPhotoId]: {
              ...photo,
              photoId: longPhotoId,
              participants: [photo.participants[0]],
            },
          },
        },
      }),
    ).toBe(false)
  })

  it('严格拒绝无来源造型的非空快照与跨角色来源，同时允许已删除造型的历史引用', () => {
    const current = migrateGameStateV10ToV11(v10Fixture())
    const look = {
      lookId: 'look-0-x',
      targetId: 'bingo' as const,
      name: '饼狗造型',
      elements: [],
      createdAt: 2_000,
      updatedAt: 2_000,
    }
    const participant = {
      targetId: 'bingo' as const,
      sourceLookId: null,
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
      z: 0,
      elements: [],
    }
    const photo = {
      photoId: 'photo-0-x',
      postcardId: null,
      participants: [participant],
      createdAt: 2_000,
    }

    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          nextLookSequence: 1,
          nextPhotoSequence: 1,
          looks: { [look.lookId]: look },
          photos: {
            [photo.photoId]: {
              ...photo,
              participants: [
                {
                  ...participant,
                  sourceLookId: look.lookId,
                  targetId: 'class-representative-bing',
                },
              ],
            },
          },
        },
        friends: {
          ...current.friends,
          'class-representative-bing': {
            id: 'class-representative-bing',
            firstMetAt: 1_000,
            lastMetAt: 1_000,
            encounterCount: 1,
            totalGiftApples: 0,
          },
        },
      }),
    ).toBe(false)

    const capeSnapshot = {
      placementId: 'cape-0',
      assetId: 'cream-apple-cape' as const,
      x: 0.5,
      y: 0.76,
      scale: 0.48,
      rotation: 0,
      z: 20,
    }
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          nextPhotoSequence: 1,
          photos: {
            [photo.photoId]: {
              ...photo,
              participants: [{ ...participant, elements: [capeSnapshot] }],
            },
          },
        },
      }),
    ).toBe(false)

    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          nextPhotoSequence: 1,
          photos: {
            [photo.photoId]: {
              ...photo,
              participants: [
                { ...participant, sourceLookId: 'look-9-gone', elements: [capeSnapshot] },
              ],
            },
          },
        },
      }),
    ).toBe(true)
  })

  it('严格 schema 限制每位角色的造型数量，并要求索引、名称和时间一致', () => {
    const current = migrateGameStateV10ToV11(v10Fixture())
    const looks = Object.fromEntries(
      Array.from({ length: MAX_WARDROBE_LOOKS_PER_TARGET + 1 }, (_, index) => {
        const lookId = `look-${index.toString(36)}-x`
        return [
          lookId,
          {
            lookId,
            targetId: 'bingo',
            name: `造型${index + 1}`,
            elements: [],
            createdAt: 2_000,
            updatedAt: 2_000,
          },
        ]
      }),
    )
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: { ...current.wardrobe, nextLookSequence: 9, looks },
      }),
    ).toBe(false)

    const validLook = looks['look-0-x']
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          looks: { 'look-0-x': { ...validLook, lookId: 'look-1-x' } },
        },
      }),
    ).toBe(false)
    expect(
      isStrictGameStateV11({
        ...current,
        wardrobe: {
          ...current.wardrobe,
          looks: {
            'look-0-x': { ...validLook, name: ' 首尾空格 ', updatedAt: 1_999 },
          },
        },
      }),
    ).toBe(false)
  })
})
