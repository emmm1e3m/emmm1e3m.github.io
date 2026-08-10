import { describe, expect, it } from 'vitest'

import {
  addNonStackingBaseProbabilityBonus,
  APPLE_LUNCHBOX_FRIEND_BASE_BONUS_RATE,
  FRIEND_GIFT_APPLES_BY_ID,
  FRIEND_GIFT_ITEM_BY_ID,
  LUCKY_APPLE_COLLECTION_BASE_BONUS_RATE,
  multiplyProbability,
  REST_COMPLETION_APPLES,
  TRAVEL_FRIEND_GIFT_APPLES_BY_ID,
} from '../game/gameBalance'
import type { ActivityKind, CollectionCatalog } from '../game/types'
import { planActivityReward } from './planReward'
import { createRandomCursor, nextRandom } from './prng'

const siteFirstChronology = [
  'site-first-dynamite',
  'site-first-talk-worthy-talk-dirty',
  'site-first-make-a-wish',
  'site-first-dawn-in-my-soul',
  'site-first-yuan-yu-chou',
  'site-first-xi',
  'site-first-hey-mama',
  'site-first-power',
] as const

const catalog: CollectionCatalog = {
  postcard: ['postcard-a', 'postcard-b', 'postcard-c'],
  'million-shot': ['million-a', 'million-b', 'million-c'],
  // 故意使用与时间无关的排列，证明领域层只读取受控 chronology。
  'site-first': [
    'site-first-power',
    'site-first-xi',
    'site-first-dynamite',
    'site-first-hey-mama',
    'site-first-yuan-yu-chou',
    'site-first-dawn-in-my-soul',
    'site-first-talk-worthy-talk-dirty',
    'site-first-make-a-wish',
  ],
  siteFirstChronology,
}

const certainDrop = {
  postcard: 1,
  millionShot: 1,
  siteFirst: 1,
  travelFriend: 0,
  musicFriend: 0,
} as const

function plan(
  kind: ActivityKind,
  ownedCollectionIds: ReadonlySet<string>,
  rewardSeed: string,
  targetCatalog = catalog,
) {
  return planActivityReward({
    kind,
    rewardSeed,
    catalog: targetCatalog,
    ownedCollectionIds,
    supplyId:
      kind === 'travel'
        ? 'travel-basic'
        : kind === 'stream'
          ? 'signal-headphones'
          : kind === 'trend'
            ? 'trend-toolbox'
            : null,
    usedLuckyApple: false,
    probabilities: certainDrop,
  })
}

function seedWhoseRollIsBetween(minimum: number, maximum: number, rollIndex: number): string {
  for (let index = 0; index < 10_000; index += 1) {
    const seed = `multiplier-boundary-${rollIndex}-${index}`
    let cursor = createRandomCursor(seed)
    let value = 0
    for (let roll = 0; roll <= rollIndex; roll += 1) {
      const next = nextRandom(cursor)
      cursor = next.cursor
      value = next.value
    }
    if (value >= minimum && value < maximum) return seed
  }
  throw new Error(`没有找到位于 [${minimum}, ${maximum}) 的第 ${rollIndex + 1} 次随机值`)
}

describe('收藏奖励无重复规则', () => {
  it.each([['travel', 'postcard'] as const, ['stream', 'million-shot'] as const])(
    '%s 只在尚未拥有的 %s 中随机选择，收齐后停止',
    (kind, category) => {
      const owned = new Set<string>()
      for (let index = 0; index < catalog[category].length; index += 1) {
        const reward = plan(kind, owned, `${kind}-${index}`)
        expect(reward.collection?.category).toBe(category)
        expect(reward.collection && owned.has(reward.collection.id)).toBe(false)
        owned.add(reward.collection!.id)
      }

      expect(owned).toEqual(new Set(catalog[category]))
      expect(plan(kind, owned, `${kind}-complete`).collection).toBeNull()
    },
  )

  it('明信片与百万直拍不是固定取首项，不同持久种子能选择不同未拥有项', () => {
    for (const kind of ['travel', 'stream'] as const) {
      const selected = new Set(
        Array.from(
          { length: 40 },
          (_, index) => plan(kind, new Set(), `${kind}-random-${index}`).collection?.id,
        ),
      )
      expect(selected.size).toBeGreaterThan(1)
    }
  })

  it('全站第一严格按 Dynamite 到 Power 的旧到新顺序领取', () => {
    const owned = new Set<string>()
    const received: string[] = []
    for (let index = 0; index < siteFirstChronology.length; index += 1) {
      const reward = plan('trend', owned, `site-first-${index}`)
      received.push(reward.collection!.id)
      owned.add(reward.collection!.id)
    }

    expect(received).toEqual(siteFirstChronology)
    expect(received[0]).toBe('site-first-dynamite')
    expect(received.at(-1)).toBe('site-first-power')
    expect(plan('trend', owned, 'site-first-complete').collection).toBeNull()
  })

  it('概率命中但类别已收齐时结果为空，不会重新开启重复循环', () => {
    const allOwned = new Set([
      ...catalog.postcard,
      ...catalog['million-shot'],
      ...catalog['site-first'],
    ])
    expect(plan('travel', allOwned, 'full-postcard').collection).toBeNull()
    expect(plan('stream', allOwned, 'full-million').collection).toBeNull()
    expect(plan('trend', allOwned, 'full-first').collection).toBeNull()
  })

  it('旧存档面对扩充目录时，会把新增 ID 当成未拥有项', () => {
    const expanded: CollectionCatalog = {
      postcard: ['postcard-old-a', 'postcard-old-b', 'postcard-new'],
      'million-shot': ['million-old-a', 'million-old-b', 'million-new'],
      'site-first': ['first-old-a', 'first-old-b', 'first-new'],
      siteFirstChronology: ['first-old-a', 'first-old-b', 'first-new'],
    }

    expect(
      plan('travel', new Set(['postcard-old-a', 'postcard-old-b']), 'expanded-postcard', expanded)
        .collection?.id,
    ).toBe('postcard-new')
    expect(
      plan('stream', new Set(['million-old-a', 'million-old-b']), 'expanded-million', expanded)
        .collection?.id,
    ).toBe('million-new')
    expect(
      plan('trend', new Set(['first-old-a', 'first-old-b']), 'expanded-first', expanded).collection
        ?.id,
    ).toBe('first-new')
  })

  it('幸运苹果在 10% 常规收藏概率上增加 100% 的基础值', () => {
    const rewardSeed = seedWhoseRollIsBetween(0.1, 0.2, 0)
    const input = {
      kind: 'stream' as const,
      rewardSeed,
      catalog,
      ownedCollectionIds: new Set<string>(),
      supplyId: 'signal-headphones' as const,
      probabilities: {
        postcard: 0,
        millionShot: 0.1,
        siteFirst: 0,
        travelFriend: 0,
        musicFriend: 0,
      },
    }

    expect(planActivityReward({ ...input, usedLuckyApple: false }).collection).toBeNull()
    expect(planActivityReward({ ...input, usedLuckyApple: true }).collection).toMatchObject({
      category: 'million-shot',
    })
  })

  it('苹果旅行便当在 10% 常规遇友概率上增加 100% 的基础值', () => {
    const rewardSeed = seedWhoseRollIsBetween(0.1, 0.2, 0)
    const input = {
      kind: 'travel' as const,
      rewardSeed,
      catalog,
      ownedCollectionIds: new Set<string>(),
      usedLuckyApple: false,
      probabilities: {
        postcard: 0,
        millionShot: 0,
        siteFirst: 0,
        travelFriend: 0.1,
        musicFriend: 0,
      },
    }

    expect(planActivityReward({ ...input, supplyId: 'travel-basic' }).friendId).toBeNull()
    expect(planActivityReward({ ...input, supplyId: 'travel-apple' }).friendId).not.toBeNull()
  })

  it('苹果旅行便当不会让 0% 常规遇友概率凭空提高', () => {
    const reward = planActivityReward({
      kind: 'travel',
      rewardSeed: 'zero-friend-chance',
      catalog,
      ownedCollectionIds: new Set(),
      supplyId: 'travel-apple',
      usedLuckyApple: false,
      probabilities: { ...certainDrop, travelFriend: 0 },
    })

    expect(reward.friendId).toBeNull()
  })

  it('旅行先判朋友，命中后与明信片严格互斥并规划确定性道具', () => {
    const reward = planActivityReward({
      kind: 'travel',
      rewardSeed: 'travel-mutual-exclusion',
      catalog,
      ownedCollectionIds: new Set(),
      supplyId: 'travel-basic',
      usedLuckyApple: true,
      probabilities: {
        postcard: 1,
        millionShot: 1,
        siteFirst: 1,
        travelFriend: 1,
        musicFriend: 1,
      },
    })

    expect(reward.friendId).not.toBeNull()
    expect(reward.collection).toBeNull()
    expect(reward.giftItemId).toBe(FRIEND_GIFT_ITEM_BY_ID[reward.friendId!])
    expect(reward.modifierApples).toBe(TRAVEL_FRIEND_GIFT_APPLES_BY_ID[reward.friendId!])
    expect(TRAVEL_FRIEND_GIFT_APPLES_BY_ID).toEqual({
      'class-representative-bing': 2,
      'san-hao-rabbit': 3,
      'xin-hao-rabbit': 4,
      'signal-dog': 3,
      'bili-bing': 2,
    })
  })

  it('音乐只会召来已经认识的朋友并按身份固定赠送苹果', () => {
    const none = planActivityReward({
      kind: 'music',
      rewardSeed: 'music-no-friends',
      catalog,
      ownedCollectionIds: new Set(),
      knownFriendIds: new Set(),
      supplyId: null,
      usedLuckyApple: false,
      probabilities: { ...certainDrop, musicFriend: 1 },
    })
    expect(none.friendId).toBeNull()
    expect(none.modifierApples).toBe(0)

    const knownButNoVisit = planActivityReward({
      kind: 'music',
      rewardSeed: 'music-known-but-zero-chance',
      catalog,
      ownedCollectionIds: new Set(),
      knownFriendIds: new Set(['signal-dog']),
      supplyId: null,
      usedLuckyApple: false,
      probabilities: { ...certainDrop, musicFriend: 0 },
    })
    expect(knownButNoVisit.friendId).toBeNull()
    expect(knownButNoVisit.modifierApples).toBe(0)

    const known = new Set(['signal-dog'] as const)
    const visit = planActivityReward({
      kind: 'music',
      rewardSeed: 'music-known-friend',
      catalog,
      ownedCollectionIds: new Set(),
      knownFriendIds: known,
      supplyId: null,
      usedLuckyApple: false,
      probabilities: { ...certainDrop, musicFriend: 1 },
    })
    expect(visit.friendId).toBe('signal-dog')
    expect(visit.modifierApples).toBe(FRIEND_GIFT_APPLES_BY_ID['signal-dog'])
    expect(visit.giftItemId).toBeNull()
  })

  it('音乐遇友概率为每位已认识朋友 15%，按人数累加并封顶', () => {
    const rewardSeed = seedWhoseRollIsBetween(0.15, 0.3, 0)
    const input = {
      kind: 'music' as const,
      rewardSeed,
      catalog,
      ownedCollectionIds: new Set<string>(),
      supplyId: null,
      usedLuckyApple: false,
      probabilities: { ...certainDrop, musicFriend: 0.15 },
    }

    expect(
      planActivityReward({ ...input, knownFriendIds: new Set(['signal-dog']) }).friendId,
    ).toBeNull()
    expect(
      planActivityReward({
        ...input,
        knownFriendIds: new Set(['signal-dog', 'bili-bing']),
      }).friendId,
    ).not.toBeNull()
    const expectedChances = [0, 0.15, 0.3, 0.45, 0.6, 0.75]
    expectedChances.forEach((expected, knownFriendCount) => {
      expect(multiplyProbability(0.15, knownFriendCount)).toBeCloseTo(expected)
    })
    expect(multiplyProbability(0.3, 5)).toBe(1)
  })

  it('音乐好友新赠礼让后期成为主要经济来源，五人目录平均每次期望 4.2 个苹果', () => {
    const gifts = Object.values(FRIEND_GIFT_APPLES_BY_ID)
    expect(gifts).toEqual([4, 6, 8, 6, 4])
    const averageGift = gifts.reduce((total, gift) => total + gift, 0) / gifts.length
    expect(averageGift).toBe(5.6)

    const expectedApplesByKnownFriendCount = [0, 0.84, 1.68, 2.52, 3.36, 4.2]
    expectedApplesByKnownFriendCount.forEach((expected, knownFriendCount) => {
      const encounterChance = multiplyProbability(0.15, knownFriendCount)
      expect(encounterChance * averageGift).toBeCloseTo(expected)
    })
  })

  it('旅行未遇友时，幸运苹果在 10% 明信片概率上增加 100% 的基础值', () => {
    const rewardSeed = seedWhoseRollIsBetween(0.1, 0.2, 1)
    const reward = planActivityReward({
      kind: 'travel',
      rewardSeed,
      catalog,
      ownedCollectionIds: new Set(),
      supplyId: 'travel-basic',
      usedLuckyApple: true,
      probabilities: {
        postcard: 0.1,
        millionShot: 0,
        siteFirst: 0,
        travelFriend: 0,
        musicFriend: 0,
      },
    })

    expect(reward.friendId).toBeNull()
    expect(reward.collection).toMatchObject({ category: 'postcard' })
  })

  it('睡觉奖励固定一个苹果且不产生收藏或朋友', () => {
    const reward = planActivityReward({
      kind: 'rest',
      rewardSeed: 'rest-fixed',
      catalog,
      ownedCollectionIds: new Set(),
      supplyId: null,
      usedLuckyApple: false,
      probabilities: certainDrop,
    })
    expect(reward).toMatchObject({
      baseApples: REST_COMPLETION_APPLES,
      modifierApples: 0,
      collection: null,
      friendId: null,
      giftItemId: null,
    })
  })

  it('便当与幸运苹果都增加一份基础概率，同类效果不叠加并封顶 100%', () => {
    expect(addNonStackingBaseProbabilityBonus(0)).toBe(0)
    expect(addNonStackingBaseProbabilityBonus(0.1, APPLE_LUNCHBOX_FRIEND_BASE_BONUS_RATE)).toBe(0.2)
    expect(addNonStackingBaseProbabilityBonus(0.3, LUCKY_APPLE_COLLECTION_BASE_BONUS_RATE)).toBe(
      0.6,
    )
    expect(
      addNonStackingBaseProbabilityBonus(
        0.3,
        APPLE_LUNCHBOX_FRIEND_BASE_BONUS_RATE,
        LUCKY_APPLE_COLLECTION_BASE_BONUS_RATE,
      ),
    ).toBe(0.6)
    expect(addNonStackingBaseProbabilityBonus(0.8, 1)).toBe(1)
  })
})
