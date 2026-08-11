import { webcrypto } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { gameStateSchema } from '@/app/gameStateSchema'
import { createBingoSave, MAX_BINGO_SAVE_BYTES } from '@/infrastructure/persistence'

import { createInitialGameState } from './createGameState'
import { reduceGame } from './reducer'
import type {
  CollectionCatalog,
  GameState,
  GameTransition,
  WardrobeAssetId,
  WardrobeElement,
  WardrobePhotoParticipant,
  WardrobeTargetId,
} from './types'
import {
  generateWardrobeShop,
  getAvailableWardrobeTargets,
  getSavedWardrobeLooks,
  getWardrobeCatalogItem,
  getWardrobeShopItems,
  MAX_WARDROBE_LOOK_ELEMENTS,
  MAX_WARDROBE_LOOKS_PER_TARGET,
  MAX_WARDROBE_PHOTOS,
  reduceWardrobe,
  WARDROBE_ASSET_IDS,
  WARDROBE_CATALOG,
} from './wardrobe'

const postcardId = 'postcard-2026-08-0001'
const catalog: CollectionCatalog = {
  postcard: [postcardId],
  'million-shot': ['million-wardrobe'],
  'site-first': ['first-wardrobe'],
  siteFirstChronology: ['first-wardrobe'],
}

function successful(transition: GameTransition): Extract<GameTransition, { ok: true }> {
  if (!transition.ok) throw new Error(`${transition.error.code}: ${transition.error.message}`)
  return transition
}

function transform(z = 0) {
  return { x: 0.5, y: 0.5, scale: 1, rotation: 0, z }
}

function friendEntry(id: 'class-representative-bing') {
  return {
    id,
    firstMetAt: 100,
    lastMetAt: 100,
    encounterCount: 1,
    totalGiftApples: 0,
  } as const
}

describe('奇迹饼狗衣柜领域', () => {
  it('目录固定包含 8 套服装与 16 件配饰，价格为 3–7🍎且平均 5🍎', () => {
    expect(WARDROBE_CATALOG).toHaveLength(24)
    expect(WARDROBE_CATALOG.filter((item) => item.category === 'outfit')).toHaveLength(8)
    expect(WARDROBE_CATALOG.filter((item) => item.category !== 'outfit')).toHaveLength(16)
    expect(WARDROBE_CATALOG.every((item) => item.priceApples >= 3 && item.priceApples <= 7)).toBe(
      true,
    )
    expect(
      WARDROBE_CATALOG.reduce((total, item) => total + item.priceApples, 0) /
        WARDROBE_CATALOG.length,
    ).toBe(5)
    expect(WARDROBE_ASSET_IDS).toContain('black-tie-uniform')
    expect(WARDROBE_ASSET_IDS).not.toContain('black-bone-tee')
    expect(WARDROBE_CATALOG.every((item) => item.defaultTransform.scale > 0)).toBe(true)
  })

  it('同一种子与游戏日始终生成相同三件不同商品，现实时间不参与刷新', () => {
    const first = generateWardrobeShop('daily-shop', 7, ['cream-apple-cape'])
    const repeated = generateWardrobeShop('daily-shop', 7, ['cream-apple-cape'])
    expect(repeated).toEqual(first)
    expect(new Set(first).size).toBe(3)
    expect(first.every((assetId) => getWardrobeCatalogItem(assetId) !== undefined)).toBe(true)

    const remaining: WardrobeAssetId[] = ['green-sailor-top', 'red-ruffle-dress']
    const nearlyComplete = WARDROBE_ASSET_IDS.filter((assetId) => !remaining.includes(assetId))
    const finalShop = generateWardrobeShop('daily-shop', 8, nearlyComplete)
    expect(finalShop).toHaveLength(2)
    expect(new Set(finalShop)).toEqual(new Set(remaining))
    expect(generateWardrobeShop('daily-shop', 9, WARDROBE_ASSET_IDS)).toEqual([])
  })

  it('只购买当天商品并原子扣除价格，重复购买和余额不足不改状态', () => {
    const initial = createInitialGameState({ now: 0, seed: 'wardrobe-purchase' })
    const assetId = initial.wardrobe.shop.assetIds[0]
    const item = getWardrobeCatalogItem(assetId)!
    const purchased = successful(
      reduceWardrobe(initial, { type: 'wardrobe/item-purchase', assetId }, catalog),
    )
    expect(purchased.state.economy.apples).toBe(initial.economy.apples - item.priceApples)
    expect(purchased.state.wardrobe.ownedAssetIds).toContain(assetId)
    expect(purchased.state.wardrobe.shop.assetIds).toEqual(initial.wardrobe.shop.assetIds)
    expect(gameStateSchema.safeParse(purchased.state).success).toBe(true)
    expect(getWardrobeShopItems(purchased.state).map((item) => item.id)).toEqual(
      initial.wardrobe.shop.assetIds.filter((candidate) => candidate !== assetId),
    )
    expect(purchased.effects).toEqual([
      { type: 'wardrobe-item-purchased', assetId, applesSpent: item.priceApples },
    ])

    const duplicate = reduceWardrobe(
      purchased.state,
      { type: 'wardrobe/item-purchase', assetId },
      catalog,
    )
    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: 'WARDROBE_ITEM_ALREADY_OWNED' },
    })
    expect(duplicate.state).toBe(purchased.state)

    const secondAssetId = initial.wardrobe.shop.assetIds[1]
    const emptyWallet = { ...initial, economy: { apples: 0 } }
    const insufficient = reduceWardrobe(
      emptyWallet,
      { type: 'wardrobe/item-purchase', assetId: secondAssetId },
      catalog,
    )
    expect(insufficient).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_APPLES' } })
    expect(insufficient.state).toBe(emptyWallet)
  })

  it('每位角色可保存、更新和删除多套造型，同一已购元素可以重复放置', () => {
    const initial = createInitialGameState({ now: 0, seed: 'wardrobe-look' })
    const unknownFriend = reduceWardrobe(
      initial,
      {
        type: 'wardrobe/look-create',
        targetId: 'class-representative-bing',
        name: '出门装',
        elements: [],
        now: 100,
      },
      catalog,
    )
    expect(unknownFriend).toMatchObject({
      ok: false,
      error: { code: 'WARDROBE_TARGET_LOCKED' },
    })

    const metFriend: GameState = {
      ...initial,
      friends: { 'class-representative-bing': friendEntry('class-representative-bing') },
    }
    expect(getAvailableWardrobeTargets(metFriend)).toEqual(['bingo', 'class-representative-bing'])
    const elements: WardrobeElement[] = [
      {
        placementId: 'cape-left',
        assetId: 'cream-apple-cape',
        ...transform(0),
      },
      {
        placementId: 'cape-right',
        assetId: 'cream-apple-cape',
        ...transform(1),
      },
    ]
    const firstCreated = successful(
      reduceWardrobe(
        metFriend,
        {
          type: 'wardrobe/look-create',
          targetId: 'class-representative-bing',
          name: '左右披肩',
          elements,
          now: 200,
        },
        catalog,
      ),
    )
    const firstEffect = firstCreated.effects[0]
    if (firstEffect?.type !== 'wardrobe-look-created') throw new Error('没有创建造型')
    const firstLookId = firstEffect.look.lookId
    const secondCreated = successful(
      reduceWardrobe(
        firstCreated.state,
        {
          type: 'wardrobe/look-create',
          targetId: 'class-representative-bing',
          name: '轻装',
          elements: [],
          now: 300,
        },
        catalog,
      ),
    )
    const secondEffect = secondCreated.effects[0]
    if (secondEffect?.type !== 'wardrobe-look-created') throw new Error('没有创建第二套造型')
    expect(getSavedWardrobeLooks(secondCreated.state, 'class-representative-bing')).toHaveLength(2)

    const updated = successful(
      reduceWardrobe(
        secondCreated.state,
        {
          type: 'wardrobe/look-update',
          lookId: firstLookId,
          name: '  正式披肩  ',
          elements,
          now: 400,
        },
        catalog,
      ),
    )
    expect(updated.state.wardrobe.looks[firstLookId]).toMatchObject({
      lookId: firstLookId,
      name: '正式披肩',
      createdAt: 200,
      updatedAt: 400,
      elements,
    })

    const deleted = successful(
      reduceWardrobe(
        updated.state,
        { type: 'wardrobe/look-delete', lookId: secondEffect.look.lookId },
        catalog,
      ),
    )
    expect(getSavedWardrobeLooks(deleted.state, 'class-representative-bing')).toHaveLength(1)

    const duplicateZ = reduceWardrobe(
      metFriend,
      {
        type: 'wardrobe/look-create',
        targetId: 'bingo',
        name: '重复图层',
        elements: elements.map((element) => ({ ...element, z: 0 })),
        now: 200,
      },
      catalog,
    )
    expect(duplicateZ).toMatchObject({
      ok: false,
      error: { code: 'WARDROBE_LOOK_INVALID' },
    })
  })

  it('每位角色最多保存八套造型，失败时保持原状态引用', () => {
    let state = createInitialGameState({ now: 0, seed: 'wardrobe-look-limit' })
    for (let index = 0; index < MAX_WARDROBE_LOOKS_PER_TARGET; index += 1) {
      state = successful(
        reduceWardrobe(
          state,
          {
            type: 'wardrobe/look-create',
            targetId: 'bingo',
            name: `造型 ${index + 1}`,
            elements: [],
            now: index + 1,
          },
          catalog,
        ),
      ).state
    }
    const denied = reduceWardrobe(
      state,
      {
        type: 'wardrobe/look-create',
        targetId: 'bingo',
        name: '第九套',
        elements: [],
        now: 20,
      },
      catalog,
    )
    expect(denied).toMatchObject({ ok: false, error: { code: 'WARDROBE_LOOK_LIMIT_REACHED' } })
    expect(denied.state).toBe(state)
  })

  it('合拍冻结形象快照，后续改造型不改旧照片，并允许单独删除合拍', () => {
    const initial = createInitialGameState({ now: 0, seed: 'wardrobe-photo' })
    const withPostcard: GameState = {
      ...initial,
      collections: {
        [postcardId]: { id: postcardId, firstObtainedAt: 100, duplicateCount: 0 },
      },
    }
    const firstLook: WardrobeElement[] = [
      { placementId: 'cape-0', assetId: 'cream-apple-cape', ...transform(0) },
    ]
    const elementWithExtraField = {
      ...firstLook[0],
      assetUrl: 'data:image/png;base64,should-not-persist',
    }
    const saved = successful(
      reduceWardrobe(
        withPostcard,
        {
          type: 'wardrobe/look-create',
          targetId: 'bingo',
          name: '苹果披肩',
          elements: [elementWithExtraField],
          now: 200,
        },
        catalog,
      ),
    )
    const lookEffect = saved.effects[0]
    if (lookEffect?.type !== 'wardrobe-look-created') throw new Error('没有创建合拍造型')
    const lookId = lookEffect.look.lookId
    expect(saved.state.wardrobe.looks[lookId].elements[0]).not.toHaveProperty('assetUrl')
    const participantWithExtraField = {
      targetId: 'bingo' as const,
      lookId,
      ...transform(0),
      assetUrl: 'data:image/png;base64,should-not-persist',
    }
    const created = successful(
      reduceWardrobe(
        saved.state,
        {
          type: 'wardrobe/photo-create',
          postcardId,
          participants: [participantWithExtraField],
          now: 300,
        },
        catalog,
      ),
    )
    const photoEffect = created.effects[0]
    if (photoEffect?.type !== 'wardrobe-photo-created') throw new Error('没有生成合拍')
    const photoId = photoEffect.photo.photoId
    expect(created.state.wardrobe.photos[photoId].participants[0].elements).toEqual(firstLook)
    expect(created.state.wardrobe.photos[photoId].participants[0].sourceLookId).toBe(lookId)
    expect(created.state.wardrobe.photos[photoId].participants[0]).not.toHaveProperty('assetUrl')
    expect(gameStateSchema.safeParse(created.state).success).toBe(true)

    const changed = successful(
      reduceWardrobe(
        created.state,
        {
          type: 'wardrobe/look-update',
          lookId,
          name: '轻装',
          elements: [],
          now: 400,
        },
        catalog,
      ),
    )
    expect(changed.state.wardrobe.looks[lookId].elements).toEqual([])
    expect(changed.state.wardrobe.photos[photoId].participants[0].elements).toEqual(firstLook)

    const lookDeleted = successful(
      reduceWardrobe(changed.state, { type: 'wardrobe/look-delete', lookId }, catalog),
    )
    expect(lookDeleted.state.wardrobe.looks[lookId]).toBeUndefined()
    expect(lookDeleted.state.wardrobe.photos[photoId].participants[0].elements).toEqual(firstLook)
    expect(gameStateSchema.safeParse(lookDeleted.state).success).toBe(true)

    const deleted = successful(
      reduceWardrobe(lookDeleted.state, { type: 'wardrobe/photo-delete', photoId }, catalog),
    )
    expect(deleted.state.wardrobe.photos).toEqual({})
    expect(deleted.state.wardrobe.looks).toEqual({})
    expect(deleted.state.wardrobe.ownedAssetIds).toEqual(initial.wardrobe.ownedAssetIds)
  })

  it('合拍可以只让已遇见好友出镜，并拒绝选择其他角色的造型', () => {
    const initial = createInitialGameState({ now: 0, seed: 'wardrobe-friend-photo' })
    const ready: GameState = {
      ...initial,
      collections: {
        [postcardId]: { id: postcardId, firstObtainedAt: 1, duplicateCount: 0 },
      },
      friends: { 'class-representative-bing': friendEntry('class-representative-bing') },
    }
    const bingoLook = successful(
      reduceWardrobe(
        ready,
        {
          type: 'wardrobe/look-create',
          targetId: 'bingo',
          name: '饼狗造型',
          elements: [],
          now: 10,
        },
        catalog,
      ),
    )
    const bingoEffect = bingoLook.effects[0]
    if (bingoEffect?.type !== 'wardrobe-look-created') throw new Error('没有创建饼狗造型')
    const mismatch = reduceWardrobe(
      bingoLook.state,
      {
        type: 'wardrobe/photo-create',
        postcardId,
        participants: [
          {
            targetId: 'class-representative-bing',
            lookId: bingoEffect.look.lookId,
            ...transform(0),
          },
        ],
        now: 20,
      },
      catalog,
    )
    expect(mismatch).toMatchObject({
      ok: false,
      error: { code: 'WARDROBE_LOOK_TARGET_MISMATCH' },
    })

    const friendLook = successful(
      reduceWardrobe(
        bingoLook.state,
        {
          type: 'wardrobe/look-create',
          targetId: 'class-representative-bing',
          name: '课代饼造型',
          elements: [],
          now: 30,
        },
        catalog,
      ),
    )
    const friendEffect = friendLook.effects[0]
    if (friendEffect?.type !== 'wardrobe-look-created') throw new Error('没有创建好友造型')
    const created = successful(
      reduceWardrobe(
        friendLook.state,
        {
          type: 'wardrobe/photo-create',
          postcardId,
          participants: [
            {
              targetId: 'class-representative-bing',
              lookId: friendEffect.look.lookId,
              ...transform(0),
            },
          ],
          now: 40,
        },
        catalog,
      ),
    )
    const photoEffect = created.effects[0]
    if (photoEffect?.type !== 'wardrobe-photo-created') throw new Error('没有生成好友合拍')
    expect(photoEffect.photo.participants.map((participant) => participant.targetId)).toEqual([
      'class-representative-bing',
    ])
  })

  it('合拍至少需要一位角色，但不强制饼狗出镜', () => {
    const initial = createInitialGameState({ now: 0, seed: 'wardrobe-empty-photo' })
    const ready: GameState = {
      ...initial,
      collections: {
        [postcardId]: { id: postcardId, firstObtainedAt: 1, duplicateCount: 0 },
      },
    }
    const rejected = reduceWardrobe(
      ready,
      {
        type: 'wardrobe/photo-create',
        postcardId,
        participants: [],
        now: 10,
      },
      catalog,
    )
    expect(rejected).toMatchObject({
      ok: false,
      error: { code: 'WARDROBE_PARTICIPANTS_INVALID' },
    })
    expect(rejected.state).toBe(ready)

    const imported = structuredClone(ready)
    imported.wardrobe.photos['photo-0-x'] = {
      photoId: 'photo-0-x',
      postcardId,
      participants: [],
      createdAt: 10,
    }
    expect(gameStateSchema.safeParse(imported).success).toBe(false)
  })

  it('DEBUG 清空恢复初始衣服并删除造型，但保留历史合拍快照', () => {
    const initial = createInitialGameState({ now: 0, seed: 'wardrobe-debug-clear', debug: true })
    const collected = successful(
      reduceGame(initial, { type: 'debug/collect-all', now: 10 }, catalog),
    ).state
    const assetId = WARDROBE_ASSET_IDS.find((candidate) => candidate !== 'cream-apple-cape')!
    const lookCreated = successful(
      reduceGame(
        collected,
        {
          type: 'wardrobe/look-create',
          targetId: 'bingo',
          name: '清空前造型',
          elements: [{ placementId: 'debug-item', assetId, ...transform(0) }],
          now: 20,
        },
        catalog,
      ),
    )
    const lookEffect = lookCreated.effects[0]
    if (lookEffect?.type !== 'wardrobe-look-created') throw new Error('没有创建调试造型')
    const photoCreated = successful(
      reduceGame(
        lookCreated.state,
        {
          type: 'wardrobe/photo-create',
          postcardId,
          participants: [{ targetId: 'bingo', lookId: lookEffect.look.lookId, ...transform(0) }],
          now: 30,
        },
        catalog,
      ),
    )
    const photoEffect = photoCreated.effects[0]
    if (photoEffect?.type !== 'wardrobe-photo-created') throw new Error('没有创建调试合拍')

    const cleared = successful(
      reduceGame(photoCreated.state, { type: 'debug/clear-all', now: 40 }, catalog),
    ).state
    expect(cleared.wardrobe.ownedAssetIds).toEqual(['cream-apple-cape'])
    expect(cleared.wardrobe.shop.assetIds).toHaveLength(3)
    expect(
      cleared.wardrobe.shop.assetIds.every(
        (shopAssetId) => !cleared.wardrobe.ownedAssetIds.includes(shopAssetId),
      ),
    ).toBe(true)
    expect(cleared.wardrobe.looks).toEqual({})
    expect(cleared.wardrobe.photos[photoEffect.photo.photoId]).toMatchObject({
      postcardId: null,
      participants: [{ sourceLookId: lookEffect.look.lookId, elements: [{ assetId }] }],
    })
    expect(gameStateSchema.safeParse(cleared).success).toBe(true)
  })

  it('游戏日推进时与任务板同次刷新商店，普通 clock/tick 不刷新', () => {
    const initial = createInitialGameState({ now: 0, seed: 'wardrobe-day' })
    const beforeShop = initial.wardrobe.shop
    const ticked = successful(reduceGame(initial, { type: 'clock/tick', now: 1_000 }, catalog))
    expect(ticked.state.wardrobe.shop).toBe(beforeShop)

    const started = successful(
      reduceGame(ticked.state, { type: 'activity/start', kind: 'rest', now: 2_000 }, catalog),
    )
    const run = started.state.activeActivity!
    const claimed = successful(
      reduceGame(
        started.state,
        { type: 'activity/claim', runId: run.runId, now: run.endsAt },
        catalog,
      ),
    )
    expect(claimed.state.profile.companionDays).toBe(1)
    expect(claimed.state.economy.apples).toBe(initial.economy.apples)
    expect(claimed.state.wardrobe.shop).toEqual({
      companionDay: 1,
      assetIds: generateWardrobeShop(initial.random.seed, 1, initial.wardrobe.ownedAssetIds),
    })
    expect(claimed.state.wardrobe.shop.assetIds).toHaveLength(3)
    expect(
      claimed.state.wardrobe.shop.assetIds.every(
        (assetId) => !claimed.state.wardrobe.ownedAssetIds.includes(assetId),
      ),
    ).toBe(true)
  })

  it('DEBUG 全收集后新游戏日保持空店，清空时同日按初始衣服强制重建商店', () => {
    const initial = createInitialGameState({ now: 0, seed: 'wardrobe-debug-shop', debug: true })
    const collected = successful(
      reduceGame(initial, { type: 'debug/collect-all', now: 10 }, catalog),
    ).state
    expect(collected.wardrobe.shop.assetIds).toEqual([])
    expect(gameStateSchema.safeParse(collected).success).toBe(true)

    const started = successful(
      reduceGame(collected, { type: 'activity/start', kind: 'rest', now: 20 }, catalog),
    )
    const run = started.state.activeActivity!
    const nextDay = successful(
      reduceGame(
        started.state,
        { type: 'activity/claim', runId: run.runId, now: run.endsAt },
        catalog,
      ),
    ).state
    expect(nextDay.profile.companionDays).toBe(1)
    expect(nextDay.wardrobe.shop).toEqual({ companionDay: 1, assetIds: [] })
    expect(gameStateSchema.safeParse(nextDay).success).toBe(true)

    const cleared = successful(
      reduceGame(nextDay, { type: 'debug/clear-all', now: run.endsAt + 1 }, catalog),
    ).state
    expect(cleared.wardrobe.ownedAssetIds).toEqual(['cream-apple-cape'])
    expect(cleared.wardrobe.shop).toEqual({
      companionDay: 1,
      assetIds: generateWardrobeShop(initial.random.seed, 1, ['cream-apple-cape']),
    })
    expect(cleared.wardrobe.shop.assetIds).toHaveLength(3)
    expect(gameStateSchema.safeParse(cleared).success).toBe(true)
  })

  it('最大相册仍能装入 1 MiB .bingo 存档，且不包含图片数据', async () => {
    const initial = createInitialGameState({ now: 0, seed: 'wardrobe-size', debug: true })
    const allFriends = Object.fromEntries(
      [
        'class-representative-bing',
        'san-hao-rabbit',
        'xin-hao-rabbit',
        'signal-dog',
        'bili-bing',
      ].map((id) => [
        id,
        { id, firstMetAt: 1, lastMetAt: 1, encounterCount: 1, totalGiftApples: 0 },
      ]),
    ) as GameState['friends']
    const targets: WardrobeTargetId[] = [
      'bingo',
      'class-representative-bing',
      'san-hao-rabbit',
      'xin-hao-rabbit',
      'signal-dog',
      'bili-bing',
    ]
    const elements = Array.from({ length: MAX_WARDROBE_LOOK_ELEMENTS }, (_, index) => ({
      placementId: `cape-${index}`,
      assetId: WARDROBE_ASSET_IDS[index % WARDROBE_ASSET_IDS.length] as WardrobeAssetId,
      ...transform(index),
    }))
    const looks = Object.fromEntries(
      targets.flatMap((targetId, targetIndex) =>
        Array.from({ length: MAX_WARDROBE_LOOKS_PER_TARGET }, (_, lookIndex) => {
          const sequence = targetIndex * MAX_WARDROBE_LOOKS_PER_TARGET + lookIndex
          const lookId = `look-${sequence.toString(36)}-x`
          return [
            lookId,
            {
              lookId,
              targetId,
              name: `造型${sequence + 1}`,
              elements,
              createdAt: 100 + sequence,
              updatedAt: 100 + sequence,
            },
          ]
        }),
      ),
    )
    const participants: WardrobePhotoParticipant[] = targets.map((targetId, index) => ({
      targetId,
      sourceLookId: `look-${(index * MAX_WARDROBE_LOOKS_PER_TARGET).toString(36)}-x`,
      ...transform(index),
      elements,
    }))
    const photos = Object.fromEntries(
      Array.from({ length: MAX_WARDROBE_PHOTOS }, (_, index) => {
        const photoId = `photo-${index.toString(36)}-x`
        return [photoId, { photoId, postcardId, participants, createdAt: 1_000 + index }]
      }),
    )
    const full: GameState = {
      ...initial,
      collections: {
        [postcardId]: { id: postcardId, firstObtainedAt: 1, duplicateCount: 0 },
      },
      friends: allFriends,
      wardrobe: {
        ...initial.wardrobe,
        ownedAssetIds: [...WARDROBE_ASSET_IDS],
        nextLookSequence: targets.length * MAX_WARDROBE_LOOKS_PER_TARGET,
        looks,
        nextPhotoSequence: MAX_WARDROBE_PHOTOS,
        photos,
      },
    }
    expect(gameStateSchema.safeParse(full).success).toBe(true)

    const exported = await createBingoSave(
      { gameVersion: '0.10.0', payload: full, exportedAt: 2_000 },
      gameStateSchema,
      { subtle: webcrypto.subtle as SubtleCrypto },
    )
    expect(exported.byteLength).toBeLessThan(MAX_BINGO_SAVE_BYTES)
    expect(exported.text).not.toMatch(/data:image|blob:|assets\//u)
  })
})
