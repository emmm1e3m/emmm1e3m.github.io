import { describe, expect, it } from 'vitest'

import {
  addProbabilityBonus,
  APPLE_LUNCHBOX_FRIEND_BONUS,
  LUCKY_APPLE_COLLECTION_DROP_BONUS,
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
  friend: 0,
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
          : 'trend-toolbox',
    usedLuckyApple: false,
    probabilities: certainDrop,
  })
}

function seedWhoseRollIsBelow(limit: number, rollIndex: number): string {
  for (let index = 0; index < 10_000; index += 1) {
    const seed = `bonus-boundary-${rollIndex}-${index}`
    let cursor = createRandomCursor(seed)
    let value = 0
    for (let roll = 0; roll <= rollIndex; roll += 1) {
      const next = nextRandom(cursor)
      cursor = next.cursor
      value = next.value
    }
    if (value < limit) return seed
  }
  throw new Error(`没有找到小于 ${limit} 的第 ${rollIndex + 1} 次随机值`)
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

  it('幸运苹果把 0% 收藏概率提高 20 个百分点，未使用时仍为 0%', () => {
    const rewardSeed = seedWhoseRollIsBelow(LUCKY_APPLE_COLLECTION_DROP_BONUS, 0)
    const input = {
      kind: 'stream' as const,
      rewardSeed,
      catalog,
      ownedCollectionIds: new Set<string>(),
      supplyId: 'signal-headphones' as const,
      probabilities: { postcard: 0, millionShot: 0, siteFirst: 0, friend: 0 },
    }

    expect(planActivityReward({ ...input, usedLuckyApple: false }).collection).toBeNull()
    expect(planActivityReward({ ...input, usedLuckyApple: true }).collection).toMatchObject({
      category: 'million-shot',
    })
  })

  it('苹果旅行便当把 0% 遇友概率提高 15 个百分点，普通便当没有加成', () => {
    // 旅行先判定收藏；收藏概率为 0 时，第二次随机值就是朋友事件判定。
    const rewardSeed = seedWhoseRollIsBelow(APPLE_LUNCHBOX_FRIEND_BONUS, 1)
    const input = {
      kind: 'travel' as const,
      rewardSeed,
      catalog,
      ownedCollectionIds: new Set<string>(),
      usedLuckyApple: false,
      probabilities: { postcard: 0, millionShot: 0, siteFirst: 0, friend: 0 },
    }

    expect(planActivityReward({ ...input, supplyId: 'travel-basic' }).friendEventId).toBeNull()
    expect(planActivityReward({ ...input, supplyId: 'travel-apple' }).friendEventId).not.toBeNull()
  })

  it('单次概率加成在边界精确相加，并统一封顶为 100%', () => {
    expect(addProbabilityBonus(0, 0)).toBe(0)
    expect(addProbabilityBonus(0, LUCKY_APPLE_COLLECTION_DROP_BONUS)).toBe(0.2)
    expect(addProbabilityBonus(0, APPLE_LUNCHBOX_FRIEND_BONUS)).toBe(0.15)
    expect(addProbabilityBonus(0.8, LUCKY_APPLE_COLLECTION_DROP_BONUS)).toBe(1)
    expect(addProbabilityBonus(0.9, LUCKY_APPLE_COLLECTION_DROP_BONUS)).toBe(1)
    expect(addProbabilityBonus(0.85, APPLE_LUNCHBOX_FRIEND_BONUS)).toBe(1)
    expect(addProbabilityBonus(0.95, APPLE_LUNCHBOX_FRIEND_BONUS)).toBe(1)
  })
})
